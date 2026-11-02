#!/bin/bash
# Production vLLM startup script for Poolside Laguna-2.1 models
# Enforces DFlash speculative decoding, Triton MoE backend, and chunked prefill / APC.

MODEL_PATH="${MODEL_PATH:-poolside/Laguna-S-2.1}"
DRAFT_MODEL_PATH="${DRAFT_MODEL_PATH:-poolside/Laguna-XS-2.1}"
PORT="${PORT:-8000}"

echo "Starting vLLM server for $MODEL_PATH with draft $DRAFT_MODEL_PATH..."
python3 -m vllm.entrypoints.openai.api_server \
    --model "$MODEL_PATH" \
    --speculative-model "$DRAFT_MODEL_PATH" \
    --num-speculative-tokens 7 \
    --moe-backend triton \
    --tool-call-parser poolside_v1 \
    --enable-prefix-caching \
    --enable-chunked-prefill \
    --max-model-len 131072 \
    --port "$PORT" \
    "$@"
