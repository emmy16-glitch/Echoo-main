import base64
import asyncio
import binascii
import hmac
import logging
import os
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect, status

from model_loader import model_runtime, quality_model_runtime
from whisper_worker import AudioFrame, FRAME_BYTES, StreamingTranscriptSession

logger = logging.getLogger("echoo-whisper.websocket")
_sessions: dict[str, dict[str, Any]] = {}
_session_lock = asyncio.Lock()
_reconnect_grace_seconds = max(10, min(300, int(os.getenv("WHISPER_RECONNECT_GRACE_SECONDS", "60"))))


async def _expire_session(session_id: str, generation: int) -> None:
    await asyncio.sleep(_reconnect_grace_seconds)
    async with _session_lock:
        current = _sessions.get(session_id)
        if current and current["generation"] == generation:
            _sessions.pop(session_id, None)
            logger.info("expired disconnected transcription session", extra={"sessionId": session_id})


def _authorized(websocket: WebSocket) -> bool:
    expected = os.getenv("WHISPER_FLOW_API_KEY", "").strip()
    authorization = websocket.headers.get("authorization", "")
    supplied = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    return bool(expected and supplied and hmac.compare_digest(expected, supplied))


def _required_string(message: dict[str, Any], name: str, maximum: int = 160) -> str:
    value = str(message.get(name, "")).strip()
    if not value or len(value) > maximum:
        raise ValueError(f"Invalid {name}")
    return value


async def transcription_websocket(websocket: WebSocket) -> None:
    if not _authorized(websocket):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized")
        return
    await websocket.accept()
    session = None
    session_id = None
    generation = 0
    flushed = False
    try:
        start = await websocket.receive_json()
        if start.get("type") != "start":
            raise ValueError("The first message must start a transcription session")
        broadcast_id = _required_string(start, "broadcastId")
        session_id = _required_string(start, "sessionId")
        language = str(start.get("language") or os.getenv("WHISPER_LANGUAGE", "en")).strip()[:16] or "en"
        quality_pass = bool(start.get("qualityPass"))

        async def emit(payload: dict) -> None:
            await websocket.send_json(payload)

        async with _session_lock:
            existing = _sessions.get(session_id)
            if existing and existing["session"].broadcast_id != broadcast_id:
                raise ValueError("Transcript session belongs to another broadcast")
            if existing:
                session = existing["session"]
                session.set_emitter(emit)
                generation = existing["generation"] + 1
            else:
                session = StreamingTranscriptSession(
                    broadcast_id=broadcast_id,
                    session_id=session_id,
                    language=language,
                    model=quality_model_runtime if quality_pass else model_runtime,
                    emit=emit,
                    quality_pass=quality_pass,
                )
                generation = 1
            _sessions[session_id] = {"session": session, "generation": generation}
        await websocket.send_json({
            "type": "ready",
            "broadcastId": broadcast_id,
            "sessionId": session_id,
            "model": (quality_model_runtime if quality_pass else model_runtime).model_name,
            "sampleRate": 16000,
            "lastSequence": session.last_sequence,
        })

        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")
            if message_type == "audio":
                if message.get("broadcastId") != broadcast_id or message.get("sessionId") != session_id:
                    raise ValueError("Audio packet session mismatch")
                sequence = int(message.get("sequence", -1))
                timestamp_ms = int(message.get("timestamp", -1))
                if sequence < 0 or timestamp_ms < 0:
                    raise ValueError("Invalid audio sequence or timestamp")
                try:
                    pcm = base64.b64decode(message.get("audioChunk", ""), validate=True)
                except (binascii.Error, ValueError) as error:
                    raise ValueError("Invalid base64 PCM audio") from error
                if len(pcm) != FRAME_BYTES:
                    raise ValueError(f"PCM packet must contain {FRAME_BYTES} bytes")
                await session.push(AudioFrame(sequence=sequence, timestamp_ms=timestamp_ms, pcm=pcm))
                if sequence == 0 or sequence % 500 == 0:
                    logger.info(
                        "PCM frame received",
                        extra={
                            "broadcastId": broadcast_id,
                            "sessionId": session_id,
                            "sequence": sequence,
                            "bytes": len(pcm),
                        },
                    )
                await websocket.send_json({"type": "ack", "sequence": sequence})
            elif message_type == "flush":
                await session.flush()
                await websocket.send_json({
                    "type": "flushed",
                    "sessionId": session_id,
                    "lastSequence": session.last_sequence,
                    "droppedFrames": session.dropped_frames,
                })
                flushed = True
                async with _session_lock:
                    current = _sessions.get(session_id)
                    if current and current["generation"] == generation:
                        _sessions.pop(session_id, None)
            elif message_type == "ping":
                await websocket.send_json({"type": "pong"})
            else:
                raise ValueError("Unsupported message type")
    except WebSocketDisconnect:
        logger.info("transcription client disconnected")
    except ValueError as error:
        logger.warning("rejected transcription message: %s", error)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason=str(error)[:120])
    except Exception:
        logger.exception("transcription session failed")
        try:
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR, reason="Transcription failed")
        except RuntimeError:
            pass
    finally:
        if session_id and session and not flushed:
            asyncio.create_task(_expire_session(session_id, generation))
