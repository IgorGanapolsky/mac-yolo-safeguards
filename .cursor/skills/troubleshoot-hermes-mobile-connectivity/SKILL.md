---
name: troubleshoot-hermes-mobile-connectivity
description: Diagnoses Hermes Mobile "can't reach your computer" errors, pairing failures, and misleading connectivity banners. Use when the phone shows unreachable Mac/Hermes, pairing fails (localIp missing), LAN URLs (10.x/192.168.x) fail on cellular/5G, or sends timeout after 60–120s. Repo mac-yolo-safeguards / hermes-mobile.
---

# Troubleshoot Hermes Mobile connectivity

## Symptom → likely cause (check in order)

| Symptom | Likely cause | Not the cause |
|---------|--------------|---------------|
| Banner: "can't reach Hermes/computer" + gateway is `10.x` or `192.168.x` | Phone off same Wi‑Fi (5G/cellular, different network) | Random app bug |
| Pairing: `Gateway health missing localIp` | Gateway `/health` no longer returns `local_ip` | Phone USB broken |
| Header shows computer IP but send fails | LAN-only URL unreachable from phone network | `session_in_use` (different message) |
| Works on Mac mini IP, fails after reinstall | Fresh install + pair pushed **this Mac's** LAN IP, not saved profile | Stale APK |

## Evidence commands (run all; paste outputs)

```bash
node tools/agent-session-start.js
adb devices
curl -sf -m 3 http://127.0.0.1:8642/health
curl -sf -m 3 http://<gateway-host-from-screenshot>:8642/health   # from Mac
node tools/hermes-mobile-pair.js   # only after gateway up
```

On Mac, also:

```bash
xcrun simctl list runtimes          # empty = no iOS sim for E2E fallback
ipconfig getifaddr en0 2>/dev/null  # compare to paired URL
```

## Decision tree

```
Phone gateway URL private LAN (10.x / 192.168.x / *.local)?
├─ YES → Phone on same Wi‑Fi as that host?
│   ├─ NO  → REAL connectivity failure. Fix: same Wi‑Fi, Switch computer, or tunnel URL (Settings → Advanced).
│   └─ YES → curl /health from Mac; if OK, check API key / chat errors (operational, not connectivity).
└─ NO (https tunnel / public host) → curl /health; check tunnel process + API key.
```

## Code map (where copy & logic live)

| Area | Path |
|------|------|
| User-facing unreachable copy | `hermes-mobile/src/utils/chatErrors.ts` → `friendlyMacUnreachableMessage` |
| LAN URL detection | `hermes-mobile/src/utils/gatewayEndpoint.ts` → `isPrivateLanGatewayUrl` |
| Send blocked when Mac down | `hermes-mobile/src/screens/ChatScreen.tsx` → `macChatLive`, `sendUserText` |
| Failed send banner (timer) | `hermes-mobile/src/components/RunProgressBanner.tsx` |
| Mac pair + LAN fallback | `tools/hermes-mobile-pair.js` → `resolveLanIp` |
| Saved computers / offline | `hermes-mobile/src/components/ChatConnectionPanel.tsx`, `GatewayProfilePicker` |

**Connectivity vs operational:** `humanizeChatError` → `kind: 'connectivity'` only for network markers (`failed to fetch`, `timeout`, `econnrefused`). `session_in_use`, `session_not_found`, `invalid_api_key` are **operational** — never label those "can't reach Mac".

## Fix playbook

1. **Wrong network:** User on 5G + paired `10.2.29.103` → explain Wi‑Fi-only; do not claim bug.
2. **Pair after reinstall:** `adb devices` → `node tools/hermes-mobile-pair.js`. If `localIp` missing, pair script uses `resolveLanIp` from network interfaces.
3. **Wrong computer:** Switch to saved Mac mini profile or re-pair target host.
4. **Away from home:** Tunnel URL in Settings — pair script cannot invent a tunnel.
5. **Copy fix:** For LAN URLs, message must say **home Wi‑Fi only / same network / tunnel** — not generic "Hermes unreachable".

## Install after fix

```bash
cd hermes-mobile
npm test -- --testPathPattern="chatErrors|gatewayEndpoint" --maxWorkers=1
HERMES_MOBILE_FORCE_BUILD=1 bash scripts/install-phone-release.sh
```

If `INSTALL_FAILED_UPDATE_INCOMPATIBLE`: `adb uninstall com.iganapolsky.hermesmobile` then reinstall (wipes app data — re-pair after).

## Report format

| Check | Result | Evidence |
|-------|--------|----------|
| Gateway /health on localhost | | curl output |
| Gateway /health at paired host (from Mac) | | curl output |
| Phone network vs URL type | LAN + cellular? | screenshot / user |
| Pair script | | exit code + last line |
| Error class | connectivity / operational | `humanizeChatError` kind |

Do not say "fixed" until send succeeds on device or honest blocker is stated.
