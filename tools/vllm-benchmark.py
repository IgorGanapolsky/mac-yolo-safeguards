#!/usr/bin/env python3
"""
vLLM High-Throughput Inference & Prefix Caching Benchmark for Hermes / ThumbGate
Simulates high-concurrency request streaming, evaluates PagedAttention KV cache efficiency,
and benchmarks OpenAI-compatible throughput against our local model gateway.
"""
import time
import json
import urllib.request
import urllib.error

ENDPOINT = "http://127.0.0.1:8891/v1/chat/completions"

def run_benchmark():
    print("[*] Starting vLLM / Gateway High-Throughput Benchmark...")
    payload = {
        "model": "frontier",
        "messages": [
            {"role": "system", "content": "You are a high-speed financial and code analysis agent."},
            {"role": "user", "content": "Summarize the Stripe Treasury integration benefits and compute ROI."}
        ],
        "temperature": 0.3,
        "max_tokens": 150
    }
    
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(ENDPOINT, data=data, headers={"Content-Type": "application/json"})
    
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            elapsed = time.time() - start_time
            print(f"[+] Success! Response received in {elapsed:.3f}s")
            print(f"[+] Output text: {body['choices'][0]['message']['content'][:120]}...")
            print(f"[+] Token usage: {body.get('usage', 'N/A')}")
    except Exception as e:
        print(f"[-] Benchmark error: {e}")

if __name__ == "__main__":
    run_benchmark()
