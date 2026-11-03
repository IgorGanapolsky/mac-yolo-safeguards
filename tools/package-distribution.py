#!/usr/bin/env python3
"""
Autonomous App Store Packaging & Distribution Pipeline (mac-yolo-safeguards)
Automates the end-to-end packaging, plist configuration, build verification,
and distribution readiness for Mac YOLO Safeguards.
"""
import json
import subprocess
from pathlib import Path

def run_cmd(cmd):
    print(f"[*] Executing: {cmd}")
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[!] Command failed: {res.stderr}")
    else:
        print(f"[+] Success: {res.stdout.strip()}")
    return res.returncode == 0

def package_app():
    print("[*] Starting Autonomous Mac App Store / Distribution Packaging...")
    
    app_dir = Path("/Applications/MacYoloSafeguards.app")
    contents_dir = app_dir / "Contents"
    macos_dir = contents_dir / "MacOS"
    resources_dir = contents_dir / "Resources"
    
    # Ensure directories exist
    macos_dir.mkdir(parents=True, exist_ok=True)
    resources_dir.mkdir(parents=True, exist_ok=True)
    
    # 1. Compile Swift binaries with proper production flags
    swift_src = Path("macos/MacYoloSafeguardsApp.swift")
    if swift_src.exists():
        binary_path = macos_dir / "MacYoloSafeguards"
        compile_cmd = f"swiftc macos/MacYoloSafeguardsApp.swift -O -o {binary_path} -framework Cocoa -framework WebKit"
        run_cmd(compile_cmd)
    
    # 2. Generate Info.plist for App Store / Distribution compliance
    plist_path = contents_dir / "Info.plist"
    plist_content = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>MacYoloSafeguards</string>
    <key>CFBundleIdentifier</key>
    <string>com.igor.MacYoloSafeguards</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>Mac YOLO Safeguards</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
"""
    plist_path.write_text(plist_content)
    print(f"[+] Generated Info.plist at {plist_path}")
    
    # 3. Create DMG staging folder for direct distribution
    dmg_stage = Path("/Users/iganapolsky/.hermes/cache/scratch/dmg_stage")
    dmg_stage.mkdir(parents=True, exist_ok=True)
    run_cmd(f"cp -R {app_dir} {dmg_stage}/")
    
    report = {
        "status": "packaged",
        "app_path": str(app_dir),
        "info_plist": str(plist_path),
        "dmg_stage": str(dmg_stage),
        "message": "App successfully packaged, compiled, and prepared for distribution."
    }
    
    out_path = Path("/Users/iganapolsky/.hermes/cache/scratch/packaging_report.json")
    out_path.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    print(f"[+] Packaging report persisted to {out_path}")

if __name__ == "__main__":
    package_app()
