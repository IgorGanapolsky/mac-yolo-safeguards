# August 2026 Research: iOS / iPad Physical Device CLI Deployment Architecture

- **Research Run ID**: `trun_fc3268d892f541d6916dd5d7084bc0c3`
- **Result URL**: [https://platform.parallel.ai/play/deep-research/trun_fc3268d892f541d6916dd5d7084bc0c3](https://platform.parallel.ai/play/deep-research/trun_fc3268d892f541d6916dd5d7084bc0c3)
- **Status**: Completed (3m 07s)
- **Target OS / Environment**: macOS 15+ / iOS 18-19 / Xcode 16+

---

## Executive Summary

1. **Tool Roles**:
   - `xcodebuild`: Compiles source code, generates `.app` bundles / `.xcarchive`, and resolves provisioning profiles against Apple Developer portal APIs via `-allowProvisioningUpdates`.
   - `xcrun devicectl`: Modern replacement for `ios-deploy` and `ideviceinstaller` in CoreDevice framework. Discovers physical iOS/iPadOS hardware over USB or local Wi-Fi, installs `.app` packages, and launches/terminates processes by bundle ID.

2. **Command Line Execution Chain (Copy-Paste Ready)**:
   ```bash
   # 1. Build signed Debug .app for physical iPad
   xcodebuild -workspace ios/HermesMobile.xcworkspace \
     -scheme HermesMobile \
     -configuration Debug \
     -destination "platform=iOS,name=iPad" \
     -derivedDataPath build \
     CODE_SIGN_STYLE=Automatic \
     DEVELOPMENT_TEAM=9GMM26JC5X \
     CODE_SIGN_IDENTITY="Apple Development" \
     -allowProvisioningUpdates \
     -allowProvisioningDeviceRegistration \
     build

   # 2. Install onto physical iPad via CoreDevice CLI
   xcrun devicectl device install app \
     --device "05E261A2-8EC4-5A2B-B752-F5632510D5B1" \
     --terminate-running-process \
     build/Build/Products/Debug-iphoneos/HermesMobile.app

   # 3. Launch process by bundle identifier
   xcrun devicectl device process launch \
     --device "05E261A2-8EC4-5A2B-B752-F5632510D5B1" \
     --terminate-running-process \
     com.iganapolsky.hermesmobile
   ```

---

## Gotchas & Failure Prevention Matrix (2026)

| Symptom | Root Cause | Fix |
|---|---|---|
| `xcodebuild exit code 65: No Accounts` | Xcode CLI has 0 Apple ID credentials saved in macOS Keychain. | Run `open -a Xcode` → Settings → Accounts → Add Apple ID. |
| `option requires argument -p` | `npx expo run:ios` commander parser treats single-dash `-allowProvisioningUpdates` as `-p` (port). | Use `xcodebuild` + `xcrun devicectl` directly or configure `ios/` workspace. |
| `Device not found in devicectl` | Device not paired / trusted. | Run `xcrun devicectl list devices` and accept **Trust This Computer** prompt on iPad. |
| `Codesign fails in headless CI` | Login Keychain locked. | Run `security unlock-keychain -p "$PASS" ~/Library/Keychains/login.keychain-db`. |

---

## Verification & Deployment Checklist
- [x] Run `xcrun devicectl list devices` to obtain iPad UDID (`05E261A2-8EC4-5A2B-B752-F5632510D5B1`).
- [x] Document non-interactive `xcodebuild` + `devicectl` execution chain.
- [x] Ingest research run `trun_fc3268d892f541d6916dd5d7084bc0c3` into codebase.
