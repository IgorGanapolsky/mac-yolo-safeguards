#!/usr/bin/env python3
"""Stateful fake Hermes gateway for the watchdog e2e orchestration suite.

Serves just enough of the real surface for scripts/hermes-gateway-watchdog.sh to
drive end to end against a real process over real HTTP (no mocks):

  GET  /health                -> 200 (liveness the watchdog polls)
  GET  /api/ps                -> {"models":[...]} — empty in the default
                                 on-demand scenario; reports resident if the
                                 explicit pin endpoint is exercised
  POST /api/generate          -> records "PIN", marks the model resident
  POST /v1/chat/completions   -> records "WARMUP" (the pre-warm turns)

A required --token is placed in argv purely so the watchdog's `pgrep -f` can find
and (in the crash test) the harness can kill this process, mirroring how it finds
the real `hermes_cli.main gateway run` process.
"""
from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--reqlog", required=True)
    ap.add_argument("--token", required=True, help="pgrep-matchable marker in argv")
    ap.add_argument("--model", default="qwen3:8b-64k")
    args = ap.parse_args()

    state = {"resident": False}

    def record(event: str) -> None:
        with open(args.reqlog, "a", encoding="utf-8") as fh:
            fh.write(event + "\n")

    class Handler(BaseHTTPRequestHandler):
        def _reply(self, code: int, body: bytes = b"") -> None:
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if body:
                self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802 (stdlib signature)
            if self.path.startswith("/health"):
                self._reply(200, b'{"status":"ok"}')
            elif self.path.startswith("/api/ps"):
                models = [{"name": args.model}] if state["resident"] else []
                self._reply(200, json.dumps({"models": models}).encode())
            else:
                self._reply(404)

        def do_POST(self) -> None:  # noqa: N802 (stdlib signature)
            length = int(self.headers.get("Content-Length", 0) or 0)
            if length:
                self.rfile.read(length)
            if self.path.startswith("/api/generate"):
                state["resident"] = True
                record("PIN")
                self._reply(200, b'{"response":"ok"}')
            elif self.path.startswith("/v1/chat/completions"):
                record("WARMUP")
                self._reply(200, b'{"choices":[{"message":{"content":"ok"}}]}')
            else:
                self._reply(404)

        def log_message(self, *_args) -> None:  # silence access logging
            return

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
