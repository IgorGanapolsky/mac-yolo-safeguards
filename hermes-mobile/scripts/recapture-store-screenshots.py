#!/usr/bin/env python3
"""Device capture for 6 distinct store frames with per-frame verification."""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_ANDROID = ROOT / "fastlane/metadata/android/en-US/images/phoneScreenshots"
OUT_IOS = ROOT / "fastlane/metadata/ios/en-US/screenshots"
PROOF = ROOT / "docs/proofs/screenshot-recapture-20260709"
DEVICE = "R3CY90QPM7E"
PKG = "com.iganapolsky.hermesmobile"
PAIR_JS = ROOT.parent / "tools/hermes-mobile-pair.js"


def adb(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["adb", "-s", DEVICE, *args],
        capture_output=True,
        text=True,
        check=check,
    )


def wait_device(timeout_s: int = 90) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        proc = adb("get-state", check=False)
        if proc.returncode == 0 and "device" in (proc.stdout or ""):
            return
        time.sleep(2)
    raise RuntimeError(f"device {DEVICE} not connected after {timeout_s}s")


def ui_dump() -> ET.Element:
    wait_device()
    adb("shell", "uiautomator", "dump", "/sdcard/ui.xml", check=False)
    adb("pull", "/sdcard/ui.xml", "/tmp/hermes-ui.xml", check=False)
    return ET.parse("/tmp/hermes-ui.xml").getroot()


def ui_text() -> str:
    root = ui_dump()
    parts: list[str] = []
    for node in root.iter("node"):
        for key in ("resource-id", "text", "content-desc"):
            val = node.attrib.get(key, "")
            if val:
                parts.append(val)
    return "\n".join(parts)


def ui_has(pattern: str) -> bool:
    return re.search(pattern, ui_text(), re.IGNORECASE) is not None


def tap_rid(needle: str) -> bool:
    root = ui_dump()
    for node in root.iter("node"):
        rid = node.attrib.get("resource-id", "")
        text = node.attrib.get("text", "")
        if needle in rid or text == needle:
            bounds = node.attrib.get("bounds", "")
            m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds)
            if not m:
                continue
            x1, y1, x2, y2 = map(int, m.groups())
            x, y = (x1 + x2) // 2, (y1 + y2) // 2
            adb("shell", "input", "tap", str(x), str(y))
            print(f"tapped {needle} at {x},{y}")
            return True
    print(f"NOT FOUND: {needle}", file=sys.stderr)
    return False


def scroll_until(needle: str, direction: str = "down", max_swipes: int = 12) -> bool:
    for _ in range(max_swipes):
        if ui_has(re.escape(needle)):
            return True
        if direction == "down":
            swipe_up(1)
        else:
            wait_device()
            adb("shell", "input", "swipe", "540", "650", "540", "1680", "350")
            time.sleep(0.7)
    return ui_has(re.escape(needle))


def swipe_down(times: int = 1) -> None:
    for _ in range(times):
        wait_device()
        adb("shell", "input", "swipe", "540", "650", "540", "1680", "350")
        time.sleep(0.7)


def capture(name: str, wait_s: float = 3.0) -> Path:
    time.sleep(wait_s)
    wait_device()
    remote = f"/sdcard/hermes-store-{name}.png"
    adb("shell", "screencap", "-p", remote)
    OUT_ANDROID.mkdir(parents=True, exist_ok=True)
    OUT_IOS.mkdir(parents=True, exist_ok=True)
    PROOF.mkdir(parents=True, exist_ok=True)
    dest = OUT_ANDROID / f"{name}.png"
    adb("pull", remote, str(dest))
    (OUT_IOS / f"{name}.png").write_bytes(dest.read_bytes())
    (PROOF / f"{name}.png").write_bytes(dest.read_bytes())
    print(f"captured {name} -> {dest}")
    return dest


def pixel_report() -> dict[str, float]:
    from PIL import Image

    frames = sorted(OUT_ANDROID.glob("*.png"))
    report: dict[str, float] = {}
    for i, a in enumerate(frames):
        for b in frames[i + 1 :]:
            i1 = Image.open(a).convert("RGB").resize((270, 480))
            i2 = Image.open(b).convert("RGB").resize((270, 480))
            pa, pb = i1.tobytes(), i2.tobytes()
            score = 100.0 * sum(1 for x, y in zip(pa, pb) if x == y) / len(pa)
            report[f"{a.stem}_vs_{b.stem}"] = round(score, 2)
    return report


