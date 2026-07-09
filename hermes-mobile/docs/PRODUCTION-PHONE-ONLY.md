# Production phone only (Igor device policy)

**Directive:** On a USB-connected Android phone, agents and Igor run **production/preview** Hermes Mobile only — never Metro/debug.

## Install (canonical)

```bash
cd hermes-mobile
HERMES_MOBILE_FORCE_BUILD=1 bash scripts/install-phone-release.sh
```

Or: `npm run android:phone` (same script).

## Blocked on device

- `expo run:android` / debug dev client
- `npm run android` when `adb` sees a phone (script exits with instructions to use `android:phone`)

## OTA

After the first **production** APK install (`updates.enabled: true`, channel `production`, `runtimeVersion` policy `appVersion`):

- Merges to `main` publish JS via `.github/workflows/mobile-ota.yml` (`npm run ota:publish`).
- The app checks for updates **on cold start** (`checkAutomatically: ON_LOAD`).
- No USB reinstall required for JS-only fixes; native changes still need a new APK.

## Pairing

Use Mac mini over Tailscale, not MacBook LAN:

```bash
node tools/hermes-mobile-pair.js --mini-tailscale
```

Target gateway should be `http://100.94.135.78:8642` (or current mini Tailscale IP).

## Evidence

Last install metadata: `hermes-mobile/.install-phone-release.last` (gitignored).
