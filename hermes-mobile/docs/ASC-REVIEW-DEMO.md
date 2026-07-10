# App Store review — demo path (no operator Mac)

**Product model:** Hermes Mobile connects each user to **their own** Mac running the Hermes gateway. App Review must never receive Igor fleet hostnames, Tailscale URLs, or API keys.

## Reviewer instructions (ASC App Review Information)

Use the template in `scripts/asc-review-notes-safe.js`. Apply with:

```bash
cd hermes-mobile
node scripts/patch-asc-review-notes.js
```

## Demo bootstrap (no Mac required)

1. Install the submitted build on the review device.
2. Open **`hermes://setup?demo=1`** (Notes app → tap link, or paste in Safari).
3. Return to Hermes Mobile — demo mode enables sample chat, approval prompts, and Leash UI preview.
4. In **Chat**, send a message and tap **Approve** or **Deny** on any prompt.
5. Open **Leash** to preview subscription gate rules UI.

**Build requirement:** iOS App Store production builds set `EXPO_PUBLIC_STORE_REVIEW_DEMO=1` in `eas.json` (`production.ios.env`). Standard Android Play production builds do **not** include this flag.

If demo mode does not activate on an older binary, contact support (email in review notes) for time-limited credentials — never paste operator infrastructure into ASC fields.

## What demo mode is not

- Not a connection to Igor's Mac mini or any shared fleet gateway.
- Not a substitute for real-user onboarding (QR / Find computers / relay pair).
- Not enabled on consumer Android release APKs (`install-phone-release.sh` explicitly unsets demo flags).

## Automation guardrails

| Script | Behavior |
|--------|----------|
| `asc-review-notes-safe.js` | Single source of truth for reviewer copy |
| `patch-asc-review-notes.js` | ASC API PATCH — preferred over Chrome |
| `asc-chrome-*-review-notes.js` | Chrome fill; imports safe template only |
| `asc-chrome-redact-review-notes.js` | Emergency redact on inflight ASC tab |

**Never** embed gateway URLs, tailnet hostnames, or API keys in ASC, Play Console review fields, or fastlane metadata.
