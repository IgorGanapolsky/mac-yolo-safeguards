# RESEARCH — Revenue funnel: vibe-coding security audit offer (August 2026)

**Date:** 2026-07-24
**Scope:** Sanity-check the $2,500 AI App Safety Audit / $1,500 Hardening Sprint / $2,000-mo retainer offer against the August 2026 market, and find better fear-hook ammunition and outreach copy for the non-technical "vibe-coding" founder ICP.
**Method:** Vault + repo ground-truth read (Step 1) + WebSearch/WebFetch (Step 2). No new tooling proposed — this is a copy/targeting/pricing sanity check only.

## Verdict

| Question | Answer |
|---|---|
| Is the $2,500 price competitive for August 2026? | **Yes, almost exactly at market.** [Beesoul](https://vibecoding.app/blog/best-vibe-code-audit-agencies) and [Varyence](https://vibecoding.app/blog/best-vibe-code-audit-agencies) both start at **$2,500** for the identical ICP ("non-technical founder who has an MVP but needs confidence"); [Sherlock Forensics](https://www.sherlockforensics.com/pages/vibe-coding-security.html) undercuts at $1,500 CAD (~$1,100 USD) for a lighter "Quick Audit." Our $2,500/$1,500/$2,000-mo ladder sits right in the validated band — no repricing needed. |
| Is there fresher fear-hook ammunition than what's in use? | **Yes — Moltbook (Jan 28–31, 2026) beats anything currently in the outreach templates.** Founder publicly said he "didn't write one line of code"; Wiz found a missing Supabase Row-Level-Security setting exposed **1.5 million API tokens + 35,000 emails + private agent DMs** within days of launch, hacked in "under 3 minutes" once found. This is a materially stronger, more recent story than the general 2025 Guardio/VibeScamming reporting. |
| Where does the ICP actually congregate today? | r/vibecoding (~250–317k members, the flagship), r/VibeCodeDevs (~59k), plus the wider cluster: r/indiehackers, r/SideProject, r/cursor, r/ChatGPTCoding. Reddit (already the proven channel here) is the right place — no new channel needed. |
| Does fear-based cold-outreach copy actually convert for security offers? | **Evidence says no — plain, specific, peer-tone copy outperforms FUD for security buyers**, who have hair-trigger scam/phishing radar. This validates the fleet's existing "value-first, no hard CTA" Reddit posture over a scarier subject line. |
| What's the current real pipeline state (not research — ground truth)? | **$0 cleared revenue**, confirmed as of the 2026-07-20 Stripe audit and reconfirmed 2026-07-22. See below. |

## 1. Current pipeline ground truth (read from the vault + repo before any external research)

Per `docs/REVENUE-LOOP.md`, the 2026-07-20 Kimi handoff (`Handoffs/2026-07-20-kimi-stripe-truth-and-pipeline-audit.md`), and the 2026-07-22 grok-build GTM handoffs (`Handoffs/2026-07-22-thumbgate-gtm-blitz.md`, `Handoffs/2026-07-22-thumbgate-gtm-corrected.md`):

- **Stripe account is live-mode** (`acct_1RNcJ1GGBpd520QY`); the $499 / $1,500 checkout links return HTTP 200. **Zero completed payments have ever occurred for this offer** — the only historical charges ($149 Apr 2026, $10 Nov 2025) predate it and are unrelated subscription activity, not audit/sprint sales. Cleared revenue is confirmed $0 as of 2026-07-22 ("Cleared revenue. $0. Activity ≠ money.").
- **Warmest live lead:** u/rodri_builds (r/n8n) — 5+ prior exchanges, a $499 CTA delivered 2026-07-20 01:40 UTC, no reply as of the 2026-07-22 audit.
- **Channel status:** Reddit (OAuth account `eazyigz123`) is the only channel with proven, repeatable sends — 5 value-first posts went out 2026-07-22 with no hard CTA. LinkedIn posts are publishing, but the first-comment CTA (where the link lives) has repeatedly failed to land due to a Chrome-automation/payment-banner glitch — flagged explicitly as "do not claim CTA present" in the 07-22 corrected handoff. Email partnership outreach to AI dev-tool companies (Cline, Cursor, Sourcegraph, OpenCode) is mostly bouncing (Cline hard-bounced both addresses).
- **Targeting drift worth flagging (not re-litigating, just reporting):** the most recent GTM blitz (2026-07-22) leaned into partnership outreach to *other AI dev-tool companies* and a competitive "vs. Ent" LinkedIn angle, rather than direct outreach to *non-technical vibe-coding founders* — the ICP this doc is scoped to. Neither is wrong, but they are different funnels; the founder ICP outreach (Reddit value posts, the original $499/$2,500 hook) is the one this research directly supports.
- **Offer fragmentation flag carried over from the sibling `skool_top1percent` repo:** a $7/$49-mo n8n-kit pitch to Miami QSR/salons is running in parallel to the frozen $499 diagnostic — different product line, same fleet, no action needed here beyond awareness.

## 2. Fresh 2026 incident ammunition

The strongest, most recent, most citable fear-hook available right now is **Moltbook**, not the older Guardio/VibeScamming (Apr 2025) story most templates likely still reference:

- **What happened:** Moltbook, an AI-agent social network, launched Jan 28, 2026. Its founder, Matt Schlicht, publicly said he "didn't write one line of code" — the entire app was AI-generated. [Wiz discovered](https://www.wiz.io/blog/exposed-moltbook-database-reveals-millions-of-api-keys) the underlying Supabase database was missing Row-Level-Security policies, exposing **1.5 million API authentication tokens, 35,000 email addresses, and private agent-to-agent messages** — reported independently by [Infosecurity Magazine](https://www.infosecurity-magazine.com/news/moltbook-exposes-user-data-api/), [The Hill](https://thehill.com/opinion/cybersecurity/5744310-ai-powered-security-risks/), and [SecurityBrief](https://securitybrief.news/story/moltbook-vibe-coded-flaw-exposed-ai-chats-keys), with a timeline (Wiz found it Jan 31, fix within hours, full remediation Feb 1) confirmed on [Moltbook's own Wikipedia entry](https://en.wikipedia.org/wiki/Moltbook).
- **Why it's better ammo than what's likely in the current template:** it's the single most-covered vibe-coding breach of 2026, it names the exact platform pattern (Supabase RLS misconfiguration) that non-technical founders are most likely to have replicated, and the founder's own "I didn't write a line of code" quote is a near word-for-word match to the ICP's self-description — makes the story land as "this could be me," not "this happened to some enterprise."
- **Supporting statistics to cite (not story-hooks, but credibility backup in the audit pitch itself):**
  - [Wiz Research](https://www.wiz.io/blog/common-security-risks-in-vibe-coded-apps): roughly 1 in 5 organizations building on vibe-coding platforms have exposed themselves via common misconfigurations; separately, a Replit-employee scan of 1,645 Lovable-created apps found **170 leaking PII, financial data, or API keys**.
  - [Wiz on Base44/Lovable](https://www.wiz.io/blog/common-security-risks-in-vibe-coded-apps): an exposed API let anyone bypass authentication (including SSO) on private enterprise apps using only the app's public `app_id`.
  - [Georgia Tech's Vibe Security Radar](https://news.research.gatech.edu/2026/04/13/bad-vibes-ai-generated-code-vulnerable-researchers-warn) (Systems Software & Security Lab): **74 confirmed AI-linked CVEs through March 2026**, climbing from 6 (Jan) → 15 (Feb) → 35 (Mar) — researchers estimate the true count is 5–10x higher; a single Firebase misconfiguration in one AI-generated platform exposed 406 million records in Jan 2026.
  - [TechTimes](https://www.techtimes.com/articles/317077/20260524/vibe-coding-non-developers-63-users-now-have-no-coding-background-breaches-follow.htm): 63% of vibe-coding users now have no coding background at all — this is the buyer, not an edge case.

## 3. Where the ICP congregates (mid-2026)

Reddit remains the right, and already-proven, channel:

- **r/vibecoding** — the flagship community, cited at ~250k–317k members depending on source/date ([GummySearch](https://gummysearch.com/r/vibecoding/), [aitooldiscovery.com](https://www.aitooldiscovery.com/guides/vibe-coding-reddit)); grew from near-zero to ~89k in under a year, one of the fastest-growing dev-adjacent subs on Reddit.
- **r/VibeCodeDevs** — ~59k members, tool-builder-adjacent ([GummySearch](https://gummysearch.com/r/VibeCodeDevs/)).
- Adjacent cluster where the same founders post: **r/indiehackers, r/SideProject, r/cursor** (tool-specific complaints), **r/ChatGPTCoding**.
- Pain language observed directly in these communities (per aggregated Reddit analysis): posts like "Guys, I'm under attack... I'm not technical so this is taking me longer than usual to figure out" — i.e., founders discover breaches in real time and say so publicly, which is exactly the moment a value-first reply (not a cold DM) can land.

This confirms the current channel choice (Reddit via `eazyigz123`) is correct; no new community needs to be added.

## 4. Pricing benchmark (August 2026 comparables)

| Service | Price | Target buyer | Source |
|---|---|---|---|
| Sherlock Forensics — Quick Vibe Code Audit | $1,500 CAD (~$1,100 USD) | Explicitly "non-technical founders"; plain-language report | [sherlockforensics.com](https://www.sherlockforensics.com/pages/vibe-coding-security.html) |
| **Beesoul** | **$2,500** | Non-technical founders, structured report | [vibecoding.app roundup](https://vibecoding.app/blog/best-vibe-code-audit-agencies) |
| **Varyence** | **$2,500** | "non-technical founder who has an MVP but needs confidence" | [vibecoding.app roundup](https://vibecoding.app/blog/best-vibe-code-audit-agencies) |
| Vibe App Rescue | $2,000 | Startups moving off browser-based tools | [vibecoding.app roundup](https://vibecoding.app/blog/best-vibe-code-audit-agencies) |
| Pragmatic Coders | $3,000 | Budget-conscious startups | [vibecoding.app roundup](https://vibecoding.app/blog/best-vibe-code-audit-agencies) |
| Intertec.io / ISHIR / Railsware / VibeCheck London | $5,000–$15,000+ | Enterprise / compliance / VC due diligence | [vibecoding.app roundup](https://vibecoding.app/blog/best-vibe-code-audit-agencies) |
| General indie/startup pentest-lite market | $4,000–$8,000 typical; sub-$3,000 is "automated scanning, not a manual test" | Startup-scale web app/API | [SecureLeap](https://www.secureleap.tech/blog/penetration-testing-cost-startup-pricing), [pentestingcost.com](https://pentestingcost.com/) |

**Reasoning (mine, not sourced):** the $2,500 audit price is not just "in range" — it is the *exact same number* as the two closest direct comps (Beesoul, Varyence) targeting the identical non-technical-founder ICP. That's unusually strong validation; no pricing change is warranted. The $1,500 hardening sprint sits above Sherlock's $1,100 lite-audit price but below the $2,000+ full-remediation tier others charge, which is coherent as a mid-tier add-on rather than the entry offer. The $2,000/mo retainer has no direct public comp found in this search — it's priced by analogy to the audit/sprint tier, which is reasonable but unverified against a competitor number.

## 5. Cold-outreach copy: what the 2026 evidence says

- **Fear-based subject lines underperform for security offers specifically.** Lines like "Your company could be the next breach headline" are flagged as the fastest way to get filtered — security-adjacent buyers have "FUD radar set to hair-trigger" and read anything resembling urgency/fear framing as a phishing pattern ([LeadHaste](https://leadhaste.com/blog/cold-email-subject-lines-for-cybersecurity)). The winning pattern instead: **plain, specific, obviously legitimate, peer-tone** — reference the recipient's actual stated responsibility or a specific incident they described, not generic dread.
- **This directly validates, not contradicts, the fleet's current posture**: the 2026-07-22 Reddit sends were explicitly "value-first, no hard CTA," and the one $499 ask that did go out (to rodri_builds) was personalized to 5+ prior exchanges in that exact thread rather than a cold scary-subject-line blast. Keep doing that. Do **not** rewrite the hook to be scarier — sharpen it to be more *specific* instead (e.g., naming the Moltbook/Supabase-RLS pattern by name to a founder who mentions Supabase, rather than a generic "is your app secure?" line).
- **Distribution over cleverness:** "72% of successful indie hackers cite distribution — not product — as the #1 growth driver," and community-first engagement converts 3–5x better than cold outreach ([prems.ai indie hacker playbook](https://prems.ai/blog/indie-hacker-marketing-playbook-2026)). This reinforces the standing bottleneck diagnosis: the constraint is volume of genuine, specific engagement, not a better offer or a better tool.

## 6. Action checklist (copy/targeting only — no new tooling)

1. Swap the Moltbook story into the existing outreach template's incident hook (`docs/social/scary-security-email-outreach-template.md` per `REVENUE-LOOP.md`) in place of whatever 2025-era incident is currently cited — it is fresher, more viral, and the founder's own "didn't write one line of code" quote mirrors the ICP's self-description almost exactly.
2. When personalizing a reply to a founder who names a specific stack (Supabase, Firebase, Lovable, Base44), cite the matching real 2026 incident by name (Moltbook for Supabase RLS; the Wiz Base44 auth-bypass finding for Lovable/Base44 apps) instead of a generic security-fear line — this matches the "plain and specific beats FUD" evidence above.
3. Do not change the $2,500/$1,500/$2,000-mo pricing — it is validated almost exactly against Beesoul and Varyence, the two closest live comps for this identical ICP.

## Related

- `docs/REVENUE-LOOP.md` — the loop this research feeds
- `docs/AI-APP-SAFETY-AUDIT.md` — the offer doc referenced by the loop
- `docs/social/scary-security-email-outreach-template.md` — template to update with the Moltbook hook
- `~/Documents/AI-Agent-Sync/Handoffs/2026-07-20-kimi-stripe-truth-and-pipeline-audit.md` — pipeline ground truth
- `~/Documents/AI-Agent-Sync/Handoffs/2026-07-22-thumbgate-gtm-blitz.md` / `2026-07-22-thumbgate-gtm-corrected.md` — latest GTM state
