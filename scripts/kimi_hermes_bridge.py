#!/usr/bin/env python3
"""Kimi Work <-> Hermes local bridge.

Kimi Work currently has public claims around local folders/WebBridge/Python, but
no documented local IPC contract. This bridge gives it a stable mounted-folder
contract: append JSON tasks to an inbox, run Hermes in YOLO mode, and collect
JSONL results from an outbox.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HOME = Path.home()
HERMES_HOME = Path(os.environ.get("HERMES_HOME", HOME / ".hermes")).expanduser()
BRIDGE_DIR = Path(os.environ.get("HERMES_KIMI_WORK_DIR", HERMES_HOME / "kimi-work")).expanduser()
INBOX_JSONL = BRIDGE_DIR / "inbox.jsonl"
OUTBOX_JSONL = BRIDGE_DIR / "outbox.jsonl"
STATE_JSON = BRIDGE_DIR / "state.json"
README_MD = BRIDGE_DIR / "README.md"

DEFAULT_PROVIDER = os.environ.get("HERMES_KIMI_PROVIDER", "kimi-coding")
DEFAULT_MODEL = os.environ.get("HERMES_KIMI_MODEL", "kimi-k2.7-code")
DEFAULT_TOOLSETS = os.environ.get(
    "HERMES_KIMI_TOOLSETS",
    "terminal,file,web,browser,code_execution,vision,computer_use,skills,todo,memory,session_search,delegation,cronjob,messaging",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ensure_bridge_dir() -> None:
    BRIDGE_DIR.mkdir(parents=True, exist_ok=True)
    if README_MD.exists():
        return
    README_MD.write_text(
        "# Kimi Work Hermes Bridge\n\n"
        "Mount this folder in Kimi Work when Kimi should delegate local tasks to Hermes.\n\n"
        "Append one JSON object per line to `inbox.jsonl`:\n\n"
        "```json\n"
        '{"id":"task-1","prompt":"Run yolo-health and summarize blockers","provider":"kimi-coding","model":"kimi-k2.7-code"}\n'
        "```\n\n"
        "Then run `scripts/kimi_hermes_bridge.py process-inbox`. Results append to `outbox.jsonl`.\n\n"
        "Keep secrets in keychain/env/browser sessions. Do not put passwords or API keys in bridge tasks.\n",
        encoding="utf-8",
    )


def find_hermes_bin(explicit: str | None = None) -> str | None:
    candidates = [
        explicit or "",
        os.environ.get("HERMES_BIN", ""),
        shutil.which("hermes") or "",
        str(HOME / ".local/bin/hermes"),
        str(HERMES_HOME / "hermes-agent/venv/bin/hermes"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return None


def run_command(argv: list[str], timeout: int) -> dict[str, Any]:
    started = time.time()
    try:
        proc = subprocess.run(argv, text=True, capture_output=True, timeout=timeout, check=False)
        return {
            "ok": proc.returncode == 0,
            "exit_code": proc.returncode,
            "elapsed_ms": int((time.time() - started) * 1000),
            "stdout": proc.stdout,
            "stderr": proc.stderr,
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "exit_code": 124,
            "elapsed_ms": int((time.time() - started) * 1000),
            "stdout": exc.stdout or "",
            "stderr": f"timeout after {timeout}s",
        }


def append_jsonl(path: Path, item: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n")


def redacted_kimi_env() -> dict[str, Any]:
    env_path = HERMES_HOME / ".env"
    keys: list[dict[str, Any]] = []
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
            if not line or line.lstrip().startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if "KIMI" in key or "MOONSHOT" in key:
                keys.append({"name": key, "set": bool(value.strip()), "value": "[REDACTED]" if value.strip() else ""})
    return {"env_path": str(env_path), "kimi_or_moonshot_keys": keys}


def build_hermes_args(task: dict[str, Any], hermes_bin: str) -> list[str]:
    prompt = str(task.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("task prompt is required")
    argv = [hermes_bin, "--yolo", "--accept-hooks", "-z", prompt]
    provider = task.get("provider", DEFAULT_PROVIDER)
    model = task.get("model", DEFAULT_MODEL)
    toolsets = task.get("toolsets", DEFAULT_TOOLSETS)
    skills = task.get("skills")
    if provider:
        argv.extend(["--provider", str(provider)])
    if model:
        argv.extend(["--model", str(model)])
    if toolsets:
        argv.extend(["--toolsets", str(toolsets)])
    if skills:
        argv.extend(["--skills", str(skills)])
    return argv


def load_tasks() -> list[dict[str, Any]]:
    ensure_bridge_dir()
    tasks: list[dict[str, Any]] = []
    if INBOX_JSONL.exists():
        for line_no, line in enumerate(INBOX_JSONL.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            item = json.loads(line)
            item.setdefault("id", f"line-{line_no}-{uuid.uuid4().hex[:8]}")
            tasks.append(item)

    legacy = HERMES_HOME / "kimi_work_inbox.json"
    if legacy.exists():
        data = json.loads(legacy.read_text(encoding="utf-8"))
        for item in data.get("tasks", []):
            item.setdefault("id", f"legacy-{uuid.uuid4().hex[:8]}")
            tasks.append(item)
        legacy.unlink()
    return tasks


def setup(_: argparse.Namespace) -> int:
    ensure_bridge_dir()
    print(json.dumps({"bridge_dir": str(BRIDGE_DIR), "inbox": str(INBOX_JSONL), "outbox": str(OUTBOX_JSONL)}, indent=2))
    return 0


def doctor(args: argparse.Namespace) -> int:
    ensure_bridge_dir()
    hermes_bin = find_hermes_bin(args.hermes_bin)
    status: dict[str, Any] = {
        "bridge_dir": str(BRIDGE_DIR),
        "hermes_bin": hermes_bin,
        "hermes_found": bool(hermes_bin),
        "defaults": {"provider": DEFAULT_PROVIDER, "model": DEFAULT_MODEL, "toolsets": DEFAULT_TOOLSETS},
        "env": redacted_kimi_env(),
    }
    if hermes_bin:
        status["hermes_version"] = run_command([hermes_bin, "--version"], timeout=15)
        status["hermes_status"] = run_command([hermes_bin, "status"], timeout=45)
    STATE_JSON.write_text(json.dumps({"updated_at": now_iso(), "doctor": status}, indent=2), encoding="utf-8")
    print(json.dumps(status, indent=2))
    return 0 if hermes_bin else 127


def enqueue(args: argparse.Namespace) -> int:
    ensure_bridge_dir()
    task = {
        "id": args.id or f"kimi-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}",
        "prompt": args.prompt,
        "provider": args.provider,
        "model": args.model,
        "toolsets": args.toolsets,
        "skills": args.skills,
        "created_at": now_iso(),
    }
    append_jsonl(INBOX_JSONL, {k: v for k, v in task.items() if v not in (None, "")})
    print(json.dumps({"queued": task["id"], "inbox": str(INBOX_JSONL)}, indent=2))
    return 0


def process_inbox(args: argparse.Namespace) -> int:
    ensure_bridge_dir()
    hermes_bin = find_hermes_bin(args.hermes_bin)
    if not hermes_bin:
        print("Hermes binary not found", file=sys.stderr)
        return 127
    tasks = load_tasks()
    if not tasks:
        print(f"No Kimi Work tasks found at {INBOX_JSONL}")
        return 0

    exit_code = 0
    results = []
    for task in tasks:
        result: dict[str, Any] = {
            "id": task.get("id"),
            "started_at": now_iso(),
            "provider": task.get("provider", DEFAULT_PROVIDER),
            "model": task.get("model", DEFAULT_MODEL),
        }
        try:
            argv = build_hermes_args(task, hermes_bin)
            if args.dry_run:
                result.update({"ok": True, "dry_run": True, "argv": argv})
            else:
                run = run_command(argv, timeout=args.timeout)
                result.update(run)
                if not run["ok"]:
                    exit_code = int(run.get("exit_code") or 1)
        except Exception as exc:
            result.update({"ok": False, "exit_code": 1, "stderr": str(exc)})
            exit_code = 1
        result["finished_at"] = now_iso()
        append_jsonl(OUTBOX_JSONL, result)
        results.append({"id": result.get("id"), "ok": result.get("ok"), "exit_code": result.get("exit_code")})

    if INBOX_JSONL.exists() and not args.keep_inbox and not args.dry_run:
        INBOX_JSONL.unlink()
    STATE_JSON.write_text(json.dumps({"updated_at": now_iso(), "last_results": results}, indent=2), encoding="utf-8")
    print(json.dumps({"processed": len(results), "outbox": str(OUTBOX_JSONL), "exit_code": exit_code}, indent=2))
    return exit_code


def main() -> int:
    parser = argparse.ArgumentParser(description="Kimi Work <-> Hermes local bridge")
    parser.add_argument("--hermes-bin", help="Hermes executable override")
    sub = parser.add_subparsers(dest="command")

    p_setup = sub.add_parser("setup", help="Create bridge directory contract")
    p_setup.set_defaults(func=setup)

    p_doctor = sub.add_parser("doctor", help="Verify bridge and Hermes readiness")
    p_doctor.set_defaults(func=doctor)

    p_enqueue = sub.add_parser("enqueue", help="Append a task to the Kimi Work inbox")
    p_enqueue.add_argument("--prompt", required=True)
    p_enqueue.add_argument("--id")
    p_enqueue.add_argument("--provider", default=DEFAULT_PROVIDER)
    p_enqueue.add_argument("--model", default=DEFAULT_MODEL)
    p_enqueue.add_argument("--toolsets", default=DEFAULT_TOOLSETS)
    p_enqueue.add_argument("--skills")
    p_enqueue.set_defaults(func=enqueue)

    p_process = sub.add_parser("process-inbox", help="Run inbox tasks through Hermes")
    p_process.add_argument("--dry-run", action="store_true")
    p_process.add_argument("--keep-inbox", action="store_true")
    p_process.add_argument("--timeout", type=int, default=3600)
    p_process.set_defaults(func=process_inbox)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return 2
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
