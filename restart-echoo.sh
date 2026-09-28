#!/bin/bash

echo "================================"
echo " Echoo Service Reset"
echo "================================"

echo ""
echo "Checking ports..."

# Kill your own backend processes
echo "Stopping your Node backend..."
pkill -u $USER -f "node src/app.js" 2>/dev/null || true

# Kill your own Vite processes
echo "Stopping your Vite frontend..."
pkill -u $USER -f "vite" 2>/dev/null || true


echo ""
echo "Current ports:"
echo "----------------"

lsof -i :5001
lsof -i :5174
lsof -i :8181


echo ""
echo "================================"
echo "Starting Whisper"
echo "================================"

cd echoo-whisper

source venv/bin/activate

nohup uvicorn app:app \
--host 127.0.0.1 \
--port 8181 \
> whisper.log 2>&1 &

sleep 5


echo ""
echo "================================"
echo "Starting Backend"
echo "================================"

cd ../backend

BACKEND_PORT=$(grep -E '^PORT=' .env 2>/dev/null | tail -n 1 | cut -d= -f2-)
BACKEND_PORT=${BACKEND_PORT:-5001}
NODE_BIN=${NODE_BIN:-/home/digihosting/Documents/Apzs/e-metro/.tools/node/bin/node}

if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN=$(command -v node)
fi

setsid -f env NODE_ENV=production "$NODE_BIN" src/app.js \
> backend.log 2>&1

sleep 5


echo ""
echo "================================"
echo "Starting Frontend"
echo "================================"

cd ../frontend

nohup npm run dev -- --port 5174 \
> frontend.log 2>&1 &


echo ""
echo "================================"
echo "Echoo Started"
echo "================================"

echo ""
echo "Whisper:"
curl -s http://localhost:8181/health/ready || true

echo ""
echo ""
echo "Backend:"
curl -s "http://localhost:${BACKEND_PORT}/api/health" || true

echo ""
echo ""
echo "Logs:"
echo "whisper.log"
echo "backend.log"
echo "frontend.log"
