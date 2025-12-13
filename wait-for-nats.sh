#!/usr/bin/env sh
#!/usr/bin/env sh
# wait-for-kafka.sh (reused filename)
# Wait for Kafka broker TCP port to be available and verify basic internet connectivity
# Usage: set KAFKA_BROKERS env (comma-separated), default kafka:9092

KAFKA_BROKERS=${KAFKA_BROKERS:-kafka:9092}
# take the first broker
FIRST=$(echo "$KAFKA_BROKERS" | cut -d',' -f1)
HOST=$(echo "$FIRST" | sed -E 's#([^:]+):([0-9]+)#\1#')
PORT=$(echo "$FIRST" | sed -E 's#([^:]+):([0-9]+)#\2#')
if [ -z "$PORT" ]; then
  PORT=9092
fi

TIMEOUT=${WAIT_DURATION:-60}
SLEEP=${WAIT_SLEEP:-2}

echo "[wait-for-kafka] waiting for Kafka at $HOST:$PORT (timeout ${TIMEOUT}s)"

start_ts=$(date +%s)
while : ; do
  if nc -z "$HOST" "$PORT" 2>/dev/null; then
    echo "[wait-for-kafka] Kafka reachable at $HOST:$PORT"
    break
  fi
  now_ts=$(date +%s)
  elapsed=$((now_ts - start_ts))
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "[wait-for-kafka] timeout waiting for Kafka after ${elapsed}s"
    break
  fi
  sleep $SLEEP
done

echo "[wait-for-kafka] checking external internet connectivity (https://example.com)"
if curl -sSf --max-time 5 https://example.com >/dev/null 2>&1; then
  echo "[wait-for-kafka] external internet reachable"
else
  echo "[wait-for-kafka] warning: external internet unreachable from container (curl failed)"
fi

exit 0
