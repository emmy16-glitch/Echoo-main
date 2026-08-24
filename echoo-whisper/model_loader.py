import logging
import math
import os
import threading
from dataclasses import dataclass

logger = logging.getLogger("echoo-whisper.model")


def _env_int(name: str, fallback: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(fallback)))
    except ValueError:
        value = fallback
    return max(minimum, min(maximum, value))


def _model_id(value: str) -> str:
    """Normalize Echoo's friendly model name to a Faster-Whisper model id."""
    normalized = str(value or "").strip() or "faster-whisper-large-v3-turbo"
    if normalized.startswith("faster-whisper-"):
        normalized = normalized[len("faster-whisper-") :]
    return normalized or "large-v3-turbo"


@dataclass(frozen=True)
class TranscriptResult:
    text: str
    language: str
    confidence: float | None
    start_seconds: float = 0.0
    end_seconds: float | None = None


class WhisperModelRuntime:
    """Loads one Faster-Whisper model and serializes access to its runtime."""

    def __init__(
        self,
        *,
        model_env: str = "WHISPER_MODEL",
        model_path_env: str = "WHISPER_MODEL_PATH",
        default_model: str = "faster-whisper-large-v3-turbo",
        purpose: str = "live",
    ) -> None:
        self.purpose = purpose
        self.model_name = os.getenv(model_env, default_model).strip() or default_model
        self.language = os.getenv("WHISPER_LANGUAGE", "en").strip() or "en"
        self.device = os.getenv("WHISPER_DEVICE", "auto").strip() or "auto"
        self.compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "auto").strip() or "auto"
        self.cpu_threads = _env_int("WHISPER_CPU_THREADS", 4, 1, 16)
        self.model_dir = os.getenv("WHISPER_MODEL_DIR", "/models").strip() or "/models"
        self.model_path = os.getenv(model_path_env, "").strip()
        self._model = None
        self._load_lock = threading.Lock()
        self._inference_lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return self._model is not None

    @property
    def resolved_model_id(self) -> str:
        return self.model_path or _model_id(self.model_name)

    def load(self) -> None:
        if self._model is not None:
            return
        with self._load_lock:
            if self._model is not None:
                return
            from faster_whisper import WhisperModel

            logger.info(
                "loading Whisper model",
                extra={
                    "model": self.model_name,
                    "resolvedModel": self.resolved_model_id,
                    "device": self.device,
                    "purpose": self.purpose,
                },
            )
            self._model = WhisperModel(
                self.resolved_model_id,
                device=self.device,
                compute_type=self.compute_type,
                cpu_threads=self.cpu_threads,
                download_root=self.model_dir,
            )
            logger.info(
                "Whisper model ready",
                extra={"model": self.model_name, "purpose": self.purpose},
            )

    @staticmethod
    def _result(materialized, info, language: str | None) -> TranscriptResult:
        text = " ".join(
            segment.text.strip()
            for segment in materialized
            if segment.text and segment.text.strip()
        ).strip()
        log_probs = [
            segment.avg_logprob
            for segment in materialized
            if math.isfinite(segment.avg_logprob)
        ]
        confidence = None
        if log_probs:
            confidence = max(
                0.0,
                min(1.0, math.exp(sum(log_probs) / len(log_probs))),
            )
        starts = [float(segment.start) for segment in materialized if segment.text.strip()]
        ends = [float(segment.end) for segment in materialized if segment.text.strip()]
        return TranscriptResult(
            text=text,
            language=getattr(info, "language", None) or language or "en",
            confidence=confidence,
            start_seconds=min(starts) if starts else 0.0,
            end_seconds=max(ends) if ends else None,
        )

    def transcribe(self, samples, language: str | None = None) -> TranscriptResult:
        """Low-latency pass used to keep the live draft moving."""
        self.load()
        with self._inference_lock:
            segments, info = self._model.transcribe(
                samples,
                language=language or self.language,
                beam_size=1,
                best_of=1,
                condition_on_previous_text=False,
                vad_filter=False,
                word_timestamps=False,
            )
            materialized = list(segments)
        return self._result(materialized, info, language or self.language)

    def transcribe_quality(self, samples, language: str | None = None) -> TranscriptResult:
        """Slower second pass used only for the publishable transcript draft."""
        self.load()
        beam_size = _env_int("WHISPER_QUALITY_BEAM_SIZE", 5, 1, 10)
        best_of = _env_int("WHISPER_QUALITY_BEST_OF", 5, 1, 10)
        with self._inference_lock:
            segments, info = self._model.transcribe(
                samples,
                language=language or self.language,
                beam_size=beam_size,
                best_of=best_of,
                condition_on_previous_text=True,
                vad_filter=True,
                word_timestamps=False,
            )
            materialized = list(segments)
        return self._result(materialized, info, language or self.language)


model_runtime = WhisperModelRuntime()

# By default the quality worker reuses the already loaded model. Operators with
# enough GPU/CPU memory can configure a dedicated quality model so live draft
# inference and the slower verification pass run independently.
_quality_model_name = os.getenv("WHISPER_QUALITY_MODEL", "").strip()
_quality_model_path = os.getenv("WHISPER_QUALITY_MODEL_PATH", "").strip()
_quality_dedicated = os.getenv("WHISPER_QUALITY_DEDICATED_MODEL", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

if _quality_dedicated or _quality_model_name or _quality_model_path:
    quality_model_runtime = WhisperModelRuntime(
        model_env="WHISPER_QUALITY_MODEL",
        model_path_env="WHISPER_QUALITY_MODEL_PATH",
        default_model=model_runtime.model_name,
        purpose="quality",
    )
else:
    quality_model_runtime = model_runtime
