import asyncio
import logging
import math
import os
import time
from dataclasses import dataclass
from typing import Awaitable, Callable

import numpy as np

from model_loader import TranscriptResult

logger = logging.getLogger("echoo-whisper.worker")
SAMPLE_RATE = 16000
FRAME_SAMPLES = 320
FRAME_BYTES = FRAME_SAMPLES * 2
FRAME_DURATION_MS = 20


def _env_int(name: str, fallback: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(fallback)))
    except ValueError:
        value = fallback
    return max(minimum, min(maximum, value))


def _env_bool(name: str, fallback: bool = True) -> bool:
    value = os.getenv(name)
    if value is None:
        return fallback
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class AudioFrame:
    sequence: int
    timestamp_ms: int
    pcm: bytes


@dataclass(frozen=True)
class QualityChunk:
    segment_id: str
    pcm: bytes
    start_ms: int
    end_ms: int
    last_sequence: int
    provider_revision: int
    fast_result: TranscriptResult


class StreamingTranscriptSession:
    """Turns acknowledged 20 ms PCM frames into revisable utterance segments.

    Echoo deliberately has two transcription passes over the same post-master
    program feed:
      1. a low-latency draft pass for continuous progress while live;
      2. a slower background verification pass over each finalized PCM chunk.

    The quality pass starts while the broadcast is still running. It never
    modifies audio; it only decides the final draft text/timing persisted for
    creator review. A quality failure falls back to the fast result so a replay
    transcript is never lost just because the second pass is unavailable.
    """

    def __init__(
        self,
        *,
        broadcast_id: str,
        session_id: str,
        language: str,
        model,
        quality_model,
        emit: Callable[[dict], Awaitable[None]],
    ) -> None:
        self.broadcast_id = broadcast_id
        self.session_id = session_id
        self.language = language
        self.model = model
        self.quality_model = quality_model
        self.emit = emit
        self.partial_interval_ms = _env_int("WHISPER_PARTIAL_INTERVAL_MS", 1000, 400, 5000)
        self.silence_finalize_ms = _env_int("WHISPER_SILENCE_FINALIZE_MS", 700, 300, 3000)
        self.min_utterance_ms = _env_int("WHISPER_MIN_UTTERANCE_MS", 300, 100, 3000)
        self.max_utterance_ms = _env_int("WHISPER_MAX_UTTERANCE_MS", 30000, 5000, 120000)
        self.max_buffer_bytes = _env_int(
            "WHISPER_MAX_SESSION_BUFFER_BYTES", 2 * 1024 * 1024, 64 * 1024, 16 * 1024 * 1024
        )
        self.energy_threshold = float(os.getenv("WHISPER_SPEECH_RMS_THRESHOLD", "0.008"))
        self.quality_enabled = _env_bool("WHISPER_QUALITY_PASS_ENABLED", True)
        self.quality_max_pending = _env_int("WHISPER_QUALITY_MAX_PENDING", 16, 1, 64)
        self.frames: list[AudioFrame] = []
        self.buffer_bytes = 0
        self.utterance_index = 0
        self.revision = 0
        self.last_sequence = -1
        self.last_partial_at_ms = 0
        self.silence_ms = 0
        self.dropped_frames = 0
        self.quality_passes = 0
        self.quality_failures = 0
        self._quality_tasks: set[asyncio.Task] = set()
        self._lock = asyncio.Lock()
        self._emit_lock = asyncio.Lock()

    @property
    def provider_segment_id(self) -> str:
        first_sequence = self.frames[0].sequence if self.frames else self.utterance_index
        return f"{self.session_id}:{first_sequence}"

    def set_emitter(self, emit: Callable[[dict], Awaitable[None]]) -> None:
        self.emit = emit

    async def _emit(self, payload: dict) -> None:
        async with self._emit_lock:
            await self.emit(payload)

    @staticmethod
    def _rms(pcm: bytes) -> float:
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32)
        if not samples.size:
            return 0.0
        samples /= 32768.0
        return float(math.sqrt(float(np.mean(samples * samples))))

    async def push(self, frame: AudioFrame) -> None:
        if len(frame.pcm) != FRAME_BYTES:
            raise ValueError(f"PCM frame must contain {FRAME_BYTES} bytes")
        async with self._lock:
            if frame.sequence <= self.last_sequence:
                return
            self.last_sequence = frame.sequence
            self.frames.append(frame)
            self.buffer_bytes += len(frame.pcm)
            while self.buffer_bytes > self.max_buffer_bytes and self.frames:
                removed = self.frames.pop(0)
                self.buffer_bytes -= len(removed.pcm)
                self.dropped_frames += 1

            if self._rms(frame.pcm) >= self.energy_threshold:
                self.silence_ms = 0
            else:
                self.silence_ms += FRAME_DURATION_MS

            duration_ms = len(self.frames) * FRAME_DURATION_MS
            should_finalize = (
                duration_ms >= self.min_utterance_ms
                and self.silence_ms >= self.silence_finalize_ms
            ) or duration_ms >= self.max_utterance_ms
            should_partial = (
                duration_ms >= self.min_utterance_ms
                and frame.timestamp_ms - self.last_partial_at_ms >= self.partial_interval_ms
            )

            if should_finalize:
                await self._transcribe_locked(final=True)
            elif should_partial:
                await self._transcribe_locked(final=False)

    async def flush(self) -> None:
        async with self._lock:
            if self.frames:
                await self._transcribe_locked(final=True)

        # The HTTP/backend end request never waits here. This is reached by the
        # durable backend processing worker after live has already ended. Wait
        # for only the outstanding quality chunks before Whisper confirms flush.
        if self._quality_tasks:
            await asyncio.gather(*list(self._quality_tasks), return_exceptions=True)

    async def _wait_for_quality_capacity(self) -> None:
        while len(self._quality_tasks) >= self.quality_max_pending:
            done, _ = await asyncio.wait(
                self._quality_tasks,
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in done:
                self._quality_tasks.discard(task)

    async def _schedule_quality_pass(self, chunk: QualityChunk) -> None:
        if not self.quality_enabled or self.quality_model is None:
            await self._emit_final(chunk.fast_result, chunk, quality=False)
            return

        await self._wait_for_quality_capacity()
        task = asyncio.create_task(self._run_quality_pass(chunk))
        self._quality_tasks.add(task)
        task.add_done_callback(self._quality_tasks.discard)

    async def _emit_final(
        self,
        result: TranscriptResult,
        chunk: QualityChunk,
        *,
        quality: bool,
        processing_ms: int = 0,
    ) -> None:
        if not result.text:
            return

        start_ms = chunk.start_ms
        end_ms = chunk.end_ms
        if quality:
            start_ms = max(
                chunk.start_ms,
                min(chunk.end_ms, chunk.start_ms + round(max(0.0, result.start_seconds) * 1000)),
            )
            if result.end_seconds is not None:
                end_ms = max(
                    start_ms,
                    min(chunk.end_ms, chunk.start_ms + round(max(0.0, result.end_seconds) * 1000)),
                )

        await self._emit({
            "type": "segment",
            "broadcastId": self.broadcast_id,
            "sessionId": self.session_id,
            "segmentId": chunk.segment_id,
            "text": result.text,
            "status": "final",
            "startTimeMs": start_ms,
            "endTimeMs": end_ms,
            "timebase": "broadcast",
            "confidence": result.confidence,
            "language": result.language,
            "speaker": "Creator",
            "revision": chunk.provider_revision + (1 if quality else 0),
            "processingMs": processing_ms,
            "lastSequence": chunk.last_sequence,
            "qualityPass": quality,
        })

    async def _run_quality_pass(self, chunk: QualityChunk) -> None:
        started = time.perf_counter()
        try:
            samples = np.frombuffer(chunk.pcm, dtype="<i2").astype(np.float32) / 32768.0
            result: TranscriptResult = await asyncio.to_thread(
                self.quality_model.transcribe_quality,
                samples,
                self.language,
            )
            processing_ms = round((time.perf_counter() - started) * 1000)
            final_result = result if result.text else chunk.fast_result
            await self._emit_final(
                final_result,
                chunk,
                quality=bool(result.text),
                processing_ms=processing_ms,
            )
            self.quality_passes += 1
            logger.info(
                "quality transcript chunk completed",
                extra={
                    "broadcastId": self.broadcast_id,
                    "sessionId": self.session_id,
                    "segmentId": chunk.segment_id,
                    "processingMs": processing_ms,
                    "qualityConfidence": result.confidence,
                },
            )
        except Exception as error:
            self.quality_failures += 1
            logger.exception(
                "quality transcript chunk failed; keeping fast transcript",
                extra={
                    "broadcastId": self.broadcast_id,
                    "sessionId": self.session_id,
                    "segmentId": chunk.segment_id,
                },
            )
            try:
                await self._emit_final(chunk.fast_result, chunk, quality=False)
            except Exception:
                logger.exception(
                    "could not emit fast transcript fallback",
                    extra={"segmentId": chunk.segment_id, "error": str(error)},
                )

    async def _transcribe_locked(self, *, final: bool) -> None:
        if not self.frames:
            return
        started = time.perf_counter()
        pcm = b"".join(frame.pcm for frame in self.frames)
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
        result: TranscriptResult = await asyncio.to_thread(
            self.model.transcribe, samples, self.language
        )
        processing_ms = round((time.perf_counter() - started) * 1000)
        start_ms = self.frames[0].timestamp_ms
        end_ms = self.frames[-1].timestamp_ms + FRAME_DURATION_MS
        self.last_partial_at_ms = end_ms
        self.revision += 1
        segment_id = self.provider_segment_id
        last_sequence = self.frames[-1].sequence

        if final:
            # Snapshot the same immutable post-master PCM chunk used by the live
            # draft. The slower verifier starts immediately while the broadcast
            # continues. It is the only final emission for this segment, so the
            # backend sees one canonical final sequence instead of duplicates.
            chunk = QualityChunk(
                segment_id=segment_id,
                pcm=pcm,
                start_ms=start_ms,
                end_ms=end_ms,
                last_sequence=last_sequence,
                provider_revision=self.revision,
                fast_result=result,
            )
            await self._schedule_quality_pass(chunk)
        elif result.text:
            await self._emit({
                "type": "segment",
                "broadcastId": self.broadcast_id,
                "sessionId": self.session_id,
                "segmentId": segment_id,
                "text": result.text,
                "status": "partial",
                "startTimeMs": start_ms,
                "endTimeMs": end_ms,
                "timebase": "broadcast",
                "confidence": result.confidence,
                "language": result.language,
                "speaker": "Creator",
                "revision": self.revision,
                "processingMs": processing_ms,
                "lastSequence": last_sequence,
                "qualityPass": False,
            })

        if final:
            self.frames.clear()
            self.buffer_bytes = 0
            self.silence_ms = 0
            self.last_partial_at_ms = 0
            self.revision = 0
            self.utterance_index += 1
