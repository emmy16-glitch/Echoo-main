#!/usr/bin/env bash

set -e

echo "======================================"
echo " Installing OvenMediaEngine (OME)"
echo "======================================"

# ---------------------------------------
# 1. Install Docker if missing
# ---------------------------------------

if ! command -v docker >/dev/null 2>&1; then
    echo "[1/5] Docker not found. Installing..."

    sudo apt update
    sudo apt install -y docker.io

    sudo systemctl enable --now docker
else
    echo "[1/5] Docker already installed."
fi


# ---------------------------------------
# 2. Detect local IP
# ---------------------------------------

OME_IP=$(hostname -I | awk '{print $1}')

echo "[2/5] Detected host IP: $OME_IP"


# ---------------------------------------
# 3. Remove old OME container if present
# ---------------------------------------

if docker ps -a --format '{{.Names}}' | grep -qx ome; then
    echo "[3/5] Existing OME container found."
    echo "Removing old container..."
    docker rm -f ome
else
    echo "[3/5] No existing OME container."
fi


# ---------------------------------------
# 4. Pull latest OME
# ---------------------------------------

echo "[4/5] Downloading latest OvenMediaEngine..."

docker pull ovenmedialabs/ovenmediaengine:latest


# ---------------------------------------
# 5. Start OME
# ---------------------------------------

echo "[5/5] Starting OvenMediaEngine..."

docker run \
    --name ome \
    --restart unless-stopped \
    -d \
    -e OME_HOST_IP="$OME_IP" \
    -p 1935:1935 \
    -p 9999:9999/udp \
    -p 9000:9000 \
    -p 3333:3333 \
    -p 3478:3478 \
    -p 10000-10003:10000-10003/udp \
    -p 10000:10000/tcp \
    -v ome-origin-conf:/opt/ovenmediaengine/bin/origin_conf \
    -v ome-edge-conf:/opt/ovenmediaengine/bin/edge_conf \
    ovenmedialabs/ovenmediaengine:latest


echo
echo "======================================"
echo " OME INSTALLATION COMPLETE"
echo "======================================"
echo
echo "OME Host IP: $OME_IP"
echo
echo "Container status:"
docker ps -f name=ome

echo
echo "Useful commands:"
echo
echo "View logs:"
echo "docker logs -f ome"
echo
echo "Stop OME:"
echo "docker stop ome"
echo
echo "Start OME:"
echo "docker start ome"
echo
echo "Restart OME:"
echo "docker restart ome"
echo
