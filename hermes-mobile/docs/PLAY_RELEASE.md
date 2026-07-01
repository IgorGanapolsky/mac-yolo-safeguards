# Hermes Mobile — Google Play (organization / LLC)

Package: **`com.iganapolsky.hermesmobile`**

Hermes uses a **Google Play Organization** developer account (LLC), not a personal Play account. Production releases go to the **Production** track — no Firebase-style tester list required.

| Channel | Purpose | Tester list? |
|---|---|---|
| Firebase App Distribution | Fast internal APK QA | Yes (`iganapolsky@gmail.com`) |
| Google Play **Production** | Store release (EAS `store-release.yml`) | No — public / managed rollout |

## Accounts

| Role | Email / ID |
|---|---|
| Play Console org admin | `iganapolsky@gmail.com` |
| Play API service account (CI today) | `liposhield-publisher@random-timer-dist-new.iam.gserviceaccount.com` |
| GCP project (Play API key) | `random-timer-dist-new` |
| Firebase / GCP (separate) | `hermes-mobile-dist-78361` — see [FIREBASE_CI.md](./FIREBASE_CI.md) |

CI reads the Play key from GitHub secret **`GOOGLE_SERVICE_ACCOUNT_JSON`**, populated by `./scripts/sync-hermes-secrets.sh` from `EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH` in `hermes-mobile/.env`. `store-release.yml` writes that secret to `$RUNNER_TEMP/google-service-account.json` before EAS submit. **Never commit or paste the JSON key** — only the service-account email above is safe to reference in docs and logs.

**Do not** reuse the Firebase service account JSON for Play submit. Play needs a key linked under **Play Console → API access**.

## Personal → Organization (prerequisite)

Personal Play accounts created after **2023-11-13** must run **closed testing** (≥12 opted-in testers for **14 consecutive days**) before **Production** unlocks. **Organization** accounts are exempt — see [Google: personal testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465) and [convert personal → organization](https://support.google.com/googleplay/android-developer/answer/16260648#convert).

Prerequisites: registered **LLC** (or other legal entity), **D-U-N-S** number (legal name/address must match Dun & Bradstreet exactly; allow up to 30 days to obtain). After conversion completes, wait **72 hours** before submitting new apps.

## One-time Play Console setup (LLC org)

**Prerequisite:** the app must already exist in Play Console under the **LLC organization** developer account before API access or submit will work. EAS can build an AAB without this, but submit fails with permission / app-not-found errors until **Hermes Mobile** (`com.iganapolsky.hermesmobile`) is created there.

1. [Google Play Console](https://play.google.com/console) → confirm account type is **Organization** (LLC), or **Developer account → About you → Change account type → Organization**.
2. **Create app** → **Hermes Mobile** with package `com.iganapolsky.hermesmobile`.
3. Complete required store listing, content rating, data safety, and target audience.
4. **Setup → API access** → link GCP project `random-timer-dist-new` (or create a Hermes-specific SA — see below).
5. Download JSON key → set `EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH` in `hermes-mobile/.env` → run `./scripts/sync-hermes-secrets.sh`.

### Grant Play permissions to the CI service account

Run **28536743657** built AAB **0.3.2 (vc7)** but submit failed because `liposhield-publisher@random-timer-dist-new.iam.gserviceaccount.com` has Play access for LipoShield only, not Hermes.

**Option A — reuse existing SA (fastest):**

1. Play Console (LLC org) → **Setup → API access**.
2. Under linked project `random-timer-dist-new`, confirm `liposhield-publisher@random-timer-dist-new.iam.gserviceaccount.com` is listed (invite it if missing: **Invite new users** → paste that email → send invite → accept in GCP if prompted).
3. Open **Users and permissions** (or the SA row → **Manage permissions**).
4. **Add app** → select **Hermes Mobile** (`com.iganapolsky.hermesmobile`).
5. Grant **Release manager** (minimum) or **Admin** for that app.
6. Wait a few minutes, then re-run: `gh workflow run store-release.yml -f platform=android -f submit=true`.

**Option B — Hermes-specific SA:**

1. Play Console → **Setup → API access** → **Create new service account** (or create in GCP IAM, then link).
2. Grant **Release manager** on `com.iganapolsky.hermesmobile` only.
3. Download JSON key → update `EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH` → `./scripts/sync-hermes-secrets.sh` to refresh `GOOGLE_SERVICE_ACCOUNT_JSON`.

## GitHub secrets & credential wiring

| Secret | Source | Used by |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Play Console API SA JSON (LLC org) | `store-release.yml` → temp file → `EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase `hermes-mobile-dist-78361` only | `internal-distribution.yml` only |

Local `.env` uses a **file path**; CI injects the same JSON via the GitHub secret:

```bash
# hermes-mobile/.env (local)
EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH=~/.gcloud-keys/liposhield-publisher.json

# Sync path → GOOGLE_SERVICE_ACCOUNT_JSON (repo root)
./scripts/sync-hermes-secrets.sh
```

`sync-hermes-secrets.sh` reads `EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH` from `hermes-mobile/.env`, rejects Firebase project IDs, and sets `GOOGLE_SERVICE_ACCOUNT_JSON` on `IgorGanapolsky/mac-yolo-safeguards`. `store-release.yml` writes that secret to `$RUNNER_TEMP/google-service-account.json` before EAS submit. `release-preflight.sh` validates the credential is present and not a Firebase key when `REQUIRE_ANDROID_SUBMIT_CREDS=1`.

```bash
# Play (LLC org API key — not Firebase)
EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH=~/path/to/play-org-api-sa.json \
  ./scripts/sync-hermes-secrets.sh

# Firebase (separate)
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=~/path/to/hermes-firebase-sa.json \
  ./scripts/sync-firebase-secrets.sh
```

Never commit or paste the JSON key contents — only the SA email and file path.

## Release

EAS submit profile: `production` → Play track **`production`** (`hermes-mobile/eas.json`).

```bash
gh workflow run store-release.yml -f platform=android -f submit=true
```

Requires successful internal signoff statuses on the commit SHA (`internal-signoff/eas-android`, `internal-signoff/firebase-android`).

## Failure modes

| Symptom | Fix |
|---|---|
| Submit 403 / permission denied / SA missing Play permissions | App must exist under LLC org first. Then Play Console → **Setup → API access** → invite `liposhield-publisher@random-timer-dist-new.iam.gserviceaccount.com` (or Hermes-specific SA) → **Release manager** on `com.iganapolsky.hermesmobile`. GCP IAM alone is not enough. |
| AAB built, submit step failed (e.g. run 28536743657) | Same as above — build succeeded; only Play Console app + SA permissions are missing. |
| Wrong package / app not found | Create `com.iganapolsky.hermesmobile` under the **LLC** Play developer account |
| Still asked for testers | You are on **internal** testing track — use `store-release.yml` with `submit=true` (production track) |
| Firebase SA used for Play | Use separate keys; preflight rejects Firebase `project_id` in Play credentials |
| Missing `GOOGLE_SERVICE_ACCOUNT_JSON` in CI | Set `EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH` locally, run `./scripts/sync-hermes-secrets.sh` |
