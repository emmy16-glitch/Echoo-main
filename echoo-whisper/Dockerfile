FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends python3 python3-pip curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 echoo

WORKDIR /app
COPY requirements.txt ./
RUN python3 -m pip install --upgrade pip && python3 -m pip install -r requirements.txt
COPY app.py websocket_server.py whisper_worker.py model_loader.py ./
RUN mkdir -p /models && chown -R echoo:echoo /app /models

USER echoo
EXPOSE 8181
HEALTHCHECK --interval=30s --timeout=5s --start-period=10m --retries=3 \
  CMD curl --fail http://127.0.0.1:8181/health/ready || exit 1
CMD ["python3", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8181", "--ws-max-size", "1048576", "--ws-ping-interval", "30", "--ws-ping-timeout", "120", "--no-access-log"]
