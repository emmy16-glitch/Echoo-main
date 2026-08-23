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


@dataclass(frozen=True)
class AudioFrame:
    sequence: int
    timestamp_ms: int
    pcm: bytes


class StreamingTranscriptSession:
    """Turns acknowledged 20 ms PCM frames into revisable utterance segments."""

    def __init__(
        self,
        *,
        broadcast_id: str,
        session_id: str,
        language: str,
        model,
        emit: Callable[[dict], Awaitable[None]],
        quality_pass: bool = False,
    ) -> None:
        self.broadcast_id = broadcast_id
        self.session_id = session_id
        self.language = language
        self.model = model
        self.emit = emit
        self.quality_pass = quality_pass
        self.partial_interval_ms = _env_int("WHISPER_PARTIAL_INTERVAL_MS", 1000, 400, 5000)
        self.silence_finalize_ms = _env_int("WHISPER_SILENCE_FINALIZE_MS", 700, 300, 3000)
        self.min_utterance_ms = _env_int("WHISPER_MIN_UTTERANCE_MS", 300, 100, 3000)
        self.max_utterance_ms = _env_int("WHISPER_MAX_UTTERANCE_MS", 30000, 5000, 120000)
        self.max_buffer_bytes = _env_int(
            "WHISPER_MAX_SESSION_BUFFER_BYTES", 2 * 1024 * 1024, 64 * 1024, 16 * 1024 * 1024
        )
        self.energy_threshold = float(os.getenv("WHISPER_SPEECH_RMS_THRESHOLD", "0.008"))
        self.frames: list[AudioFrame] = []
        self.buffer_bytes = 0
        self.utterance_index = 0
        self.revision = 0
        self.last_sequence = -1
        self.last_partial_at_ms = 0
        self.silence_ms = 0
        self.dropped_frames = 0
        self._lock = asyncio.Lock()

    @property
    def provider_segment_id(self) -> str:
        first_sequence = self.frames[0].sequence if self.frames else self.utterance_index
        return f"{self.session_id}:{first_sequence}"

    def set_emitter(self, emit: Callable[[dict], Awaitable[None]]) -> None:
        self.emit = emit

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

    async def _transcribe_locked(self, *, final: bool) -> None:
        if not self.frames:
            return
        started = time.perf_counter()
        pcm = b"".join(frame.pcm for frame in self.frames)
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
        if self.quality_pass:
            result: TranscriptResult = await asyncio.to_thread(
                self.model.transcribe, samples, self.language, True
            )
        else:
            result = await asyncio.to_thread(self.model.transcribe, samples, self.language)
        processing_ms = round((time.perf_counter() - started) * 1000)
        start_ms = self.frames[0].timestamp_ms
        end_ms = self.frames[-1].timestamp_ms + FRAME_DURATION_MS
        self.last_partial_at_ms = end_ms
        self.revision += 1
        if result.text:
            await self.emit({
                "type": "segment",
                "broadcastId": self.broadcast_id,
                "sessionId": self.session_id,
                "segmentId": self.provider_segment_id,
                "text": result.text,
                "status": "final" if final else "partial",
                "startTimeMs": start_ms,
                "endTimeMs": end_ms,
                "timebase": "broadcast",
                "confidence": result.confidence,
                "language": result.language,
                "speaker": "Creator",
                "revision": self.revision,
                "processingMs": processing_ms,
                "lastSequence": self.last_sequence,
            })
        if final:
            self.frames.clear()
            self.buffer_bytes = 0
            self.silence_ms = 0
            self.last_partial_at_ms = 0
            self.revision = 0
            self.utterance_index += 1
