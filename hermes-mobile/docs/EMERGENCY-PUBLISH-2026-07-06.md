# Emergency store publish — 2026-07-06

## Completed this session

| Step | Status | Evidence |
|------|--------|----------|
| Android AAB submit (v0.3.2 vc8) | Done | CI run 28820763871, EAS submission 5c807d32 |
| iOS IPA submit (v0.3.2 build 7) | Done | CI run 28820766640, ASC app 6786778037 |
| Play listing copy (title, short, full) | Done | `fastlane/metadata/android/en-US/*.txt` |
| Play feature graphic 1024×500 | Done | `fastlane/metadata/android/en-US/images/featureGraphic.png` |
| Play phone screenshots (4× 1080×2340) | Done | `scripts/capture-store-screenshots.sh` |
| Play listing upload via `fastlane supply` | Done | exit 0 @ 2026-07-06T16:54:54Z |
| App Store copy + keywords | Done | `fastlane/metadata/ios/en-US/` |

## Play Console status (Computer Use verified 17:00 UTC)

**Status: IN REVIEW** — Production v0.3.2 submitted Jul 6, 2026.

Publishing overview shows **Changes in review** including:
- Production 0.3.2 rollout (United States)
- Store listing (en-US) with app name **Hermes Mobile — AI Control**
- Content rating questionnaire submitted
- Privacy policy URL set
- Data safety, app category (Productivity), target audience 18+

Public Play URL still **404** until Google approves — expected while `Update status: In review`.

App Console IDs: developer `5120393192891708058`, app `4973118708450369499`.

## Still blocking public Play listing (404 while in review)

Google review + remaining post-approval items:

1. **Data Safety form** — answers in [docs/DATA-SAFETY.md](../../docs/DATA-SAFETY.md); Play Console → App content → Data safety
2. **Content rating questionnaire** — Play Console → App content → Content rating
3. **Privacy policy URL** — link `https://thumbgate.ai/privacy` (or dedicated Hermes page) in store listing
4. **IAP subscription** — create `thumbgate_leash_monthly` $19/mo in Monetize → Subscriptions
5. **Send for review** — Play Console → Publishing overview → **Send for review** (after checklist green)

## Still blocking App Store public listing

1. **ASC metadata upload** — run `fastlane deliver` with API key (see below)
2. **Select build 7** on version 0.3.2 → Submit for Review
3. **Create `thumbgate_leash_monthly` subscription** in App Store Connect
4. **Privacy questionnaire** — match `app.json` NSPrivacyCollectedDataTypes

## Commands (agent-runnable)

```bash
# Re-upload Play listing only
cd hermes-mobile
fastlane supply \
  --package_name com.iganapolsky.hermesmobile \
  --json_key ~/.gcloud-keys/hermes-mobile-publisher.json \
  --metadata_path fastlane/metadata/android \
  --skip_upload_apk --skip_upload_aab

# Refresh screenshots from USB phone
bash scripts/capture-store-screenshots.sh

# iOS metadata (requires EXPO_ASC_* in .env)
set -a && source .env && set +a
fastlane deliver \
  --app_identifier com.iganapolsky.hermesmobile \
  --api_key_key_id "$EXPO_ASC_API_KEY_ID" \
  --api_key_issuer_id "$EXPO_ASC_API_KEY_ISSUER_ID" \
  --api_key_filepath "$EXPO_ASC_API_KEY_PATH" \
  --metadata_path fastlane/metadata/ios \
  --skip_binary_upload true --force true
```

## Fastest path to first dollar (parallel)

While stores review (24–72h typical):

1. **Stripe founding beta** — [thumbgate.ai/leash-beta](https://thumbgate.ai/leash-beta) ($9/mo founding tier per BETA-LAUNCH-CAMPAIGN-RESEARCH.md)
2. **Show HN / Product Hunt** — drafts in `business_os/sales_assets/launch-hn.md`
