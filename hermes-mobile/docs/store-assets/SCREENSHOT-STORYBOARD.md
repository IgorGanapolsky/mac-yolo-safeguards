# Hermes Mobile store screenshot storyboard

Updated: 2026-07-22

## Conversion audit

The previous six-frame set was not fit for a public product listing:

- the first frame led with **“Control your Mac from phone”**, excluding Windows and Linux users;
- the actual app UI occupied too little of the canvas to read at store-search size;
- dogfood state included private machine names, addresses, workspace paths, stale sessions, and connectivity errors;
- the hero showed a **759k-token failure warning**, teaching prospects that replies may fail;
- “Pay once” appeared before a clear product outcome;
- thick decorative borders added visual weight without explaining the product.

No historical asset set passed those checks. The current generator therefore renders a
privacy-safe, deterministic product story from supported Hermes Mobile capabilities. It
does not use live user data, generative text, or imaginary features.

## Six-frame story

| # | Headline | Supporting line | Product proof shown |
|---|---|---|---|
| 1 | **Connect any computer** | Tailscale, home Wi-Fi, or USB | Computer picker with three real transport choices |
| 2 | **Control your AI agent** | Chat and send files from anywhere | Connected chat, visible user prompt, assistant result, composer |
| 3 | **Approve risky actions** | Allow once or block in one tap | Leash approval with command, reason, Block, and Allow once |
| 4 | **Set safety rules once** | Stop destructive commands automatically | Active command, production, and credential protections |
| 5 | **Hermes learns what works** | Rate replies and keep the context | Helpful/Improve feedback and remembered preference |
| 6 | **One phone. Every computer.** | Move between your machines instantly | Multiple computers with Tailscale and home Wi-Fi routes |

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
python3 scripts/_assert_store_frame_distinct.py \
  fastlane/metadata/android/en-US/images/phoneScreenshots
npx jest src/__tests__/storeListingMetadataContract.test.ts --runInBand
```

Outputs:

- Google Play: `fastlane/metadata/android/en-US/images/phoneScreenshots/*.png`
  at 1080×1920.
- App Store iPhone: `fastlane/screenshots/en-US/*_67.png` at 1290×2796.
- App Store iPad: `fastlane/screenshots/en-US/*_ipad129.png` at 2048×2732.
- Machine-readable proof: `docs/store-assets/generated-manifest.json`.

Only the 6.7-inch iPhone family is emitted. Generating both `_65` and `_67` caused the
same frame to be uploaded twice into `APP_IPHONE_67` in a prior release.

## Publication boundary

Generated and merged assets are not automatically “live.” Google Play and App Store
screenshots are separate publication surfaces. Report generator proof, repository merge,
publisher upload, store processing, and public listing visibility as distinct states.
