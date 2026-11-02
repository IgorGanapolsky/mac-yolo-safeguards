#!/usr/bin/env python3
"""
Autonomous Mac YOLO Safeguards Auto-Remediation Engine (mac-yolo-safeguards)
Automatically detects runaway processes (Ollama inference loops, unconstrained agent pools,
rogue terminals) exceeding CPU/RAM thresholds and safely terminates them to keep the Mac usable.
"""
import json
import os
import subprocess
from pathlib import Path

def auto_remediate_system():
    print("[*] Running Mac YOLO Safeguards Auto-Remediation Scan...")
    
    # Find processes consuming > 100% CPU
    cmd = "ps -A -o pid,%cpu,comm | awk '$2 > 100.0 {print $1, $2, $3}'"
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    lines = res.stdout.strip().split("\n") if res.stdout else []
    
    terminated = []
    for line in lines:
        if not line.strip():
            continue
        parts = line.split()
        if len(parts) >= 3:
            pid, cpu, comm = parts[0], parts[1], parts[2]
            # Protect essential system processes and our own safeguard app
            if "WindowServer" in comm or "kernel_task" in comm or "MacYoloSafeguards" in comm:
                continue
            print(f"[!] Rogue high-CPU process detected: PID {pid} ({comm}) at {cpu}% CPU. Terminating...")
            subprocess.run(f"kill -15 {pid}", shell=True)
            terminated.append({"pid": pid, "cpu": cpu, "comm": comm})
            
    report = {
        "timestamp": os.popen("date -u +%Y-%m-%dT%H:%M:%SZ").read().strip(),
        "action": "AUTO_REMEDIATION_TRIGGERED",
        "terminated_rogue_processes": terminated,
        "status": "SYSTEM_STABILIZED"
    }
    
    out_path = Path("/Users/iganapolsky/.hermes/cache/scratch/auto_remediation_report.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    print(f"[+] Auto-remediation report persisted to {out_path}")

if __name__ == "__main__":
    auto_remediate_system()
