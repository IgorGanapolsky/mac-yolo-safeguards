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
| Play API service account (CI) | `hermes-mobile-publisher@<gcp-project-id>.iam.gserviceaccount.com` |
| GCP project (Play API key) | Hermes-specific project linked under Play Console → **Setup → API access** (not Firebase `hermes-mobile-dist-78361`) |
| Firebase / GCP (separate) | `hermes-mobile-dist-78361` — see [FIREBASE_CI.md](./FIREBASE_CI.md) |

CI reads the Play key from GitHub secret **`GOOGLE_SERVICE_ACCOUNT_JSON`**, populated by `./scripts/sync-hermes-secrets.sh` from `EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH` in `hermes-mobile/.env`. `store-release.yml` writes that secret to `$RUNNER_TEMP/google-service-account.json` before EAS submit. **Never commit or paste the JSON key** — only the service-account email above is safe to reference in docs and logs.

**Do not** reuse the Firebase service account JSON for Play submit. Play needs a key linked under **Play Console → API access**.

**Legacy:** Do not reuse Play API keys created for other Igor apps. Hermes Mobile needs its own `hermes-mobile-publisher` service account with **Release manager** on `com.iganapolsky.hermesmobile` only.

## Personal → Organization (prerequisite)

Personal Play accounts created after **2023-11-13** must run **closed testing** (≥12 opted-in testers for **14 consecutive days**) before **Production** unlocks. **Organization** accounts are exempt — see [Google: personal testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465) and [convert personal → organization](https://support.google.com/googleplay/android-developer/answer/16260648#convert).

Prerequisites: registered **LLC** (or other legal entity), **D-U-N-S** number (legal name/address must match Dun & Bradstreet exactly; allow up to 30 days to obtain). After conversion completes, wait **72 hours** before submitting new apps.

## One-time Play Console setup (LLC org)

**Prerequisite:** the app must already exist in Play Console under the **LLC organization** developer account before API access or submit will work. EAS can build an AAB without this, but submit fails with permission / app-not-found errors until **Hermes Mobile** (`com.iganapolsky.hermesmobile`) is created there.

1. [Google Play Console](https://play.google.com/console) → confirm account type is **Organization** (LLC), or **Developer account → About you → Change account type → Organization**.
2. **Create app** → **Hermes Mobile** with package `com.iganapolsky.hermesmobile`.
3. Complete required store listing, content rating, data safety, and target audience.
4. **Setup → API access** → link a GCP project (create one for Play if needed) and create a Hermes Play service account — see below.
5. Download JSON key → set `EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH` in `hermes-mobile/.env` → run `./scripts/sync-hermes-secrets.sh`.

### Create the Hermes Mobile Play service account (manual)

Run **28536743657** built AAB **0.3.2 (vc7)** but submit failed because the CI key still pointed at a Play service account scoped to another app, not Hermes Mobile. Replace it with a Hermes-specific publisher account:

1. [Google Cloud Console](https://console.cloud.google.com/) → select or create a GCP project for Play API (keep it separate from Firebase `hermes-mobile-dist-78361`).
2. **IAM & Admin → Service Accounts → Create service account**
   - Name: `hermes-mobile-publisher`
   - Email (convention): `hermes-mobile-publisher@<gcp-project-id>.iam.gserviceaccount.com`
3. **Keys → Add key → Create new key → JSON** → save locally as `~/.gcloud-keys/hermes-mobile-publisher.json` (mode `600`).
4. Play Console (LLC org) → **Setup → API access** → link the same GCP project.
5. **Invite new users** → paste `hermes-mobile-publisher@<gcp-project-id>.iam.gserviceaccount.com` → send invite → accept in GCP if prompted.
6. **Users and permissions** → open the service account → **Add app** → **Hermes Mobile** (`com.iganapolsky.hermesmobile`).
7. Grant **Release manager** (minimum) or **Admin** for that app only.
8. Update local env and sync CI:

```bash
# hermes-mobile/.env
EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH=~/.gcloud-keys/hermes-mobile-publisher.json

./scripts/sync-hermes-secrets.sh
```

9. Wait a few minutes, then re-run: `gh workflow run store-release.yml -f platform=android -f submit=true`

## GitHub secrets & credential wiring

| Secret | Source | Used by |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Play Console API SA JSON (LLC org) | `store-release.yml` → temp file → `EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase `hermes-mobile-dist-78361` only | `internal-distribution.yml` only |

Local `.env` uses a **file path**; CI injects the same JSON via the GitHub secret:

```bash
# hermes-mobile/.env (local)
EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH=~/.gcloud-keys/hermes-mobile-publisher.json

# Sync path → GOOGLE_SERVICE_ACCOUNT_JSON (repo root)
./scripts/sync-hermes-secrets.sh
```

`sync-hermes-secrets.sh` reads `EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH` from `hermes-mobile/.env`, rejects Firebase project IDs, and sets `GOOGLE_SERVICE_ACCOUNT_JSON` on `IgorGanapolsky/mac-yolo-safeguards`. `store-release.yml` writes that secret to `$RUNNER_TEMP/google-service-account.json` before EAS submit. `release-preflight.sh` validates the credential is present and not a Firebase key when `REQUIRE_ANDROID_SUBMIT_CREDS=1`.

```bash
# Play (LLC org API key — not Firebase)
EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH=~/path/to/hermes-mobile-publisher.json \
  ./scripts/sync-hermes-secrets.sh

# Firebase (separate)
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=~/path/to/hermes-firebase-sa.json \
  ./scripts/sync-firebase-secrets.sh
```

Never commit or paste the JSON key contents — only the SA email and file path.

## EAS build credits (Starter plan)

Expo Starter includes **~$45/month** of EAS build credits (~30 builds at ~$1.40 each). Credits reset monthly (next reset shown in Expo billing email).

**What burned credits (Jul 2026 audit):**

| Source | Approx builds | Notes |
|---|---|---|
| `internal-distribution.yml` push auto-runs (Jun 17–28) | ~20+ | Fixed 2026-06-28 — no longer runs on every `main` push |
| Manual `store-release.yml` retries (Jul 1) | 4 production AABs | Each retry built a **new** AAB; submit failed on Play 403, not credits |
| Manual `internal-distribution.yml` (Jul 1–2) | ~5 preview APKs | Agents dispatching without `eas_build_id` reuse |

**`mobile-continuous.yml` does NOT use EAS** — it builds release APK locally via Gradle (free).

| Use case | Command | EAS credits? |
|---|---|---|
| Igor USB dogfood | `cd hermes-mobile && npm run android:phone` | No — local Gradle |
| CI unit + local APK guard | `mobile-continuous.yml` (schedule/PR) | No |
| Firebase internal APK | `internal-distribution.yml` + `confirm_eas_spend=yes` | Yes (~$1+) |
| Play production AAB (new) | `store-release.yml` + `confirm_eas_spend=yes` | Yes (~$1+) |
| Play submit only (existing AAB) | `store-release.yml -f eas_build_id=<uuid> -f submit=true` | No new build |

**Existing production AAB ready to submit** (built 2026-07-01, run 28542135705):

- Build ID: `e0e46777-b655-4df0-be1e-169672429ea9`
- Version: **0.3.2** (versionCode **7**)
- Submit blocked by **Play Console SA permissions**, not missing AAB

Once Play permissions are fixed, retry submit **without a new build**:

```bash
gh workflow run store-release.yml \
  -f platform=android \
  -f submit=true \
  -f skip_internal_proof=true \
  -f eas_build_id=e0e46777-b655-4df0-be1e-169672429ea9
```

If Starter credits are exhausted until the next reset, **new** EAS builds may fail or bill overage — use local builds for dogfood and `eas_build_id` reuse for submit.

## Release

EAS submit profile: `production` → Play track **`production`** (`hermes-mobile/eas.json`).

```bash
# New production AAB + submit (costs credits)
gh workflow run store-release.yml -f platform=android -f submit=true -f confirm_eas_spend=yes

# Submit existing AAB only (no new build)
gh workflow run store-release.yml -f platform=android -f submit=true \
  -f skip_internal_proof=true -f eas_build_id=e0e46777-b655-4df0-be1e-169672429ea9
```

Requires successful internal signoff statuses on the commit SHA (`internal-signoff/eas-android`, `internal-signoff/firebase-android`).

## Troubleshooting (manual Play Console fix)

When CI submit fails with “service account is missing the necessary permissions” (e.g. run **28542135705**), open [Play Console → Setup → API access](https://play.google.com/console/developers/api-access) signed in as `iganapolsky@gmail.com` (LLC org): **(1)** if **hermes-mobile-play** is not linked, click **Link** and choose that GCP project; **(2)** under **Service accounts**, find `hermes-mobile-publisher@hermes-mobile-play.iam.gserviceaccount.com` and click **Manage Play Console permissions** (or **Grant access** if it is not listed — paste that email, send invite, accept in GCP if prompted); **(3)** click **Add app** → select **Hermes Mobile** (`com.iganapolsky.hermesmobile`) → check **Release manager** → **Apply**. If **Hermes Mobile** is missing from the app picker, go to **All apps → Create app** first (name **Hermes Mobile**, package `com.iganapolsky.hermesmobile`), then repeat step 3. Wait ~5 minutes, then re-run `gh workflow run store-release.yml -f platform=android -f submit=true --ref main`.

## Failure modes

| Symptom | Fix |
|---|---|
| Submit 403 / permission denied / SA missing Play permissions | App must exist under LLC org first. Then Play Console → **Setup → API access** → invite `hermes-mobile-publisher@<gcp-project-id>.iam.gserviceaccount.com` → **Release manager** on `com.iganapolsky.hermesmobile`. GCP IAM alone is not enough. |
| AAB built, submit step failed (e.g. run 28536743657, 28542135705) | Same as above — build succeeded; only Play Console app + Hermes SA permissions are missing. See **Troubleshooting** above. |
| Wrong package / app not found | Create `com.iganapolsky.hermesmobile` under the **LLC** Play developer account |
| Still asked for testers | You are on **internal** testing track — use `store-release.yml` with `submit=true` (production track) |
| Firebase SA used for Play | Use separate keys; preflight rejects Firebase `project_id` in Play credentials |
| Missing `GOOGLE_SERVICE_ACCOUNT_JSON` in CI | Set `EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH` locally, run `./scripts/sync-hermes-secrets.sh` |
| Wrong Play SA in CI (other-app publisher key) | Replace with `hermes-mobile-publisher` JSON; re-run `./scripts/sync-hermes-secrets.sh` |
