#!/usr/bin/env sh
# Local MongoDB lifecycle helper for Echoo development. It never uses sudo and
# deliberately avoids MongoDB's shared /tmp/mongodb-27017.sock.
set -eu

action="${1:-start}"
mongo_home="${ECHOO_MONGODB_HOME:-${HOME}/echoo-mongodb}"
data_path="$mongo_home/data"
logs_path="$mongo_home/logs"
log_path="$logs_path/mongod.log"
pid_path="$mongo_home/mongod.pid"
port="${ECHOO_MONGODB_PORT:-27017}"

ping_mongo() {
  mongosh --quiet --host 127.0.0.1 --port "$port" \
    --eval 'db.adminCommand({ ping: 1 }).ok' 2>/dev/null | grep -qx '1'
}

require_tools() {
  command -v mongod >/dev/null 2>&1 || {
    echo "MongoDB server executable 'mongod' was not found in PATH." >&2
    exit 1
  }
  command -v mongosh >/dev/null 2>&1 || {
    echo "MongoDB shell executable 'mongosh' was not found in PATH." >&2
    exit 1
  }
}

port_in_use() {
  ss -ltnH "sport = :$port" 2>/dev/null | grep -q .
}

start() {
  require_tools

  if ping_mongo; then
    echo "MongoDB is already available at mongodb://127.0.0.1:$port/echoo"
    exit 0
  fi

  if port_in_use; then
    echo "Port $port is already listening, but it is not a reachable local MongoDB instance." >&2
    echo "Inspect it with: ss -ltnp 'sport = :$port'" >&2
    exit 1
  fi

  mkdir -p "$data_path" "$logs_path"
  [ -w "$data_path" ] && [ -w "$logs_path" ] || {
    echo "MongoDB data/log directories must be writable by $(id -un): $mongo_home" >&2
    exit 1
  }

  # A stale PID file can remain after an unclean local shutdown. Only remove it
  # when it does not identify a process using this exact user-owned db path.
  if [ -s "$pid_path" ]; then
    old_pid="$(tr -cd '0-9' < "$pid_path")"
    if [ -n "$old_pid" ] && kill -0 "$old_pid" 2>/dev/null && \
      ps -p "$old_pid" -o args= 2>/dev/null | grep -F -- "$data_path" >/dev/null; then
      echo "MongoDB PID $old_pid is still running but did not answer ping; see $log_path" >&2
      exit 1
    fi
    rm -f "$pid_path"
  fi

  # --nounixsocket is the essential no-sudo fix: a system daemon can leave a
  # root/mongodb-owned socket in /tmp that an ordinary user cannot unlink.
  if ! mongod --dbpath "$data_path" --bind_ip 127.0.0.1 --port "$port" \
    --nounixsocket --logpath "$log_path" --pidfilepath "$pid_path" --fork; then
    echo "MongoDB did not start. Recent log output from $log_path:" >&2
    tail -n 60 "$log_path" 2>/dev/null >&2 || true
    exit 1
  fi

  if ! ping_mongo; then
    echo "MongoDB started a process but did not answer ping. Recent log output:" >&2
    tail -n 60 "$log_path" 2>/dev/null >&2 || true
    exit 1
  fi

  echo "MongoDB started at mongodb://127.0.0.1:$port/echoo"
  echo "Data: $data_path"
  echo "Log:  $log_path"
}

status() {
  require_tools
  if ping_mongo; then
    echo "MongoDB is healthy at mongodb://127.0.0.1:$port/echoo"
    exit 0
  fi
  echo "MongoDB is not reachable at mongodb://127.0.0.1:$port/echoo" >&2
  exit 1
}

stop() {
  if [ ! -s "$pid_path" ]; then
    echo "No Echoo-managed MongoDB PID file exists at $pid_path." >&2
    exit 1
  fi

  pid="$(tr -cd '0-9' < "$pid_path")"
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$pid_path"
    echo "Removed stale MongoDB PID file."
    exit 0
  fi

  if ! ps -p "$pid" -o args= 2>/dev/null | grep -F -- "$data_path" >/dev/null; then
    echo "Refusing to signal PID $pid because it is not using $data_path." >&2
    exit 1
  fi

  kill -TERM "$pid"
  attempts=0
  while kill -0 "$pid" 2>/dev/null && [ "$attempts" -lt 40 ]; do
    sleep 0.25
    attempts=$((attempts + 1))
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo "MongoDB PID $pid did not stop within 10 seconds; see $log_path." >&2
    exit 1
  fi
  rm -f "$pid_path"
  echo "Echoo local MongoDB stopped."
}

case "$action" in
  start) start ;;
  status) status ;;
  stop) stop ;;
  *)
    echo "Usage: $0 {start|status|stop}" >&2
    exit 64
    ;;
esac
