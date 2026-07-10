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

## Pairing (operator dogfood only)

Use your own Mac over Tailscale or LAN — never paste fleet credentials into store review fields:

```bash
node tools/hermes-mobile-pair.js --mini-tailscale   # example: pair to a specific fleet Mac
```

Target gateway is whatever machine the operator runs Hermes on (see pairing script output).

## Evidence

Last install metadata: `hermes-mobile/.install-phone-release.last` (gitignored).
