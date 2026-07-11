# Play production — one-command ship (local)

**Pre-stage only.** Run after `main` is clean (no merge conflicts) and Play production already has `versionCode` **8** — repo must ship **9** or higher.

## 1. Android submit credential (local EAS submit)

EAS reads the path from the environment (`hermes-mobile/eas.json` → `submit.production.android.serviceAccountKeyPath`).

```bash
export EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH="$HOME/.gcloud-keys/hermes-mobile-publisher.json"
```

Optional: same path in `hermes-mobile/.env` (already used by `scripts/release-preflight.sh` and `../scripts/sync-hermes-secrets.sh` for CI secret sync). **Do not commit the JSON key.**

CI uses GitHub secret `GOOGLE_SERVICE_ACCOUNT_JSON` via `.github/workflows/store-release.yml` — no local path required for `gh workflow run`.

## 2. Preflight (no EAS spend)

```bash
cd hermes-mobile
REQUIRE_ANDROID_SUBMIT_CREDS=1 npm run launch:preflight:android
```

## 3. Build + submit (after merge to `main`)

**Preferred (CI, production track):**

```bash
gh workflow run store-release.yml \
  -f platform=android \
  -f submit=true \
  -f confirm_eas_spend=yes \
  --ref main
```

**Local EAS (same profile as CI `production`):**

```bash
cd hermes-mobile
export EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH="$HOME/.gcloud-keys/hermes-mobile-publisher.json"
npx eas-cli build --platform android --profile production --non-interactive
npx eas-cli submit --platform android --profile production --latest --non-interactive
```

Ensure `app.json` → `expo.android.versionCode` is **greater than** the live Play production code before building (`autoIncrement` alone is not enough if Play already consumed the same code).

See also: [PLAY_RELEASE.md](./PLAY_RELEASE.md).
