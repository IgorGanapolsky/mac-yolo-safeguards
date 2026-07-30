#!/bin/sh
# Re-pin the grepai embedding model on the main Ollama instance.
# keep_alive=-1 does not survive an Ollama restart or a memory-pressure
# eviction (the 8GB chat model on :11434 evicts the 370MB embed model), and
# grepai then times out on /api/embeddings. com.igor.ollama-embed-pin runs
# this every 5 minutes to re-assert the pin.
# Quiet on failure by design: the GPU may be busy serving a chat session and
# the request can queue or time out — launchd retries on the next interval,
# so never spam the log.
set -u

OLLAMA_URL="${EMBED_PIN_OLLAMA_URL:-http://127.0.0.1:11434}"

if curl -fs --max-time 15 -X POST "$OLLAMA_URL/api/embed" \
     -H 'Content-Type: application/json' \
     --data '{"model":"nomic-embed-text","input":"pin","keep_alive":-1}' \
     >/dev/null 2>&1; then
  echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") pinned nomic-embed-text keep_alive=-1 on $OLLAMA_URL"
fi
exit 0
