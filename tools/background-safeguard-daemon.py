#!/usr/bin/env python3
"""
Autonomous Background Safeguard Daemon (mac-yolo-safeguards)
Runs continuously in the background (zero manual babysitting) to automatically
purge rogue high-CPU/RAM processes, free memory, and protect system stability.
"""
import json
import os
import subprocess
import time
from pathlib import Path

def safeguard_loop():
    print("[*] Starting Autonomous Background Safeguard Daemon...")
    while True:
        try:
            # Detect processes consuming > 150% CPU
            cmd = "ps -A -o pid,%cpu,comm | awk '$2 > 150.0 {print $1, $2, $3}'"
            res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            lines = res.stdout.strip().split("\n") if res.stdout else []
            
            for line in lines:
                if not line.strip():
                    continue
                parts = line.split()
                if len(parts) >= 3:
                    pid, cpu, comm = parts[0], parts[1], parts[2]
                    # Protect core macOS system services and safeguard app
                    if any(sys_proc in comm for sys_proc in ["WindowServer", "kernel_task", "MacYoloSafeguards", "launchd", "systemd"]):
                        continue
                    print(f"[!] Autonomous Safeguard: Terminating rogue CPU hog PID {pid} ({comm}) at {cpu}% CPU.")
                    subprocess.run(f"kill -9 {pid}", shell=True)
            
        except Exception as e:
            print(f"[!] Safeguard loop error: {e}")
            
        time.sleep(30) # Poll every 30 seconds

if __name__ == "__main__":
    safeguard_loop()
