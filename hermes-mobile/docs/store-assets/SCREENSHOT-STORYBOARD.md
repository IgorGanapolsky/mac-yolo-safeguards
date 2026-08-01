# Hermes Mobile store screenshot storyboard

Updated: 2026-08-01

## Conversion audit

Earlier live/pending sets had two failure modes:

1. **Duplicate / dogfood garbage** (ASC 1.3 duplicates, mega-session warnings, raw IPs).
2. **Pillow product renders** (`deterministic-product-render-v2`) that looked polished but
   did **not** match real Hermes Mobile UI — they invent layout chrome and always-green
   Connected states while production users often see Tailscale/5G friction.

**2026-08-01:** store assets are **device-sourced** again:

```bash
# paid release on phone, mini Tailscale pair, then:
bash scripts/capture-store-screenshots.sh   # or adb deep-link captures
python3 scripts/frame-store-captures.py     # OCR scrub + 1080×1920 / 6.7" framing
```

- Real `ChatScreen` / Leash / Settings chrome (not Pillow mockups).
- OCR scrub via `sanitize-store-raw-frames.py` + expanded BAN list (hostnames, `100.x`,
  force-leak probes, stalled banners).
- Optional marketing caption band above the real UI (honest product, still readable in SERP).

## Six-frame story

| # | Headline | Supporting line | Product proof shown |
|---|---|---|---|
| 1 | **Connect your computer** | Home Wi-Fi, Tailscale, or USB | Computer picker with three supported transport choices |
| 2 | **Run your AI from anywhere** | Send work, files, and follow-ups | Connected chat, release-plan result, attachment, and composer |
| 3 | **Approve risky actions** | Block or allow once in one tap | Leash approval with command, reason, Block, and Allow once |
| 4 | **Stay on top of approvals** | Prioritize alerts. Decide one at a time | Shipped Approval-first mode, Quick-approve layout, and ThumbGate rejection capture |
| 5 | **Teach Hermes what works** | Feedback improves future runs | Helpful/Improve feedback and remembered preference |
| 6 | **One phone. Every computer.** | Switch machines without losing context | Multiple computers with Tailscale and home Wi-Fi routes |

The first three frames form the store-search funnel: **connect → control → approve**.
They sell the core outcome before secondary proof.

## Non-negotiable asset rules

- Use **computer**, **workstation**, **laptop**, or **server** in visible copy. Never use
  Mac as a synonym for the whole addressable market.
- Never show a personal machine name, IP address, tailnet, path, chat, timestamp, account,
  or user-authored prompt.
- Never show a disconnected, expired, stalled, error, warning, or oversized-session state.
- Never lead with price. The store purchase control already communicates price.
- The headline must remain readable when the frame is reduced to 200 px width.
- Each frame must depict a different product moment and remain below 90% pixel similarity.
- Generated assets are representative product renders. They must map to shipped Hermes
  Mobile capabilities and may not invent outcomes.

## Generation and verification

**Preferred (honest listing):**

```bash
# Device already on USB with paid package + Tailscale computer saved
HERMES_MOBILE_ANDROID_PACKAGE=com.iganapolsky.hermesmobile.paid \
  bash scripts/capture-store-screenshots.sh
python3 scripts/frame-store-captures.py
python3 scripts/test-store-screenshot-assets.py
npx jest src/__tests__/storeListingMetadataContract.test.ts --runInBand
```

**Fallback (CI / no phone):** `generate-store-screenshots.py` still emits Pillow
renders for dimension/contract smoke — do **not** publish those as the public
gallery when device frames exist (`generated-manifest.json` `source` should be
`device-capture-framed-v1` for a ship).

Contracts require: exact Play/iPhone dimensions, six unique assets, non-trivial
visual distance, and OCR-clean customer copy (no owner hostnames / Tailscale IPs /
debug probes).

Outputs:

- Google Play: `fastlane/metadata/android/en-US/images/phoneScreenshots/*.png`
  at 1080×1920.
- App Store iPhone: `fastlane/screenshots/en-US/*_67.png` at 1290×2796.
- App Store iPad: `fastlane/screenshots/en-US/*_ipad129.png` at 2048×2732.
- Machine-readable proof: `docs/store-assets/generated-manifest.json`.

Only the 6.7-inch iPhone family is emitted. Generating both `_65` and `_67` caused
Apple to collapse both families into `APP_IPHONE_67`, creating the live 1.3
duplication.

## Publication boundary

Generated and merged assets are not automatically “live.” Google Play and App Store
screenshots are separate publication surfaces. Report generator proof, repository merge,
publisher upload, store processing, and public listing visibility as distinct states.
