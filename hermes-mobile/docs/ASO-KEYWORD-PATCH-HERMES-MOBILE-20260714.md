# ASO keyword patch — `hermes,mobile` (2026-07-14)

**Apply when:** iOS is `READY_FOR_SALE` (now). **Do not** remove version from review or submit a new binary for this change alone.

**Goal:** Improve brand + device intent in the 100-character iOS keyword field while staying trademark-safe (no competitor app names).

## Proposed en-US keywords (99/100 chars)

```
hermes,mobile,coding agent,remote,approve,devtools,gateway,operator,safety,local,pair,tailscale,codex
```

| Change | Rationale |
|--------|-----------|
| Add `hermes,mobile` | User-directed brand + form-factor terms for post-approval discoverability |
| Keep `coding agent,remote,approve,…` | July 2026 wedge from [ASO-AI-AGENT-KEYWORDS-JULY-2026.md](./ASO-AI-AGENT-KEYWORDS-JULY-2026.md) |
| Omit `cursor,claude,chatgpt` | Guideline 2.3.7 / trademark risk |

**Note:** Apple already indexes the app name/subtitle for `Hermes`; `hermes` in keywords is optional redundancy — included per launch directive.

## Apply (ASC UI or API when safe)

1. App Store Connect → **Hermes Mobile** → **App Information** or version **1.0** localization **en-US** → **Keywords**.
2. Paste the line above (comma-separated, no spaces after commas).
3. **Save** — metadata-only; no review pull required for keyword-only edits on a live app.

## Fastlane (future `deliver` sync)

When fastlane metadata tree is restored under `fastlane/metadata/en-US/keywords.txt`, mirror the same string for idempotent uploads.

## Verification after edit

- ASC: keywords field matches exactly (char count ≤ 100).
- After iTunes `resultCount: 1`: search App Store for `hermes mobile` and `coding agent` (organic, not paid).

**Status:** Draft only — not applied to ASC in this pass (no metadata API write).
