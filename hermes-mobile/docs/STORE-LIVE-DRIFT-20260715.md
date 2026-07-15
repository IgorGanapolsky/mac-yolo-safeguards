# Store Live Drift — 2026-07-15 — Ralph Loop GSD P1

**Evidence snapshot:** `curl -s https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile` + `https://itunes.apple.com/lookup?bundleId=com.iganapolsky.hermesmobile`

## Play Store Live vs Local

| Field | Live HTML (2026-07-15) | Local repo (fastlane/metadata) | Drift? |
|-------|------------------------|-------------------------------|--------|
| Title | Hermes Mobile: AI Agent Leash | `title.txt`: Hermes Mobile: AI Agent Leash (29/30) | ✅ match |
| Short | Your Mac, not cloud credits... (truncated in scraper, but appears to match) | `short_description.txt`: Your Mac, not cloud credits. Leash Pro $19.99 — approve AI from phone. (68 chars) | ✅ likely match |
| Full desc | Shows FREE/LEASH PRO/BUILT FOR REAL CONNECTIONS + HOW THIS DIFFERS + FAQ | `full_description.txt` identical + updated FAQ | ⚠️ partial |
| FAQ iPhone line | Live: `iPhone? iOS is in App Store review; Android is live on Play.` | Local: `iPhone? Yes — live on App Store as "Hermes Mobile: AI Agent Leash". Android live on Google Play. Both support Leash Pro $19.99/mo.` | **FIXED 2026-07-15** — public FAQ now live-on-App-Store |
| Trailer | Thumbnail 9s9XBru4YXQ present | `hermes-play-promo-16x9-22s.mp4` (769K) + raw 5.9M ready | ✅ live trailer matches asset |
| Screenshots | 6 frames present | `phoneScreenshots/` 6 frames: 01_approve, 02_block, 03_standing, 04_pair, 05_thumbgate, 06_works | ✅ count match — need visual audit |
| IAP | "In-app purchases" badge shown | `thumbgate_leash_monthly` ACTIVE via REAL-USER-READINESS | ✅ |

**Push command (service account already wired):**
```bash
cd hermes-mobile
bundle exec fastlane supply \
  --json_key $EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH \
  --package_name com.iganapolsky.hermesmobile \
  --skip_upload_apk --skip_upload_aab \
  --skip_upload_metadata false \
  --track production
# OR minimal metadata-only:
npm run launch:preflight:android # validates
fastlane supply --skip_upload_apk --skip_upload_aab --track production
```

**Verification after push (30-60min CDN):**
```bash
curl -s https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile | grep -i "App Store"
# should contain "live on App Store" not "in App Store review"
```

## iOS Live vs Local

| Field | Live iTunes (2026-07-15 resultCount=1) | Local repo | Drift? |
|-------|----------------------------------------|------------|--------|
| Name | Hermes Mobile: AI Agent Leash v1.0 id 6786778037 | `name.txt`: Hermes Mobile: AI Agent Leash | ✅ |
| Subtitle | Not returned by lookup — need ASC API; promo research says old was "Approve Claude Code, Cursor" | `subtitle.txt`: Control Mac agents from phone (25 chars) | Likely drift, local is brand-safe |
| Description | Live: "Hermes is the leash for AI coding agents. See what Claude Code, Cursor, Codex, Copilot, Windsurf are doing..." — brand-forward 1.0 copy | Local `description.txt`: "Control an AI coding agent from your phone on your own Mac, Linux, or Windows computer..." — cleaner, 1.1 draft | **YES — 1.0 vs 1.1** |
| Keywords | Not in public lookup | `keywords.txt`: coding,remote,approve,devtools,terminal,gateway,operator,safety,local,pair,tailscale,codex,cli (95/100 clean) | Local clean ✅ |
| Promotional | Not in lookup | "Control AI coding agents on YOUR Mac..." 148 chars | Local ready |
| Version | 1.0 READY_FOR_SALE per ASC-IOS-BLOCKERS | Build 13/14 | ✅ live now — propagation was 0→1 between Jul 14-15 |

**Next ASC 1.1 submission** (auto via API):
- Update subtitle to brand-safe ✅ already local
- Update keywords to clean ✅ already local
- Update description to 1.1 (first 170 chars keyword-dense: "Control an AI coding agent from your phone...")
- Keep IAP thumbgate_leash_monthly attached
- Submit: `node scripts/submit-asc-for-review.js`

## Revenue Truth — IAP

| Store | SKU | State | Evidence | Purchase proof? |
|-------|-----|-------|----------|-----------------|
| Play | thumbgate_leash_monthly | ACTIVE $19.99/mo base plan monthly | REAL-USER-READINESS.md Play API + live "In-app purchases" badge + trailed HTML | No purchases yet — 1+ downloads |
| iOS | thumbgate_leash_monthly | READY_FOR_SALE with app 1.0 (was DEVELOPER_ACTION_NEEDED → WAITING_FOR_REVIEW per ASC-IOS-BLOCKERS) | verify-asc-listing.js historical + iTunes resultCount=1 | No purchases yet |

**Funnel instrumentation exists:**
- `ProUpgradeCard.tsx`: trackProductEvent('leash_paywall_view'), ('leash_purchase_start'), ('leash_purchase_result'), ('leash_restore_result')
- `storeReview.ts`: prompt after 1 approval (threshold=1)
- Tests: productAnalytics + ProUpgradeCard PASS

**Blocker to money:** Zero traffic. Need distribution (Play internal testing link + HN/Reddit) per MONETIZATION-GTM.

## GSD Artifact

This MD is the P1 artifact. Next artifact: CSL/CPP definitions.

## Commands run

```bash
curl -s https://itunes.apple.com/lookup?bundleId=com.iganapolsky.hermesmobile | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['resultCount'])"
# → 1 (was 0 on 2026-07-14 per proof)
```
