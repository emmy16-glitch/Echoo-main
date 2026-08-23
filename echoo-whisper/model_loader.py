import logging
import math
import os
import threading
from dataclasses import dataclass

logger = logging.getLogger("echoo-whisper.model")


@dataclass(frozen=True)
class TranscriptResult:
    text: str
    language: str
    confidence: float | None


class WhisperModelRuntime:
    """Loads one Faster-Whisper model and serializes access to its runtime."""

    def __init__(self, model_name: str | None = None) -> None:
        self.model_name = (model_name or os.getenv("WHISPER_MODEL", "faster-whisper-large-v3-turbo")).strip() or "faster-whisper-large-v3-turbo"
        self.language = os.getenv("WHISPER_LANGUAGE", "en").strip() or "en"
        self.device = os.getenv("WHISPER_DEVICE", "auto").strip() or "auto"
        self.compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "auto").strip() or "auto"
        self.cpu_threads = max(1, min(16, int(os.getenv("WHISPER_CPU_THREADS", "4"))))
        self.model_dir = os.getenv("WHISPER_MODEL_DIR", "/models").strip() or "/models"
        self.model_path = os.getenv("WHISPER_MODEL_PATH", "").strip()
        self._model = None
        self._load_lock = threading.Lock()
        self._inference_lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        if self._model is not None:
            return
        with self._load_lock:
            if self._model is not None:
                return
            from faster_whisper import WhisperModel

            logger.info(
                "loading Whisper model",
                extra={"model": self.model_name, "device": self.device},
            )
            self._model = WhisperModel(
                self.model_path or self.model_name.removeprefix("faster-whisper-"),
                device=self.device,
                compute_type=self.compute_type,
                cpu_threads=self.cpu_threads,
                download_root=self.model_dir,
            )
            logger.info("Whisper model ready", extra={"model": self.model_name})

    def transcribe(self, samples, language: str | None = None, quality: bool = False) -> TranscriptResult:
        self.load()
        with self._inference_lock:
            segments, info = self._model.transcribe(
                samples,
                language=language or self.language,
                beam_size=5 if quality else 1,
                best_of=5 if quality else 1,
                condition_on_previous_text=quality,
                vad_filter=quality,
                word_timestamps=False,
            )
            materialized = list(segments)
        text = " ".join(segment.text.strip() for segment in materialized if segment.text.strip()).strip()
        log_probs = [segment.avg_logprob for segment in materialized if math.isfinite(segment.avg_logprob)]
        confidence = None
        if log_probs:
            confidence = max(0.0, min(1.0, math.exp(sum(log_probs) / len(log_probs))))
        return TranscriptResult(
            text=text,
            language=getattr(info, "language", None) or language or self.language,
            confidence=confidence,
        )


model_runtime = WhisperModelRuntime()
_quality_model_name = os.getenv("WHISPER_QUALITY_MODEL", "").strip()
quality_model_runtime = (
    WhisperModelRuntime(model_name=_quality_model_name)
    if _quality_model_name and _quality_model_name != model_runtime.model_name
    else model_runtime
)
