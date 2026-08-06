#!/usr/bin/env python3
"""Minimal Hermes-compatible gateway for Termux on Android.

Runs on port 8642 bound to all interfaces so Hermes Mobile can reach it over
Wi-Fi LAN. Implements the surface the mobile app actually probes:

- /health and /health/detailed
- /v1/capabilities, /v1/skills, /v1/toolsets
- /api/sessions (GET, DELETE)
- /api/sessions/<id>/chat/stream (SSE)
- /v1/runs/<id>/approval (no-op)
- Pair server on port 8765 returning gatewayUrl + deepLink + hostname + localIp
"""

import argparse
import json
import os
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

API_KEY = os.environ.get("HERMES_API_KEY", "termux-live-key")
HOSTNAME = "S25-Termux"
GATEWAY_PORT = 8642
PAIR_PORT = 8765


def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("1.1.1.1", 53))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


LAN_IP = get_lan_ip()
GATEWAY_URL = f"http://{LAN_IP}:{GATEWAY_PORT}"
SESSIONS = {}


def set_globals(api_key, hostname, port):
    global API_KEY, HOSTNAME, LAN_IP, GATEWAY_URL
    API_KEY = api_key
    HOSTNAME = hostname
    LAN_IP = get_lan_ip()
    GATEWAY_URL = f"http://{LAN_IP}:{port}"


def json_bytes(obj):
    return json.dumps(obj).encode("utf-8")


class GatewayHandler(BaseHTTPRequestHandler):
    allow_reuse_address = True
    def log_message(self, fmt, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {fmt % args}")

    def _send(self, code, body=b"", content_type="application/json"):
        with open("/data/data/com.termux/files/home/hermes-gateway/requests.log", "a", encoding="utf-8") as fh:
            fh.write(f"{self.command} {self.path} -> {code} ({self.client_address[0]})\n")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length:
            return self.rfile.read(length)
        return b""

    def _auth_ok(self):
        auth = self.headers.get("Authorization", "")
        return auth.startswith("Bearer ") and auth.split(" ", 1)[1] == API_KEY

    def do_OPTIONS(self):
        self._send(204)

    def do_GET(self):
        if self.path.startswith("/health"):
            detailed = self.path.startswith("/health/detailed")
            body = {
                "status": "ok",
                "hostname": HOSTNAME,
                "gateway_state": "running",
                "local_ip": LAN_IP,
                "pid": os.getpid(),
                "platforms": ["termux-android"],
            }
            if detailed:
                body["model"] = "termux-live"
            self._send(200, json_bytes(body))
            return

        if self.path.startswith("/v1/capabilities"):
            self._send(
                200,
                json_bytes(
                    {
                        "object": "capabilities",
                        "platform": "hermes-agent",
                        "model": "termux-live",
                        "default_model": "termux-live",
                        "provider": "local",
                        "models": [{"id": "termux-live", "name": "Termux Live"}],
                        "features": {"chat": True, "jobs": True, "skills": True, "toolsets": True},
                        "endpoints": {"chat": {"method": "POST", "path": "/api/sessions/{id}/chat/stream"}},
                    }
                ),
            )
            return

        if self.path.startswith("/v1/skills"):
            self._send(200, json_bytes({"data": []}))
            return

        if self.path.startswith("/v1/obsidian/agents"):
            self._send(200, json_bytes({"agents": [], "error": None}))
            return

        if self.path.startswith("/v1/obsidian/projects"):
            self._send(
                200,
                json_bytes(
                    {
                        "projects": [
                            {
                                "slug": "mac-yolo-safeguards",
                                "name": "mac-yolo-safeguards",
                                "description": "Hermes/mac guardrails, compiled brain, mobile coordination, and cross-agent sync.",
                            }
                        ]
                    }
                ),
            )
            return

        if self.path.startswith("/v1/events"):
            self._send(200, json_bytes({"events": []}))
            return

        if self.path == "/api/sessions" or self.path.startswith("/api/sessions?"):
            if not self._auth_ok():
                self._send(401, json_bytes({"error": "Unauthorized"}))
                return
            sessions = [
                {"id": sid, "title": "Termux chat", "updated_at": now, "created_at": now}
                for sid, now in SESSIONS.items()
            ]
            self._send(200, json_bytes({"sessions": sessions}))
            return

        if self.path.startswith("/api/sessions/") and self.path.endswith("/messages"):
            if not self._auth_ok():
                self._send(401, json_bytes({"error": "Unauthorized"}))
                return
            self._send(200, json_bytes({"messages": []}))
            return

        self._send(404, json_bytes({"error": "not found"}))

    def do_POST(self):
        body = self._read_body()

        if self.path.startswith("/api/sessions"):
            if not self._auth_ok():
                self._send(401, json_bytes({"error": "Unauthorized"}))
                return
            if self.path.endswith("/chat/stream"):
                parts = self.path.split("/")
                session_id = parts[3] if len(parts) >= 4 else "default"
                SESSIONS[session_id] = int(time.time())
                try:
                    payload = json.loads(body) if body else {}
                except Exception:
                    payload = {}
                user_msg = ""
                if isinstance(payload.get("message"), str):
                    user_msg = payload["message"]
                elif isinstance(payload.get("message"), list):
                    for m in payload["message"]:
                        if isinstance(m, dict) and m.get("type") == "text":
                            user_msg += m.get("text", "")

                reply = f"Echo from {HOSTNAME} on Termux: '{user_msg.strip() or 'hello'}'. Model is termux-live."
                sse = (
                    f"event: assistant.delta\ndata: {json.dumps({'delta': reply})}\n\n"
                    f"event: assistant.completed\ndata: {json.dumps({'content': reply})}\n\n"
                    f"event: run.completed\ndata: {json.dumps({'messages': [{'role': 'assistant', 'content': reply}]})}\n\n"
                )
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "keep-alive")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(sse.encode("utf-8"))
                self.wfile.flush()
                return

            if self.path.endswith("/fork"):
                parts = self.path.split("/")
                session_id = parts[3] if len(parts) >= 4 else "default"
                new_id = f"{session_id}-fork-{int(time.time())}"
                SESSIONS[new_id] = int(time.time())
                self._send(200, json_bytes({"object": "fork", "session": {"id": new_id}}))
                return

            self._send(200, json_bytes({"object": "session", "id": "default"}))
            return

        if self.path.startswith("/v1/runs") and self.path.endswith("/approval"):
            self._send(200, json_bytes({"ok": True}))
            return

        self._send(404, json_bytes({"error": "not found"}))

    def do_DELETE(self):
        if self.path == "/api/sessions":
            if not self._auth_ok():
                self._send(401, json_bytes({"error": "Unauthorized"}))
                return
            SESSIONS.clear()
            self._send(200, json_bytes({"ok": True}))
            return

        if self.path.startswith("/api/sessions/"):
            if not self._auth_ok():
                self._send(401, json_bytes({"error": "Unauthorized"}))
                return
            parts = self.path.split("/")
            if len(parts) >= 4:
                sid = parts[3]
                SESSIONS.pop(sid, None)
            self._send(200, json_bytes({"ok": True}))
            return

        self._send(404, json_bytes({"error": "not found"}))


