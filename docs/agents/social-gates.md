# Social publish gates & campaign analytics — full detail

> Extracted verbatim from `AGENTS.md` on 2026-07-29 to keep the always-injected core small.
> The hard bans (gate scripts mandatory, LinkedIn account, Zernio/Hashnode) remain in `AGENTS.md`.

## Social publish hard gates (added 2026-07-25)

**CEO:** skills must be enforceable, not SKILL.md prose only. After false LIVE claims
(title-only Medium, double-posts, missing CTAs):

| When | Command | Exit meaning |
|------|---------|--------------|
| **Before** Post/Publish on any channel | `node tools/social-publish-gate.js --platform … --campaign … [--body-file …] [--require-buy-links]` | `0` ALLOW once · `1` BLOCK (do not Post) |
| **After** publish / before LIVE claim | `node tools/verify-public-post.js --url … [--must-contain …]` | `0` LIVE proof · `1` PARTIAL/empty/title-only/410 |

Hard blocks encoded in the gate: Hashnode frozen, Zernio ban, same platform+campaign
already LIVE/PARTIAL with public URL, dead free Play package URL, false-affiliation /
fake-traction language. Unit tests: `node tests/test-social-publish-gate.js` (CI
`revenue-public-checks`). Memory log: `docs/social/hermes-mobile-content-log.tsv`.
Skills (`never-double-post`, fan-out, LinkedIn) **must** invoke these scripts — reading
the skill text alone is not compliance.

Also permanent: LinkedIn = `ig5973700@gmail.com` only (`linkedin-account-ig5973700`);
no Zernio; no Hashnode publish; product/creator mentions without false affiliation.

## Social campaign analytics (added 2026-07-25)

First-party closed loop for campaign improvement (not platform-native impressions):

1. CTAs must include `utm_campaign` (= content-log Campaign) + `cta_id`.
2. Web `FunnelSignals` dual-writes sanitized tokens to `funnel_attribution_counters`.
3. Scoreboard: `node tools/social-campaign-ds.js [--attribution-file dump.json]`.
4. Capture scoreboard `ragCaptureStub` into ThumbGate after each weekly run.
5. Unit tests: `tests/test-social-campaign-ds.js` + control-plane `funnel-attribution.test.ts`.

Do not claim A/B winners without ≥ min-events attributed funnel hits. Native
LinkedIn/X impressions remain unmeasured until a separate API path exists.
