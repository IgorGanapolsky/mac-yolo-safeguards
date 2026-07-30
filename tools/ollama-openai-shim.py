#!/usr/bin/env python3
"""Tiny OpenAI-compatible facade for Ollama native chat.

Hermes talks to /v1/chat/completions. Qwen3 via Ollama's OpenAI facade can
return reasoning-only messages unless the native /api/chat `think:false` path
is used. This shim keeps Hermes on OpenAI-compatible URLs while forwarding to
Ollama's stable native endpoint.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

HOST = "127.0.0.1"
PORT = 11435
# Local Ollama directly. 11436 is the tailnet forwarder, whose own job is
# 100.94.135.78:11436 -> 127.0.0.1:11434 (exposing this Ollama to other
# machines); routing the local shim through it added a hop that crashloops on
# bind (Errno 49) and answered with empty content and 0 tokens — HTTP 200, so
# nothing alarmed. Keep this pointed at the origin, not at the re-exporter.
OLLAMA = "http://127.0.0.1:11434"


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    try:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        handler.send_response(status)
        handler.send_header("Content-Type", "application/json")
        handler.send_header("Content-Length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)
    except (BrokenPipeError, ConnectionResetError):
        pass


def _sse(handler: BaseHTTPRequestHandler, payload: dict[str, Any]) -> None:
    try:
        line = f"data: {json.dumps(payload, separators=(',', ':'))}\n\n".encode("utf-8")
        handler.wfile.write(line)
        handler.wfile.flush()
    except (BrokenPipeError, ConnectionResetError):
        pass


def get_installed_ollama_models() -> list[str]:
    try:
        req = urllib.request.Request(f"{OLLAMA}/api/tags")
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return [m["name"] for m in data.get("models", [])]
    except Exception:
        return []


def resolve_model(req_model: str | None) -> str:
    installed = get_installed_ollama_models()
    if req_model and req_model in installed:
        return req_model
    candidates = [
        "qwen2.5:3b-hermes-64k",
        "qwen3:8b-64k",
        "qwen3.5:9b-hermes-64k",
        "qwen3.5:9b",
        "qwen3-hermes-tinker:latest",
        "qwen2.5:3b-hermes-64k",
        "qwen3:8b",
    ]
    for c in candidates:
        if c in installed:
            return c
    if installed:
        return installed[0]
    return "qwen3:8b-64k"


def _ollama_request(path: str, payload: dict[str, Any], timeout: int = 600) -> dict[str, Any]:
    req = urllib.request.Request(
        f"{OLLAMA}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _ollama_stream(path: str, payload: dict[str, Any], timeout: int = 600):
    req = urllib.request.Request(
        f"{OLLAMA}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        for raw in resp:
            raw = raw.strip()
            if not raw:
                continue
            yield json.loads(raw.decode("utf-8"))


def _openai_tool_calls_to_ollama(tool_calls: Any) -> list[dict[str, Any]]:
    converted: list[dict[str, Any]] = []
    for call in tool_calls or []:
        if not isinstance(call, dict):
            continue
        fn = call.get("function") or {}
        args = fn.get("arguments")
        if isinstance(args, str):
            try:
                args = json.loads(args) if args.strip() else {}
            except Exception:
                args = {"_raw": args}
        elif not isinstance(args, dict):
            args = {}
        entry: dict[str, Any] = {"function": {"name": str(fn.get("name") or ""), "arguments": args}}
        if call.get("id"):
            entry["id"] = str(call["id"])
        converted.append(entry)
    return converted


def _ollama_tool_calls_to_openai(tool_calls: Any) -> list[dict[str, Any]]:
    converted: list[dict[str, Any]] = []
    for index, call in enumerate(tool_calls or []):
        if not isinstance(call, dict):
            continue
        fn = call.get("function") or {}
        args = fn.get("arguments")
        if not isinstance(args, str):
            args = json.dumps(args if args is not None else {}, separators=(",", ":"))
        converted.append({
            "index": index,
            "id": str(call.get("id") or f"call_local_{int(time.time())}_{index}"),
            "type": "function",
            "function": {"name": str(fn.get("name") or ""), "arguments": args},
        })
    return converted


def _normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if isinstance(content, list):
            parts: list[str] = []
            for part in content:
                if isinstance(part, dict):
                    if part.get("type") == "text":
                        parts.append(str(part.get("text", "")))
                else:
                    parts.append(str(part))
            content = "\n".join(p for p in parts if p)
        if content is None:
            content = ""
        entry: dict[str, Any] = {"role": role, "content": str(content)}
        if role == "assistant" and msg.get("tool_calls"):
            entry["tool_calls"] = _openai_tool_calls_to_ollama(msg["tool_calls"])
        if role == "tool":
            if msg.get("tool_call_id"):
                entry["tool_call_id"] = str(msg["tool_call_id"])
            tool_name = msg.get("name") or msg.get("tool_name")
            if tool_name:
                entry["tool_name"] = str(tool_name)
        normalized.append(entry)
    return normalized


def _chat_payload(data: dict[str, Any], stream: bool) -> dict[str, Any]:
    options: dict[str, Any] = {}
    if isinstance(data.get("temperature"), (int, float)):
        options["temperature"] = data["temperature"]
    max_tokens = data.get("max_tokens", data.get("max_completion_tokens"))
    if isinstance(max_tokens, int) and max_tokens > 0:
        options["num_predict"] = max_tokens
    if isinstance(data.get("top_p"), (int, float)):
        options["top_p"] = data["top_p"]

    target_model = resolve_model(data.get("model"))

    payload = {
        "model": target_model,
        "messages": _normalize_messages(data.get("messages") or []),
        "stream": stream,
        "think": False,
        "keep_alive": "24h",
        "options": options,
    }
    tools = data.get("tools")
    if isinstance(tools, list) and tools:
        payload["tools"] = tools
    return payload


def _usage(resp: dict[str, Any]) -> dict[str, int]:
    prompt = int(resp.get("prompt_eval_count") or 0)
    completion = int(resp.get("eval_count") or 0)
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "total_tokens": prompt + completion,
    }


def _openai_response(
    model: str,
    content: str,
    usage: dict[str, int],
    tool_calls: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    now = int(time.time())
    message: dict[str, Any] = {"role": "assistant", "content": content}
    finish_reason = "stop"
    if tool_calls:
        message["tool_calls"] = tool_calls
        message["content"] = content or None
        finish_reason = "tool_calls"
    return {
        "id": f"chatcmpl-local-{now}",
        "object": "chat.completion",
        "created": now,
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": message,
                "finish_reason": finish_reason,
            }
        ],
        "usage": usage,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "HermesOllamaShim/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        pass

    def do_GET(self) -> None:
        path = self.path.split("?")[0].rstrip("/")
        if path in ("/v1/models", "/api/tags", "/api/v1/models") or path == "":
            installed = get_installed_ollama_models()
            model_list = [
                {"id": "ollama-hermes-zero-spend", "object": "model", "created": int(time.time()), "owned_by": "ollama"},
                {"id": "grok-4.5", "object": "model", "created": int(time.time()), "owned_by": "xai"},
            ]
            for m in installed:
                model_list.append({"id": m, "object": "model", "created": int(time.time()), "owned_by": "ollama"})
            _json_response(self, 200, {"object": "list", "data": model_list})
            return

        if path.startswith("/v1/models/"):
            model_name = path.replace("/v1/models/", "")
            _json_response(self, 200, {
                "id": model_name,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "ollama",
            })
            return

        if path in ("/version", "/props", "/v1/props", "/healthz", "/ping"):
            _json_response(self, 200, {"version": "0.2.112", "status": "ok"})
            return

        _json_response(self, 404, {"error": {"message": f"path not found: {path}"}})

    def do_POST(self) -> None:
        path = self.path.split("?")[0].rstrip("/")
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {}

        if path in ("/api/show", "/v1/api/show"):
            _json_response(self, 200, {
                "modelfile": "FROM qwen3:8b-64k",
                "parameters": "num_ctx 32768",
                "template": "",
                "details": {"format": "gguf", "family": "qwen3", "parameter_size": "8B"},
            })
            return
        if path != "/v1/chat/completions":
            _json_response(self, 404, {"error": {"message": "not found"}})
            return

        model = data.get("model") or "ollama-hermes-zero-spend"
        stream = bool(data.get("stream"))
        payload = _chat_payload(data, stream)
        msgs = payload.get("messages", [])
        total_chars = sum(len(m.get("content", "")) for m in msgs)
        print(f"[SHIM] POST /v1/chat/completions model={payload['model']} stream={stream} msgs={len(msgs)} total_chars={total_chars}", flush=True)
        try:
            if stream:
                try:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("Connection", "close")
                    self.end_headers()
                except (BrokenPipeError, ConnectionResetError):
                    return
                created = int(time.time())
                streamed_tool_calls = 0
                for chunk in _ollama_stream("/api/chat", _chat_payload(data, True)):
                    chunk_message = chunk.get("message") or {}
                    content = chunk_message.get("content") or ""
                    if content:
                        _sse(
                            self,
                            {
                                "id": f"chatcmpl-local-{created}",
                                "object": "chat.completion.chunk",
                                "created": created,
                                "model": model,
                                "choices": [
                                    {
                                        "index": 0,
                                        "delta": {"content": content},
                                        "finish_reason": None,
                                    }
                                ],
                            },
                        )
                    chunk_calls = _ollama_tool_calls_to_openai(chunk_message.get("tool_calls"))
                    if chunk_calls:
                        for call in chunk_calls:
                            call["index"] = streamed_tool_calls
                            streamed_tool_calls += 1
                        _sse(
                            self,
                            {
                                "id": f"chatcmpl-local-{created}",
                                "object": "chat.completion.chunk",
                                "created": created,
                                "model": model,
                                "choices": [
                                    {
                                        "index": 0,
                                        "delta": {"tool_calls": chunk_calls},
                                        "finish_reason": None,
                                    }
                                ],
                            },
                        )
                    if chunk.get("done"):
                        _sse(
                            self,
                            {
                                "id": f"chatcmpl-local-{created}",
                                "object": "chat.completion.chunk",
                                "created": created,
                                "model": model,
                                "choices": [
                                    {
                                        "index": 0,
                                        "delta": {},
                                        "finish_reason": "tool_calls" if streamed_tool_calls else "stop",
                                    }
                                ],
                            },
                        )
                        try:
                            self.wfile.write(b"data: [DONE]\n\n")
                            self.wfile.flush()
                        except (BrokenPipeError, ConnectionResetError):
                            pass
                        self.close_connection = True
                        return
                self.close_connection = True
                return

            resp = _ollama_request("/api/chat", _chat_payload(data, False))
            resp_message = resp.get("message") or {}
            content = resp_message.get("content") or ""
            tool_calls = _ollama_tool_calls_to_openai(resp_message.get("tool_calls"))
            _json_response(self, 200, _openai_response(model, content, _usage(resp), tool_calls))
        except urllib.error.HTTPError as exc:
            _json_response(self, exc.code, {"error": {"message": exc.read().decode("utf-8")}})
        except Exception as exc:
            _json_response(self, 500, {"error": {"message": str(exc)}})


def _prewarm() -> None:
    try:
        model = resolve_model("ollama-hermes-zero-spend")
        print(f"[SHIM] Pre-warming model {model} in background...", flush=True)
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "stream": False,
            "think": False,
            "keep_alive": "24h",
        }
        _ollama_request("/api/chat", payload, timeout=120)
        print(f"[SHIM] Pre-warm complete for {model}.", flush=True)
    except Exception as exc:
        print(f"[SHIM] Pre-warm note: {exc}", flush=True)


def main() -> None:
    import threading
    threading.Thread(target=_prewarm, daemon=True).start()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Serving OpenAI shim on http://{HOST}:{PORT}/v1 -> {OLLAMA}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
