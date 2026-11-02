#!/usr/bin/env python3
"""
Rust Core Companion & End-to-End Verification Engine (mac-yolo-safeguards)
Compiles the real zero-dependency native arm64 Rust engine (`rust-core` -> `bin/mac-yolo-rust-core`),
verifies all 4 critical hot paths (`hud-disk-recs`, `pre-tool-gate`, `safety-hook`, `telemetry`),
and measures real end-to-end latency speedup vs the legacy Node/child-process paths.
"""
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUST_DIR = ROOT / "rust-core"
BIN_PATH = ROOT / "bin" / "mac-yolo-rust-core"


def bench_cmd(cmd, stdin_bytes=b"", runs=5, env_over=None):
    env = os.environ.copy()
    if env_over:
        env.update(env_over)
    samples = []
    last_out = ""
    last_code = 0
    for _ in range(runs):
        t0 = time.perf_counter()
        res = subprocess.run(cmd, input=stdin_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
        samples.append((time.perf_counter() - t0) * 1000.0)
        last_out = res.stdout.decode("utf-8", errors="replace").strip()
        last_code = res.returncode
    return {
        "avg_ms": round(sum(samples) / len(samples), 2),
        "min_ms": round(min(samples), 2),
        "max_ms": round(max(samples), 2),
        "exit_code": last_code,
        "sample_output": last_out,
    }


def run_e2e_verification():
    print("[*] Building & Verifying Real Native arm64 Rust Hot-Path Engine (mac-yolo-rust-core)...")
    assert (RUST_DIR / "Cargo.toml").exists(), "rust-core/Cargo.toml missing!"
    assert (RUST_DIR / "src" / "main.rs").exists(), "rust-core/src/main.rs missing!"

    build_res = subprocess.run(
        ["cargo", "build", "--release", "--manifest-path", str(RUST_DIR / "Cargo.toml")],
        capture_output=True,
        text=True,
    )
    if build_res.returncode != 0:
        raise RuntimeError(f"cargo build --release failed: {build_res.stderr}")

    release_bin = RUST_DIR / "target" / "release" / "mac-yolo-rust-core"
    BIN_PATH.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(release_bin, BIN_PATH)
    os.chmod(BIN_PATH, 0o755)
    subprocess.run(["codesign", "-f", "-s", "-", str(BIN_PATH)], capture_output=True)

    # Warm macOS exec cache once before timing
    subprocess.run([str(BIN_PATH), "--version"], capture_output=True)

    # 1. Benchmark HUD 3-second disk recommendation probe: Rust native vs legacy Node (6x du + git)
    rust_hud = bench_cmd([str(BIN_PATH), "hud-disk-recs"], runs=5)
    node_legacy_hud = bench_cmd(
        ["node", str(ROOT / "tools" / "hud-live-recommendations.js")],
        runs=3,
        env_over={"MAC_YOLO_DISABLE_RUST_CORE": "1"},
    )
    hud_json = json.loads(rust_hud["sample_output"])
    assert hud_json.get("ok") is True and hud_json.get("engine") == "rust-native"

    # 2. Benchmark PreToolUse production gate: Rust native vs Node hook
    allow_payload = b'{"tool_name":"Bash","tool_input":{"command":"git status"}}'
    block_payload = b'{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}'
    rust_gate_allow = bench_cmd([str(BIN_PATH), "pre-tool-gate"], stdin_bytes=allow_payload, runs=5)
    rust_gate_block = bench_cmd([str(BIN_PATH), "pre-tool-gate"], stdin_bytes=block_payload, runs=3)
    node_gate_allow = bench_cmd(
        ["node", str(ROOT / "hooks" / "pre-tool-production-gate.js")],
        stdin_bytes=allow_payload,
        runs=3,
    )
    assert rust_gate_allow["exit_code"] == 0
    assert rust_gate_block["exit_code"] == 2
    assert json.loads(rust_gate_block["sample_output"])["decision"] == "BLOCK"

    # 3. Benchmark Grok Build safety hook: Rust native vs Node hook
    rust_safety = bench_cmd([str(BIN_PATH), "safety-hook"], stdin_bytes=allow_payload, runs=5)
    node_safety = bench_cmd(
        ["node", str(ROOT / "hooks" / "grok-build-fleet" / "pre-tool-use-safety.js")],
        stdin_bytes=allow_payload,
        runs=3,
    )
    assert rust_safety["exit_code"] == 0

    # 4. Benchmark System Care process & browser telemetry: Rust single-pass vs legacy Node
    rust_telem = bench_cmd([str(BIN_PATH), "telemetry", "--write-scratch"], runs=5)
    telem_json = json.loads(rust_telem["sample_output"])
    assert telem_json.get("ok") is True
    assert telem_json.get("processCount", 0) > 50
    assert len(telem_json.get("culprits", {}).get("topCpu", [])) == 5

    report = {
        "status": "verified",
        "rust_core_built": True,
        "binary_path": str(BIN_PATH),
        "binary_size_bytes": BIN_PATH.stat().st_size,
        "e2e_tests_passed": True,
        "benchmarks": {
            "hud_disk_recs": {
                "rust_native_avg_ms": rust_hud["avg_ms"],
                "rust_internal_compute_ms": hud_json.get("latencyMs"),
                "legacy_node_du_avg_ms": node_legacy_hud["avg_ms"],
                "speedup_x": round(node_legacy_hud["avg_ms"] / max(0.1, rust_hud["avg_ms"]), 2),
            },
            "pre_tool_production_gate": {
                "rust_native_avg_ms": rust_gate_allow["avg_ms"],
                "legacy_node_avg_ms": node_gate_allow["avg_ms"],
                "speedup_x": round(node_gate_allow["avg_ms"] / max(0.1, rust_gate_allow["avg_ms"]), 2),
            },
            "grok_safety_hook": {
                "rust_native_avg_ms": rust_safety["avg_ms"],
                "legacy_node_avg_ms": node_safety["avg_ms"],
                "speedup_x": round(node_safety["avg_ms"] / max(0.1, rust_safety["avg_ms"]), 2),
            },
            "process_and_browser_telemetry": {
                "rust_native_avg_ms": rust_telem["avg_ms"],
                "rust_internal_compute_ms": telem_json.get("telemetry_latency_ms"),
                "live_processes_scanned": telem_json.get("processCount"),
            },
        },
    }

    out_path = Path.home() / ".hermes" / "cache" / "scratch" / "e2e_rust_verification.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    print(f"[+] E2E Rust verification report saved to {out_path}")


if __name__ == "__main__":
    run_e2e_verification()