def main() -> int:
    results: dict[str, str] = {}

    wait_device()
    if PAIR_JS.is_file():
        subprocess.run(["node", str(PAIR_JS), "--no-serve"], cwd=ROOT.parent, check=False)
        time.sleep(2)

    adb("shell", "am", "force-stop", PKG)
    time.sleep(1)
    adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
    time.sleep(6)

    if ui_has(r"pair-qr-scanner-help|Scan QR from your computer"):
        tap_rid("Close") or adb("shell", "input", "keyevent", "4")

    tap_rid("tab-hermes")
    time.sleep(3)
    results["01_approve"] = "pass" if ui_has(r"chat-input|HERMES CHAT|Ask anything|chat-empty") else "fail"
    capture("01_approve", 4)

    tap_rid("tab-leash")
    time.sleep(2)
    swipe_down(3)
    tap_rid("leash-smoke-test")
    time.sleep(3)
    results["02_block"] = "pass" if ui_has(r"leash-thumbs-up") else "fail"
    capture("02_block", 4)

    tap_rid("tab-settings")
    time.sleep(2)
    scroll_until("approval-policy-strict", "down", 14)
    results["03_standing"] = (
        "pass"
        if ui_has(r"approval-policy-strict|approval-policy-autonomous|Standing|strict|Autonomous")
        else "fail"
    )
    capture("03_standing", 3)

    tap_rid("tab-settings")
    time.sleep(2)
    scroll_until("scan-pairing-qr", "down", 14)
    tap_rid("scan-pairing-qr")
    time.sleep(3)
    results["04_pair"] = (
        "pass" if ui_has(r"pair-qr-scanner-help|Scan QR from your computer|Scan local QR") else "fail"
    )
    capture("04_pair", 3)
    adb("shell", "input", "keyevent", "4")
    time.sleep(1)

    tap_rid("tab-hermes")
    time.sleep(3)
    scroll_until("chat-output-feedback", "down", 10)
    if not ui_has(r"chat-output-feedback"):
        # Fallback: Leash thumb switches (distinct from chat hero)
        tap_rid("tab-leash")
        time.sleep(2)
        scroll_until("Thumbs down", "down", 8)
    results["05_thumbgate"] = (
        "pass" if ui_has(r"chat-output-feedback|Thumbs down|remember block|ThumbGate") else "fail"
    )
    capture("05_thumbgate", 3)

    tap_rid("tab-settings")
    time.sleep(2)
    swipe_down(4)
    results["06_works"] = (
        "pass"
        if ui_has(r"settings-cellular-tunnel-banner|cellular|tunnel|Saved computers|Connection mode")
        else "fail"
    )
    capture("06_works", 3)

    distinct = subprocess.run(
        [sys.executable, str(ROOT / "scripts/_assert_store_frame_distinct.py"), str(OUT_ANDROID)],
        capture_output=True,
        text=True,
    )
    results["01_vs_05_distinct"] = "pass" if distinct.returncode == 0 else "fail"
    print(distinct.stdout, distinct.stderr)

    report = pixel_report()
    bad = {k: v for k, v in report.items() if v >= 95.0}
    proof = {
        "frames": results,
        "pixel_similarity": report,
        "bad_pairs_95plus": bad,
    }
    PROOF.mkdir(parents=True, exist_ok=True)
    (PROOF / "capture-report.json").write_text(json.dumps(proof, indent=2) + "\n")

    print("=== FRAME RESULTS ===")
    for key, val in results.items():
        print(f"{key}: {val}")
    print("bad_pairs:", bad or "none")

    failed = [k for k, v in results.items() if v != "pass"] or bad
    return 1 if failed else 0


def swipe_up(times: int = 1) -> None:
    for _ in range(times):
        wait_device()
        adb("shell", "input", "swipe", "540", "1680", "540", "650", "350")
        time.sleep(0.7)


if __name__ == "__main__":
    sys.exit(main())
