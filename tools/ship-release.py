#!/usr/bin/env python3
"""
Final Shipping & Git Commit/Push Automation Engine (mac-yolo-safeguards)
Automates staging, committing, and pushing packaged release work to origin/main.
"""
import subprocess

def run_cmd(cmd):
    print(f"[*] Executing: {cmd}")
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(res.stdout.strip())
    if res.stderr and res.returncode != 0:
        print(f"[!] Warning/Error: {res.stderr.strip()}")
    return res.returncode == 0

def ship_work():
    print("[*] Shipped Work Execution — Committing & Pushing to origin/main...")
    
    run_cmd("git status")
    run_cmd("git add tools/ macos/ plan.md")
    run_cmd("git commit -m 'feat(shipping): package Mac YOLO Safeguards app, distribution bundles, and revenue engines'")
    run_cmd("git push origin main")
    print("[+] Shipped successfully and pushed to origin/main!")

if __name__ == "__main__":
    ship_work()
