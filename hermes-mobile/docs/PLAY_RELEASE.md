# Hermes Mobile — Google Play (organization / LLC)

Package: **`com.iganapolsky.hermesmobile`**

Hermes uses a **Google Play Organization** developer account (LLC), not a personal Play account. Production releases go to the **Production** track — no Firebase-style tester list required.

| Channel | Purpose | Tester list? |
|---|---|---|
| Firebase App Distribution | Fast internal APK QA | Yes (`iganapolsky@gmail.com`) |
| Google Play **Production** | Store release (EAS `store-release.yml`) | No — public / managed rollout |

## Accounts

| Role | Email |
|---|---|
| Play Console org admin | `iganapolsky@gmail.com` |
| Play API service account | Created in Play Console → Setup → API access (LLC org) |
| Firebase / GCP (separate) | `hermes-mobile-dist-78361` — see [FIREBASE_CI.md](./FIREBASE_CI.md) |

**Do not** reuse the Firebase service account JSON for Play submit. Play needs a key linked under **Play Console → API access**.

## Personal → Organization (prerequisite)

Personal Play accounts created after **2023-11-13** must run **closed testing** (≥12 opted-in testers for **14 consecutive days**) before **Production** unlocks. **Organization** accounts are exempt — see [Google: personal testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465) and [convert personal → organization](https://support.google.com/googleplay/android-developer/answer/16260648#convert).

Prerequisites: registered **LLC** (or other legal entity), **D-U-N-S** number (legal name/address must match Dun & Bradstreet exactly; allow up to 30 days to obtain). After conversion completes, wait **72 hours** before submitting new apps.

## One-time Play Console setup (LLC org)

1. [Google Play Console](https://play.google.com/console) → confirm account type is **Organization** (LLC), or **Developer account → About you → Change account type → Organization**.
2. Create app **Hermes Mobile** with package `com.iganapolsky.hermesmobile`.
3. Complete required store listing, content rating, data safety, and target audience.
4. **Setup → API access** → link a Google Cloud project → create service account → grant **Release to production** (or Admin).
5. Download JSON key → set `EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH` in `hermes-mobile/.env`.

## GitHub secrets

| Secret | Source |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Play Console API service account (LLC org) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase `hermes-mobile-dist-78361` only (`firebase-distributor@...`) |

```bash
# Play (LLC org API key — not Firebase)
EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH=~/path/to/play-org-api-sa.json \
  ./scripts/sync-hermes-secrets.sh

# Firebase (separate)
FIREBASE_SERVICE_ACCOUNT_JSON_PATH=~/path/to/hermes-firebase-sa.json \
  ./scripts/sync-firebase-secrets.sh
```

## Release

EAS submit profile: `production` → Play track **`production`** (`hermes-mobile/eas.json`).

```bash
gh workflow run store-release.yml -f platform=android -f submit=true
```

Requires successful internal signoff statuses on the commit SHA (`internal-signoff/eas-android`, `internal-signoff/firebase-android`).

## Failure modes

| Symptom | Fix |
|---|---|
| Submit 403 / permission denied | SA must be invited under Play Console → API access (org account), not only GCP IAM |
| Wrong package / app not found | Create `com.iganapolsky.hermesmobile` under the **LLC** Play developer account |
| Still asked for testers | You are on **internal** testing track — use `store-release.yml` with `submit=true` (production track) |
| Firebase SA used for Play | Use separate keys; preflight rejects Firebase `project_id` in Play credentials |
