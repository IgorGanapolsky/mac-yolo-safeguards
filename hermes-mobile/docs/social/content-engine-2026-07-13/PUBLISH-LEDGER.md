# PUBLISH-LEDGER — 2026-07-13

PublishMode: PUBLISH_APPROVED  
Session cap: 1 Reddit + 1 HN + 1 X  
Updated UTC: 2026-07-13T21:34:24Z

| Platform | Status | UTC | URL or error |
|----------|--------|-----|--------------|
| X/Twitter | PUBLISHED (verified) | 2026-07-13T21:34:24Z | https://x.com/IgorGanapolsky/status/2076778802970026015 — main text verified. Play URL self-reply on same thread. |
| Hacker News (Show HN) | BLOCKED | 2026-07-13T21:34:24Z | Repeated story-toofast after cool-down (~10m). Dead prior item 48898789. Draft remains in PRIMARY-POST.md. |
| Reddit (r/cursor) | BLOCKED | 2026-07-13T21:34:24Z | Form filled; reCAPTCHA Enterprise blocked submit. Draft in ADAPTATION-REDDIT.md (GitHub-only). |
| LinkedIn | SKIPPED (cap) | 2026-07-13T21:34:24Z | ADAPTATION-LINKEDIN.md |
| Bluesky / Threads | SKIPPED (cap) | 2026-07-13T21:34:24Z | reuse X later |
| Instagram | SKIPPED | 2026-07-13T21:34:24Z | ASSET-BRIEF — no vertical demo |
| Dev.to | SKIPPED | 2026-07-13T21:34:24Z | canonical used 07-11 |

## LaunchAgents
| Agent | Action | Evidence |
|-------|--------|----------|
| com.igor.hermes-mobile-social-content | kickstart | loaded/running |
| com.igor.hermes-mobile-promo-nudge | kickstart | loaded/running |
| com.igor.hermes-mobile-content-engine | installed + kickstart | ~/Library/LaunchAgents/com.igor.hermes-mobile-content-engine.plist |

## Blockers
1. Chrome multi-agent contention (LocalLLaMA/Play Console hijacks)
2. HN rate limit (story-toofast)
3. Reddit reCAPTCHA
4. Continuous E2E=fail — no device-verified claims
5. iTunes resultCount=0 — iOS not live

## X note
Incomplete tweet 2076776763640713335 deleted before verified full post.
