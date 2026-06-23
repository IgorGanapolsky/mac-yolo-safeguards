# Hermes Mobile — launch checklist

## Security first

- **Never paste App Store passwords in chat.** Use Apple ID + app-specific password in EAS only.
- Rotate any credential that appeared in chat or logs.

## 1. Firebase App Distribution (internal QA)

GitHub secrets `FIREBASE_SERVICE_ACCOUNT_JSON` and `FIREBASE_ANDROID_APP_ID` are synced for **`hermes-mobile-dist-78361`**.

1. Sign in as **iganapolsky@gmail.com** → [Firebase Console](https://console.firebase.google.com/) → project **hermes-mobile-dist-78361**
2. Project settings → Service accounts → Generate new private key
3. Sync to GitHub:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=~/Downloads/hermes-mobile-dist-78361-*.json \
  ./scripts/sync-firebase-secrets.sh
```

4. Trigger:

```bash
gh workflow run internal-distribution.yml -f target=android_firebase
```

## 2. Product analytics (PostHog)

Production builds read `EXPO_PUBLIC_POSTHOG_API_KEY` from EAS secrets.

```bash
cd hermes-mobile
eas secret:create --name EXPO_PUBLIC_POSTHOG_API_KEY --value "phc_YOUR_KEY" --scope project --type string
```

Events: `app_open`, `screen_view`, `mac_scan_complete`, `ui_crash`, `upgrade_tap_*`.

Users can opt out in **Settings → Privacy → Product analytics**.

## 3. Monetization

Hermes Mobile is **free**. Revenue is via **ThumbGate Pro** ($19/mo) and hardening sprints — see Settings → Support development.

In-app purchase (Google Play / App Store) is scaffolded but not live yet; do not use thumbgate.ai as checkout.

## 4. Google Play Production

Prerequisites: Play Console app `com.iganapolsky.hermesmobile`, store listing, content rating, data safety (declare PostHog analytics).

`GOOGLE_SERVICE_ACCOUNT_JSON` is already in GitHub secrets.

Bootstrap store release (skip signoff after manual QA):

```bash
gh workflow run store-release.yml \
  -f platform=android \
  -f submit=true \
  -f skip_internal_proof=true
```

Or local:

```bash
cd hermes-mobile
eas build --platform android --profile production --non-interactive
eas submit --platform android --profile production --latest
```

## 5. iOS TestFlight / App Store

Apple credentials are in GitHub secrets (`EXPO_ASC_*`, team `9GMM26JC5X`).

```bash
gh workflow run store-release.yml \
  -f platform=ios \
  -f submit=true \
  -f skip_internal_proof=true
```

App Store Connect login: **igor.ganapolsky@icloud.com** (use app-specific password in EAS, not chat).

## 6. Verify after ship

- [ ] Play / ASC listing shows version **0.3.1+**
- [ ] PostHog receives `app_open` from a production build
- [ ] Firebase App Distribution email received (internal)
- [ ] Upgrade link opens thumbgate.ai with `utm_source=hermes-mobile`
