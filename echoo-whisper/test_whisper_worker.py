import asyncio
import os

import numpy as np

from model_loader import TranscriptResult
from whisper_worker import AudioFrame, StreamingTranscriptSession


class FakeModel:
    def transcribe(self, samples, language):
        assert isinstance(samples, np.ndarray)
        return TranscriptResult("Welcome to Echoo", language, 0.96)


def speech_frame(sequence, timestamp_ms):
    pcm = np.full(320, 6000, dtype="<i2").tobytes()
    return AudioFrame(sequence=sequence, timestamp_ms=timestamp_ms, pcm=pcm)


def test_partial_is_revised_into_one_final_segment_with_broadcast_timestamps():
    async def run():
        emitted = []

        async def emit(payload):
            emitted.append(payload)

        session = StreamingTranscriptSession(
            broadcast_id="broadcast-1",
            session_id="session-1",
            language="en",
            model=FakeModel(),
            emit=emit,
        )
        for sequence in range(51):
            await session.push(speech_frame(sequence, 15000 + sequence * 20))
        await session.flush()

        assert [item["status"] for item in emitted] == ["partial", "final"]
        assert emitted[0]["segmentId"] == emitted[1]["segmentId"]
        assert emitted[0]["segmentId"] == "session-1:0"
        assert emitted[0]["startTimeMs"] == 15000
        assert emitted[1]["endTimeMs"] == 16020
        assert emitted[1]["timebase"] == "broadcast"

    asyncio.run(run())


def test_reconnected_capture_uses_sequence_for_a_new_stable_segment_id():
    async def run():
        emitted = []

        async def emit(payload):
            emitted.append(payload)

        session = StreamingTranscriptSession(
            broadcast_id="broadcast-3",
            session_id="session-3",
            language="en",
            model=FakeModel(),
            emit=emit,
        )
        for sequence in range(50, 66):
            await session.push(speech_frame(sequence, 25000 + (sequence - 50) * 20))
        await session.flush()
        assert emitted[-1]["segmentId"] == "session-3:50"
        assert emitted[-1]["startTimeMs"] == 25000

    asyncio.run(run())


def test_session_buffer_is_bounded_and_tracks_dropped_frames(monkeypatch):
    monkeypatch.setenv("WHISPER_MAX_SESSION_BUFFER_BYTES", "65536")

    async def run():
        async def emit(_payload):
            return None

        session = StreamingTranscriptSession(
            broadcast_id="broadcast-2",
            session_id="session-2",
            language="en",
            model=FakeModel(),
            emit=emit,
        )
        session.partial_interval_ms = 5000
        for sequence in range(150):
            await session.push(speech_frame(sequence, sequence * 20))
        assert session.buffer_bytes <= session.max_buffer_bytes
        assert session.dropped_frames > 0

    asyncio.run(run())
