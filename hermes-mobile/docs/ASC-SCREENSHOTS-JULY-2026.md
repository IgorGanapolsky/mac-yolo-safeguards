# ASC screenshots — duplicate checksums + upload runbook (2026-07-13)

## Pipeline root cause

Live ASC inventory for Hermes Mobile `1.0` (`6786778037`) showed **exact MD5 twins**:

| Set | Before | Problem |
|-----|--------|---------|
| `APP_IPHONE_67` | 10 | Frames 01–04 each uploaded **twice** (identical checksums) |
| `APP_IPAD_PRO_3GEN_129` | 10 | Same pattern |

Two generators of twins:

1. **Size collapse** — shipping both `*_65.png` and `*_67.png` under `fastlane/screenshots/en-US/`. Apple maps both into **APP_IPHONE_67** (“6.5" Display · Using 6.9" Display”), so each story beat appears twice in the carousel.
2. **Deliver retry** — `fastlane deliver` can re-upload a frame after a transient “missing on App Store Connect” check, leaving a second asset with the **same checksum** (observed on `01_approve_67` / `03_standing_67` during the 2026-07-13 restore).

Secondary UI smell: `generate-store-screenshots.py` used to blank real UI into a shared spinner placeholder, so even unique captions looked identical. Generator now keeps real UI and **refuses** near-duplicate raw frames.

## Lock while WAITING_FOR_REVIEW

```
DELETE /v1/appScreenshots/{id}
→ 409 STATE_ERROR
detail: "Can't Delete Screenshot After Submit for review appScreenshots"
```

**Do not** remove `1.0` from review just to fix screenshots (publish-iOS-ASAP). Stage assets in-repo; upload at the first legal window (Apple rejection, approval → editable, or next version).

`upload-app-store-metadata.sh` now **refuses** `ASC_REJECT_BEFORE_UPLOAD` unless `ASC_FORCE_REJECT=1`.

## Upload-after-unlock runbook

When version state is `PREPARE_FOR_SUBMISSION`, `REJECTED`, or `DEVELOPER_REJECTED` (not in review):

```bash
cd hermes-mobile
python3 scripts/_assert_store_frame_distinct.py fastlane/store-capture/raw
python3 scripts/generate-store-screenshots.py   # emits *_67 + *_ipad129 only (no *_65)
ASC_SKIP_METADATA=1 bash scripts/upload-app-store-metadata.sh
node scripts/dedupe-asc-screenshots.js          # strip deliver-retry twins
node scripts/verify-asc-listing.js              # expect count=6 per set, no dup checksums
# only then:
node scripts/submit-asc-for-review.js
```

Guards in `upload-app-store-metadata.sh`:

- Abort if both `*_65.png` and `*_67.png` exist in the upload folder
- Abort if the local upload set already has duplicate MD5s
- Abort reject-before-upload without `ASC_FORCE_REJECT=1`

## Staged unique six-screen story

| # | Moment | Caption |
|---|--------|---------|
| 1 | Chat · Connected | Approve AI agents from phone |
| 2 | Leash approval card | Block destructive commands remotely |
| 3 | Settings · Safeguard / pair | Standing gate rules synced |
| 4 | QR pair scanner | Pair your Mac in one scan |
| 5 | Leash ThumbGate options | ThumbGate memory on replies |
| 6 | Settings | Settings for your Mac link |

Assets: `fastlane/screenshots/en-US/*_{67,ipad129}.png`, Play: `fastlane/metadata/android/en-US/images/phoneScreenshots/`.

## Incident note (honesty)

An earlier agent pass briefly pulled `1.0` from review while diagnosing the lock. Screenshots were replaced with the unique six-frame set (iPhone + iPad), deliver-retry twins were deleted, and the version was **resubmitted**. Current expected state: **WAITING_FOR_REVIEW** with **6 unique** screenshots per display set. Going forward: never reject for screenshot hygiene.
