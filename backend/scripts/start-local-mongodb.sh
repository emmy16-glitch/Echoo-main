#!/usr/bin/env sh
set -eu

db_path="$(pwd)/.mongodb"
log_path="$db_path/mongod.log"

if mongosh --quiet --host 127.0.0.1 --port 27017 --eval 'db.runCommand({ ping: 1 }).ok' 2>/dev/null | grep -qx '1'; then
  echo "MongoDB is already available at mongodb://127.0.0.1:27017"
  exit 0
fi

mkdir -p "$db_path"
# The system MongoDB service can leave a socket owned by the `mongodb` user in
# /tmp. This development instance only needs TCP, so avoid that shared socket.
mongod --dbpath "$db_path" --bind_ip 127.0.0.1 --port 27017 --nounixsocket --logpath "$log_path" --fork
mongosh --quiet --host 127.0.0.1 --port 27017 --eval 'db.runCommand({ ping: 1 }).ok' | grep -qx '1'
echo "MongoDB started at mongodb://127.0.0.1:27017 (data: $db_path)"
