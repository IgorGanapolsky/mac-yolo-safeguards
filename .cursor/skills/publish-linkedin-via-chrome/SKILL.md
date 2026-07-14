---
name: publish-linkedin-via-chrome
description: >
  Publish LinkedIn posts for Hermes Mobile / ThumbGate from Igor's already-logged-in Google Chrome
  (Igor Ganapolsky). Use when PUBLISH_APPROVED for LinkedIn, content-engine LinkedIn pack, or "post
  to LinkedIn". Never ask for LinkedIn password or account. Link goes in first comment, not body.
  Slash: /publish-linkedin-via-chrome.
---

# Publish LinkedIn via Chrome (session already exists)

**Auth:** Do **not** ask for credentials. Follow [[use-existing-browser-sessions]]. Profile is **Igor Ganapolsky**; Google default `iganapolsky@gmail.com`.

**Proven 2026-07-14:** live post  
`https://www.linkedin.com/feed/update/urn:li:share:7482591296050728960/`

## Preconditions

- User said **PUBLISH_APPROVED** (or equivalent explicit publish) for LinkedIn — content engine is DRAFT_ONLY otherwise.
- Body has **no** Play/App Store URL (LinkedIn rule: link in **first comment**).
- Honesty guards from content engine still apply (no fake traction, iOS not public unless verified, no zero-telemetry).

## Automation path (macOS Chrome + osascript)

Helper pattern (multiline JS must be **base64 + eval**, not raw AppleScript embed):

1. Open sharebox in a **new front-window tab**:
   - URL: `https://www.linkedin.com/preload/sharebox/`
2. Inspect for "Create post" + contenteditable (not `msg-form__contenteditable`).
3. Fill body via `document.execCommand('insertText', …)` and/or clipboard paste (`Cmd+A`, `Cmd+V`) so React enables **Post**.
4. Click `button.share-actions__primary-action` whose text is **Post** only when `disabled` / `aria-disabled` is false.
5. Capture toast **"Post successful"** + `a[href*="/feed/update/urn:li:share:"]` URL.
6. Navigate to that post URL; fill **Add a comment…** (`div.ql-editor`); submit comment with CTA:
   - Play: `https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile`
   - GitHub: `https://github.com/IgorGanapolsky/mac-yolo-safeguards/tree/main/hermes-mobile`
   - Soft Leash pricing from **live Play** (e.g. ~$19.99/mo — re-fetch if needed)
   - iOS not public unless iTunes lookup non-zero
7. Verify live: post text + comment has Play/GitHub.
8. Proof: screenshot → `hermes-mobile/docs/social/proofs/proof-linkedin-YYYY-MM-DD.png` + URL file; update `ready-to-post/PUBLISHED.md` + content-engine memory TSV.
9. Commit proof docs when publish is verified (user ship rule).

## Scripts already in repo

- `hermes-mobile/scripts/chrome-social-post.js` — find/exec tab JS (prefer base64 wrapper for large scripts; window index bugs → use **front window new tab** only).

## Never

- Password forms, "email me the LinkedIn login", multi-account chooser quizzes.
- Auto-publish without **PUBLISH_APPROVED**.
- Put Play link in the main post body (platform rule).
- Claim publish without the live `urn:li:share:` URL + comment verification.