class PairHandler(BaseHTTPRequestHandler):
    allow_reuse_address = True
    def log_message(self, fmt, *args):
        print(f"[{time.strftime('%H:%M:%S')}] PAIR {fmt % args}")

    def do_GET(self):
        if self.path.startswith("/pair.json"):
            deep_link = (
                f"hermes://setup?"
                f"url={GATEWAY_URL.replace('/', '%2F').replace(':', '%3A')}"
                f"&key={API_KEY}"
                f"&name={HOSTNAME}"
                f"&localIp={LAN_IP}"
            )
            body = json_bytes(
                {
                    "gatewayUrl": GATEWAY_URL,
                    "deepLink": deep_link,
                    "hostname": HOSTNAME,
                    "localIp": LAN_IP,
                    "qrUrl": f"{GATEWAY_URL}/pair-qr.png",
                }
            )
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=GATEWAY_PORT)
    ap.add_argument("--pair-port", type=int, default=PAIR_PORT)
    ap.add_argument("--api-key", default=API_KEY)
    ap.add_argument("--hostname", default=HOSTNAME)
    args = ap.parse_args()

    set_globals(args.api_key, args.hostname, args.port)

    print(f"Starting Hermes Termux gateway on {GATEWAY_URL}")
    print(f"Pair server on http://{LAN_IP}:{args.pair_port}/pair.json")
    print(f"API key: {API_KEY}")

    gateway = ThreadingHTTPServer(("0.0.0.0", args.port), GatewayHandler)
    gateway.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    pair = ThreadingHTTPServer(("0.0.0.0", args.pair_port), PairHandler)
    pair.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    threading.Thread(target=gateway.serve_forever, daemon=True).start()
    threading.Thread(target=pair.serve_forever, daemon=True).start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down...")
        gateway.shutdown()
        pair.shutdown()


if __name__ == "__main__":
    raise SystemExit(main())
