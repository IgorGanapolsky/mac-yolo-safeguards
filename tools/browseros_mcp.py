#!/usr/bin/env python3
"""
browseros_mcp.py — minimal MCP JSON-RPC client for BrowserOS neo over HTTP/SSE.

Works with the live BrowserOS neo MCP bridge (v0.0.28). Transport: POST
JSON-RPC to <port>/mcp; responses are SSE (`data: {...}` lines).

Usage:
  python3 tools/browseros_mcp.py --list-tools [--port 9211]
  python3 tools/browseros_mcp.py --call tabs '{"action":"list"}'
  python3 tools/browseros_mcp.py --call snapshot '{"page":0}'
  python3 tools/browseros_mcp.py --call navigate '{"page":0,"action":"url","url":"https://..."}'
  python3 tools/browseros_mcp.py --call act '{"page":0,"kind":"click","ref":"e12"}'
  python3 tools/browseros_mcp.py --call screenshot '{"page":0, "path": "/tmp/x.png"}'
  python3 tools/browseros_mcp.py --call read '{"page":0}'

Big results are printed to stdout; piping to a file keeps terminal output small.
"""
import json
import sys
import urllib.request
from urllib.error import HTTPError

DEFAULT_PORT = 9211  # verified live 2026-08-09; config.yaml said 9210 (dead)
SESSION_FILE = "/tmp/browseros_mcp_session.json"  # persists mcp-session-id across driver invocations

_session_cookie = None  # "mcp-session-id: <uuid>" from initialize response, if any


def _load_session():
    try:
        with open(SESSION_FILE) as f:
            return json.load(f).get("session_id")
    except (OSError, json.JSONDecodeError):
        return None


def _save_session(sid: str) -> None:
    try:
        with open(SESSION_FILE, "w") as f:
            json.dump({"session_id": sid}, f)
    except OSError:
        pass


def rpc(port: int, payload: dict, timeout: int = 60) -> dict:
    global _session_cookie
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if _session_cookie:
        headers["mcp-session-id"] = _session_cookie
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/mcp",
        data=json.dumps(payload).encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode()
            sid = resp.headers.get("mcp-session-id")
            if sid:
                _session_cookie = sid
    except HTTPError as e:
        body = e.read().decode()
        sid = e.headers.get("mcp-session-id")
        if sid:
            _session_cookie = sid
    # SSE: each line "data: {...}" — take the LAST data json line that matches our id
    result = None
    for line in body.splitlines():
        if line.startswith("data:") and "{" in line:
            try:
                msg = json.loads(line[5:].strip())
            except json.JSONDecodeError:
                continue
            if msg.get("id") == payload.get("id"):
                result = msg
    if result is None:
        raise RuntimeError(f"No RPC result matched id {payload.get('id')}; raw: {body[:500]}")
    return result


def ensure_initialized(port: int) -> None:
    """Perform the MCP initialize handshake once; safe to call repeatedly."""
    global _session_cookie
    if _session_cookie:
        return
    persisted = _load_session()
    if persisted:
        _session_cookie = persisted
        return
    cur = rpc(port, {
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "hermes-driver", "version": "1.0"},
        },
    })
    rpc(port, {"jsonrpc": "2.0", "id": 0, "method": "notifications/initialized", "params": {}})
    if _session_cookie:
        _save_session(_session_cookie)
    return cur


def call(port: int, method: str, params: dict) -> dict:
    return rpc(port, {"jsonrpc": "2.0", "id": 1, "method": method, "params": params})


def rpc_call(name: str, arguments: dict, port: int = DEFAULT_PORT) -> dict:
    """Call an MCP tool by name with arguments (auto-init session)."""
    ensure_initialized(port)
    out = call(port, "tools/call", {"name": name, "arguments": arguments})
    result = out.get("result", out)
    content = result.get("content")
    if isinstance(content, list):
        texts = []
        for c in content:
            if isinstance(c, dict) and "text" in c:
                texts.append(c["text"])
            else:
                texts.append(json.dumps(c))
        return {"text": "\n".join(texts), "_raw": result}
    return result


def main() -> int:
    args = sys.argv[1:]
    port = DEFAULT_PORT
    if "--port" in args:
        port = int(args[args.index("--port") + 1])
        args = [a for i, a in enumerate(args) if i not in (args.index("--port"), args.index("--port") + 1)]

    if not args:
        print(__doc__)
        return 1

    ensure_initialized(port)

    if args[0] == "--list-tools":
        # One shared MCP session is auto-maintained on init; list tools directly.
        out = call(port, "tools/list", {})
        tools = out.get("result", {}).get("tools", [])
        print(f"{len(tools)} tools:")
        for t in tools:
            print(f"  {t.get('name')}: {t.get('description','')[:90]}")
        return 0

    if args[0] == "--call":
        if len(args) < 3:
            print("usage: --call <tool> '<json params>'", file=sys.stderr)
            return 2
        tool, raw = args[1], args[2]
        params = json.loads(raw) if raw else {}
        try:
            out = call(port, "tools/call", {"name": tool, "arguments": params})
        except Exception as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 3
        result = out.get("result", out)
        # MCP tools return {content: [{type: text/..., text: ...}]}
        content = result.get("content")
        if isinstance(content, list):
            for c in content:
                if isinstance(c, dict) and "text" in c:
                    print(c["text"])
                else:
                    print(json.dumps(c))
            return 0
        if "isError" in result or "error" in result:
            print(json.dumps(result, indent=2))
            return 4
        print(json.dumps(result, indent=2))
        return 0

    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main())