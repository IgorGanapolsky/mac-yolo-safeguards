#!/usr/bin/env python3
"""
Autonomous Codebase Hygiene & Cleanup Engine (mac-yolo-safeguards)
Scans for temporary cache files, old logs, dangling build artifacts, and stale test outputs,
automatically cleaning and organizing them to keep the repository production-ready.
"""
import os
import shutil
from pathlib import Path

TARGET_PATTERNS = [
    "**/__pycache__",
    "**/.DS_Store",
    "**/node_modules/.cache",
    "**/*.pyc",
    "**/*.log",
]

def run_cleanup():
    root = Path("/Users/iganapolsky/workspace/mac-yolo-safeguards")
    print("[*] Starting Autonomous Codebase Cleanup & Optimization...")
    removed_count = 0
    
    for pattern in ["**/__pycache__", "**/.DS_Store", "**/*.pyc"]:
        for p in root.glob(pattern):
            try:
                if p.is_dir():
                    shutil.rmtree(p)
                else:
                    p.unlink()
                removed_count += 1
                print(f"[+] Removed artifact: {p.relative_to(root)}")
            except Exception as e:
                print(f"[-] Failed to remove {p}: {e}")
                
    print(f"[+] Cleanup complete. Removed {removed_count} stale cache items.")

if __name__ == "__main__":
    run_cleanup()
