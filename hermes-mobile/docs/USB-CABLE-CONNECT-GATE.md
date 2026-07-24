# USB cable connect gate (2026-07-24)

## Why this exists

Daily dogfood loop: cable plugged, agents “fix” connect, CI green, next day **Not connected / Your computer** again.

Root gap: unit tests mock `liveUsbReachable`; emulator ship-guard uses **demo** bootstrap; continuous device E2E often **skips** when the phone is in use. Nothing failed merge when **adb reverse + Mac :8642** worked but the app stayed on sticky Tailscale with phone VPN offline.

## Ranked transport law (frozen)

1. **Live same-Mac USB reverse** — phone `127.0.0.1:8642/health` returns hostname matching the selected Mac  
2. **Sticky Tailscale** for that Mac (phone Tailscale VPN on)  
3. **Home Wi‑Fi LAN** for that Mac  
4. Other saved computers / pair  

Header may show `Name · USB` only when live `/health` is green|amber with a real hostname. Red health → generic **Your computer** (multi-Mac honesty) — that is intentional UX when the *app* cannot prove the cable, not proof the cable is dead.

## Commands

```bash
# Static policy only (CI-safe, no phone)
node tools/check-usb-cable-connect-gate.js --static-only

# Static + device when USB phone present; skip device if none
node tools/check-usb-cable-connect-gate.js

# Fail if no phone (dogfood / agent after plug)
node tools/check-usb-cable-connect-gate.js --require-device

# Re-apply reverse then device checks
node tools/check-usb-cable-connect-gate.js --heal-reverse --require-device

# npm
cd hermes-mobile && npm run gate:usb-cable
cd hermes-mobile && npm run gate:usb-cable:require
```

Proof artifact: `hermes-mobile/docs/proofs/usb-cable-connect/latest.json` (gitignored proofs tree may still write locally).

## What this gate does *not* claim

- It does **not** assert React UI “Connected” (that needs Maestro + pair + not fighting the human).  
- It **does** fail when the transport layer that USB depends on is broken (reverse missing, gateway down, phone cannot loopback /health).  
- App sticky-profile bugs still need unit contracts (`usbTransportHandoff`, `connectionSelfHeal`, `preventRecurrence` S27/S29) + eventual UI proof.

## CI

Hermes Mobile job runs **static** gate always. Device layer runs when a self-hosted runner has a USB phone; otherwise skip is OK.
