import logging
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

from fastapi import FastAPI, WebSocket
from pythonjsonlogger.json import JsonFormatter

from model_loader import model_runtime
from websocket_server import transcription_websocket

handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
logging.basicConfig(
    level=os.getenv("WHISPER_LOG_LEVEL", "INFO").upper(),
    handlers=[handler],
    force=True,
)

app = FastAPI(title="Echoo Whisper Flow", docs_url=None, redoc_url=None)


@app.on_event("startup")
async def load_model_once() -> None:
    model_runtime.load()


@app.get("/health/live")
async def liveness() -> dict:
    return {"status": "ok"}


@app.get("/health/ready")
async def readiness() -> dict:
    return {
        "status": "ready" if model_runtime.ready else "loading",
        "model": model_runtime.model_name,
        "ready": model_runtime.ready,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await transcription_websocket(websocket)

