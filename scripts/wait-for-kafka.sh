#!/usr/bin/env bash
set -e

host=${1:-kafka}
port=${2:-9092}
timeout=${3:-60}

echo "Waiting for Kafka at $host:$port (timeout ${timeout}s)"
start=$(date +%s)
while true; do
  # try open TCP socket
  if timeout 1 bash -c "</dev/tcp/$host/$port" 2>/dev/null; then
    echo "Kafka reachable at $host:$port"
    break
  fi
  now=$(date +%s)
  elapsed=$((now-start))
  if [ $elapsed -ge $timeout ]; then
    echo "Timed out waiting for Kafka after ${timeout}s" >&2
    exit 1
  fi
  sleep 1
done

# Exit successfully so the caller shell continues
exit 0
