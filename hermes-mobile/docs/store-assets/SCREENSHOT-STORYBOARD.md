# Hermes Mobile store screenshot storyboard

Updated: 2026-07-29

## Conversion audit

The previous live and pending sets were not fit for a public product listing:

- live App Store version 1.3 contained 10 assets per device class but only six
  unique checksums, so four story beats appeared twice;
- the pending 1.4 set was checksum-unique but still showed internal commands,
  local addresses, a huge-session warning, diagnostic controls, and tiny text;
- the old generator framed mutable dogfood captures, so an OCR scrub could hide
  individual strings without turning the scene into a convincing customer story;
- the screenshots did not form one conversion sequence.

The current generator renders a privacy-safe, deterministic product story from
supported Hermes Mobile capabilities. It uses no live user data or generated imagery,
and every depicted control maps to an existing Hermes surface.

## Six-frame story

| # | Headline | Supporting line | Product proof shown |
|---|---|---|---|
| 1 | **Connect your computer** | Home Wi-Fi or Tailscale | Computer picker with the two supported transports |
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

## Deterministic generation and verification

```bash
python3 scripts/generate-store-screenshots.py
python3 scripts/test-store-screenshot-assets.py
npx jest src/__tests__/storeListingMetadataContract.test.ts --runInBand
```

The Python contract regenerates the complete set twice in isolated directories and
requires byte-identical output, exact dimensions, six unique assets per device class,
non-trivial visual distance between every pair, committed-manifest hash agreement, and
customer-safe copy. When Tesseract is installed it also OCR-scans the committed iPhone
set for private or diagnostic strings.

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
