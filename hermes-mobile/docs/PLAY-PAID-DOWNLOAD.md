# Play paid download — `com.iganapolsky.hermesmobile.paid`

**Created:** 2026-07-20  
**Why:** Google Play **cannot** convert a published Free app to Paid download on the same package. The live free listing `com.iganapolsky.hermesmobile` stays Free + `hermes_pro_lifetime` ($4.99 IAP). Paid-upfront Android requires a **new** package.

## Live identities

| SKU | Package | Play app id | Price model |
|-----|---------|-------------|-------------|
| Free listing (Production) | `com.iganapolsky.hermesmobile` | existing | Free download + $4.99 once IAP |
| Paid download (Draft → ship) | `com.iganapolsky.hermesmobile.paid` | `4972002147362988720` | **Paid download $4.99** |
| iOS (unchanged) | `com.iganapolsky.hermesmobile` | ASC `6786778037` | Paid download **$9.99** |

Developer: **IgorGanapolsky** / `5120393192891708058` (`iganapolsky@gmail.com`).

## North star (Igor Profit First)

- **iOS:** paid download $9.99 (already live).
- **Android:** paid download $4.99 on `.paid` package (this app).
- **Free Android listing:** keep as discovery + IAP bridge until paid listing is live and discoverable; do **not** market the free listing as “FREE forever” once paid SKU ships — listing copy must say unlock is $4.99 once (or point to paid download).

## Build / submit

```bash
# AAB with android.package = com.iganapolsky.hermesmobile.paid
cd hermes-mobile
HERMES_ANDROID_STORE_SKU=paid npx eas build -p android --profile production-android-paid
npx eas submit -p android --profile production-android-paid --latest
```

`app.config.js` sets `android.package` + `extra.androidStoreSku=paid` when `HERMES_ANDROID_STORE_SKU=paid` or `EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD=1`.

Paid binaries treat Pro as store-unlocked via `isStorePaidDownloadEntitled()` (no IAP required).

## Console checklist (paid app)

| Step | Status (2026-07-20) |
|------|---------------------|
| Create Paid app `com.iganapolsky.hermesmobile.paid` | **Done** — Draft, app id `4972002147362988720` |
| Merchant account | **Done** (dashboard check) |
| App type Paid (not Free) | **Done** — App pricing shows “Your app is Paid” |
| Set price **$4.99** all countries | **Queued** — “Set prices for all countries / regions to proceed”; Set pricing UI not yet saved |
| SA Release manager on paid app | **Queued** — SA exists account-wide; API still 403 on `.paid` until app added |
| Store listing / content rating / data safety | **Queued** (1/13 dashboard) |
| Google “Apply for access to production” questionnaire | **Possible gate** for new-app production track (closed-test questions) |
| EAS `production-android-paid` AAB upload | **Queued** — profile shipped in repo; cloud EAS may be hard-stopped until Jul 22 (T-STORE-12-RC) |

## Console checklist (free listing bridge)

| Step | Status |
|------|--------|
| Remove misleading **FREE** hero from en-US fullDescription | **Done** via Play API commit (GET STARTED + $4.99 unlock line) |

## Do not

- Rename/reprice the free package to Paid (impossible after publish).
- Publish under Tactical Training Apps / `agentleash`.
- Claim Play paid download is live before the public listing shows a non-zero price.
