# ThumbGate.app Content Engine v2 — run 2026-08-12

| Field | Value |
|--------|--------|
| **Date** | 2026-08-12 |
| **PublishMode** | `DRAFT_ONLY` (no same-session platform authorization for Chrome/Zyvop publish) |
| **Campaign** | `engine-v2-20260812-safety-free` |
| **HeroDomain** | thumbgate.app |
| **Hero ratio log** | web-hero day (default ~4-of-5) |
| **Meme** | `safety_gate_free_meme.jpg` (+ inventory `leash_approvals_meme.jpg` for evening Zyvop slot if authorized later) |
| **social-publish-gate** | ALLOW (linkedin/x/bluesky/dev.to/medium) at 2026-08-12T17:29:23Z |

---

## 1. Research Receipt

Checked **2026-08-12T17:28:00Z** UTC unless noted.

| Claim | Source | Result |
|--------|--------|--------|
| thumbgate.app live | `curl -L https://thumbgate.app/` | HTTP **200** |
| Hero: Continuity when Mac closes; Leash on paired Mac while online; free pair; paid Continuity VPS | Live HTML + `apps/hermes-control-plane/app/page.tsx` | Verified: "Pair once · free scaffolding", "Free pair. Paid Continuity.", interactive Leash approve/deny demo |
| Pair & status price | Live page pricing card | **$0 /month** |
| Pro Continuity price | `GET https://thumbgate.app/api/billing/plan` | HTTP 200; `unitAmount:1000`, `currency:usd`, `interval:month` → **$10/mo live Stripe price** (do not hardcode in future runs — re-fetch) |
| Team & Enterprise | Live page | **$49/month**; includes **Priority Fly.io cloud VPS runner** (feature name only — **no affiliation** with Fly.io) |
| Continuity trial wording | Live page | 14-day trial with 5 cloud runs (Pro card) |
| "still proving out" | Live homepage text search | **Absent today** — do not invent battle-proven *or* re-use old "proving out" caveat |
| thumbgate.ai | `curl -L https://thumbgate.ai/` | HTTP **200** (not used as hero — not gates-cash day) |
| thumbgate.ai/diagnostic | `curl -L https://thumbgate.ai/diagnostic` | HTTP **200** (tertiary only; omitted from primary CTAs) |
| Paid Android package | Play `com.iganapolsky.hermesmobile.paid` | HTTP **200**; title **Hermes Agent Remote & Leash**; price **$4.99**; developer IgorGanapolsky |
| Free Android package | `com.iganapolsky.hermesmobile` | HTTP **404** — never link |
| iOS live | iTunes lookup `id=6786778037` | resultCount **1**; **Hermes AI Agent Leash**; bundle `com.iganapolsky.hermesmobile`; v**1.3**; **$4.99**; ratings **0** / count **0** |
| /go/android | `https://thumbgate.app/go/android` | 302 → paid Play listing |
| /go/ios | `https://thumbgate.app/go/ios` | 302 → App Store id 6786778037 |
| Public scale honesty (supporting) | `https://thumbgate.app/api/expertise/stats` | `totalPairedMachines:1`, `orgsWithOnlineMachine:0`, `pairingsCompleted30d:0` — **no traction claims** |
| ~0 real customers (engine truth) | Production DB claim in engine brief (4 orgs ever; 1 Stripe checkout = founder test) | Not re-queried this run; consistent with public scale stats — **founder-building-in-public only** |
| Competitor / timely technical layer | HN Algolia search_by_date coding-agent approval/sandbox | Recent hits thin; use durable technical contrast: **post-hoc PR review is the wrong layer when the agent already has shell** (same class as Jul 27 discussion, new monetization framing) |
| Morning Zyvop already LIVE today | `~/Documents/AI-Agent-Sync/Agent-State/promo-ledger.md` | `2026-08-12 morning` angle `tg_app_browser_control` LIVE on zyvop — **do not re-use that angle/channel today** |
| Hashnode | Standing freeze | **FROZEN** — skip |

---

## 2. Daily Decision

| Field | Choice |
|--------|--------|
| **Persona** | Security engineer *(not used in last 14d log)* |
| **Pain** | If approve/deny is paid, teams disable the safety control under deadline pressure — then the agent still has shell |
| **Angle** | **Safety gate = free table-stakes; offline VPS Continuity = paid.** Free pair + free Leash-style approve/deny in browser; Continuity only when Mac can't run the work |
| **Evidence** | Live pricing $0 pair; Leash demo on homepage; Pro Continuity live $10/mo; Team $49 + Priority Fly.io runner feature; stores $4.99; public scale ~1 paired machine |
| **Hook** | *The safety gate is free. The offline runner is not.* |
| **Hero CTA domain** | **thumbgate.app** |
| **Secondary** | `/go/android` · `/go/ios` as "also on phone" after web CTA |
| **Tertiary** | thumbgate.ai **omitted** (not gates/diagnostic cash angle) |
| **Dedup notes** | Avoid: two-decisions (7/27), gate-was-never-hard-part (7/29), checkout-URL quiet risk (8/4), install-is-step-0 (7/25), away-from-desk Mac sit (7/26), morning browser-control Zyvop (today) |

### UTM templates

```
https://thumbgate.app/?utm_source=<ch>&utm_medium=social&utm_campaign=engine_v2_20260812&cta_id=engine_v2_<ch>_home
https://thumbgate.app/go/android?utm_source=<ch>&utm_medium=social&utm_campaign=engine_v2_20260812&cta_id=engine_v2_<ch>_go_android
https://thumbgate.app/go/ios?utm_source=<ch>&utm_medium=social&utm_campaign=engine_v2_20260812&cta_id=engine_v2_<ch>_go_ios
```

---

## 3. Primary post (LinkedIn-native, founder voice)

**Visual:** attach `safety_gate_free_meme.jpg` (or `leash_approvals_meme.jpg`).

```
The safety gate is free. The offline runner is not.

Security lesson I keep re-learning with coding agents:

If the control that stops a destructive tool call sits behind a paywall,
people turn it off when a deadline hits. Then the agent still has shell.

So the product split on ThumbGate.app is intentional:

1) Pair + approve/deny (Leash) — free. Table stakes. Browser, no install.
2) Continuity — paid only when the Mac is offline and eligible work needs a fenced VPS runner.

I am building this in public. No fake "thousands of teams" story. Early days.
What is live today: free pair/status scaffolding, free Leash path on the paired machine,
Continuity priced live in-product (Stripe), and Hermes Mobile if you already use the web remote.

Not affiliated with Nous Research, Anthropic, OpenAI, Cursor, or Fly.io —
just naming the agents people actually run.

Try free pair in the browser:
(first comment)
```

**First comment (CTA):**

```
Web (primary): https://thumbgate.app/?utm_source=linkedin&utm_medium=social&utm_campaign=engine_v2_20260812&cta_id=engine_v2_li_home

Also on phone (secondary, after you pair on web):
Android → https://thumbgate.app/go/android?utm_source=linkedin&utm_medium=social&utm_campaign=engine_v2_20260812&cta_id=engine_v2_li_go_android
iOS → https://thumbgate.app/go/ios?utm_source=linkedin&utm_medium=social&utm_campaign=engine_v2_20260812&cta_id=engine_v2_li_go_ios
```

---

## 4. Channel adaptations (not clones)

### X / Twitter (~short)

```
The safety gate is free.
The offline runner is not.

If approve/deny is paid, people disable it under deadline pressure —
while the agent still has shell.

Free pair + Leash path in the browser:
https://thumbgate.app/?utm_source=x&utm_medium=social&utm_campaign=engine_v2_20260812&cta_id=engine_v2_x_home

(Not affiliated with Anthropic / OpenAI / Cursor / Nous / Fly.)
```

**Meme:** yes.

### Bluesky

```
Left: paywall the safety gate → teams turn it off.
Right: free approve/deny; pay only for offline VPS Continuity.

Building in public. No fake user counts.

https://thumbgate.app/?utm_source=bluesky&utm_medium=social&utm_campaign=engine_v2_20260812&cta_id=engine_v2_bsky_home
```

**Meme:** `safety_gate_free_meme.jpg` preferred.

### dev.to / Medium (longform outline — value first)

**Title:** The safety gate is free. The offline runner is not.

**Sections:**
1. Post-hoc PR review is the wrong layer when the agent already has shell.
2. Why paid safety gates get disabled (incentive design).
3. What free means on ThumbGate.app today: pair + status $0; Leash approve/deny on paired machine; browser control plane.
4. What is paid: Continuity VPS failover when Mac offline — live Stripe price (re-fetch; today Pro Continuity API showed $10/mo; Team $49 with Priority Fly.io runner feature listed — no Fly affiliation).
5. Hermes Mobile as extension via `/go/android` `/go/ios` (paid download $4.99 live; iOS 0 ratings — brand new; never free Android package).
6. Honest early-stage note: public control-plane scale metrics show a single-digit paired-machine footprint — founder building, not traction theater.
7. Disaffiliation line.
8. **Also available** footer: thumbgate.app hero + store badges via go links. No Hashnode.

### Reddit (discussion-only — no product links in body)

**Title:** If pre-exec approve/deny for coding agents is paid, do teams just turn it off?

**Body:**
```
Working assumption from security reviews of autonomous coding agents:

If the human gate that stops a destructive tool call is a paid upsell,
deadline pressure makes people disable it — and the agent still has shell.

Post-hoc PR review does not help once `rm` / deploy / network tools already ran.

Curious how others design this:
- free always-on approval UX vs paid "governance suite"
- local-only vs remote approve from browser/phone
- what you refuse to put behind a subscription

(I build in this space; happy to answer architecture questions. Not here to shill.)
```

**Links:** only if sub allows and someone asks — then thumbgate.app, disclose builder.

### Hacker News (only if operator authorizes Show HN later)

```
Show HN: Free browser pair + approve/deny for Hermes agents; paid Continuity only when offline
https://thumbgate.app/?utm_source=hn&utm_medium=social&utm_campaign=engine_v2_20260812&cta_id=engine_v2_hn_home
```

Value comment: lease/fencing, free pair card, no affiliation claims. Prior Show HN dead risk noted in log — optional.

### Instagram

Skip unless operator attaches real screenshot — meme alone is weak for IG; asset exists if needed.

### Hashnode

**FROZEN** — skipped.

### Zyvop evening slot note

Morning already LIVE (`tg_app_browser_control`). Evening staged pack `leash_approvals` is adjacent but weaker/less precise than this angle. If/when `PUBLISH_APPROVED` for Zyvop tonight, prefer this **safety-free / Continuity-paid** body + `safety_gate_free_meme.jpg`, channels **dev.to + Medium + Bluesky only** (never Hashnode).

---

## 5. Publish Ledger

| Platform | Status | UTC | Verified URL / blocker |
|----------|--------|-----|-------------------------|
| LinkedIn | **Drafted** | 2026-08-12T17:30Z | PublishMode=DRAFT_ONLY — gate ALLOW, not posted |
| X | **Drafted** | 2026-08-12T17:30Z | same |
| Bluesky | **Drafted** | 2026-08-12T17:30Z | same |
| Threads | **Drafted** | 2026-08-12T17:30Z | same (adapt X short) |
| dev.to | **Drafted** | 2026-08-12T17:30Z | longform outline ready |
| Medium | **Drafted** | 2026-08-12T17:30Z | same body as dev.to when authorized |
| Reddit | **Drafted** | 2026-08-12T17:30Z | discussion-only; burn-rule still prefers no promo without explicit ask |
| Hacker News | **Skipped** | 2026-08-12T17:30Z | prior dead Show HN risk; no auth this session |
| Instagram | **Skipped** | 2026-08-12T17:30Z | no operator screenshot session |
| Hashnode | **FROZEN** | 2026-08-12T17:30Z | AutoMod ban risk |
| Zyvop morning | **Published (prior)** | 2026-08-12 | https://zyvop.com/control-your-ai-coding-agents-from-any-browser-cwsi8 — different angle; do not duplicate |
| Zyvop evening | **Drafted** | 2026-08-12T17:30Z | pack ready; await PUBLISH_APPROVED |

**Publishing success rule:** no row marked Posted without a verified public URL containing intended content.

---

## 6. TSV Memory rows (appended to content log)

See `docs/social/hermes-mobile-content-log.tsv` append for campaign `engine-v2-20260812-safety-free`.


## 7. Continue pass (2026-08-12T~18:55Z UTC) — publish evidence

| Platform | Status | Verified URL / notes |
|----------|--------|----------------------|
| LinkedIn | **Published** | https://www.linkedin.com/posts/igor-ganapolsky-859317343_the-safety-gate-is-free-the-offline-runner-activity-7493379713890017281-__5F — BrowserOS; body + first-comment CTAs |
| X | **Published** | https://x.com/IgorGanapolsky/status/2087614825048195228 — verify-public-post LIVE |
| dev.to / Medium / Bluesky / Zyvop evening | **Skipped** | Already LIVE same day under evening `leash_approvals_automode` / `leash_approvals` — never double-post |
| Hashnode | **FROZEN** | — |

Prior evening sibling LIVE (other agent):
- https://dev.to/igorganapolsky/auto-mode-escalates-to-the-human-where-is-the-human-54dl
- https://medium.com/@iganapolsky_62116/auto-mode-escalates-to-the-human-where-is-the-human-438d3362e984
- https://bsky.app/profile/iganapolsky.bsky.social/post/3msvoi32t6c2u
- https://zyvop.com/approve-risky-agent-tools-before-they-run-rkexn

## 8. Second continue re-verify (2026-08-12T19:55Z UTC)

| Claim | Result |
|-------|--------|
| X LIVE | **Confirmed** — `verify-public-post` LIVE (safety gate + thumbgate.app), bodyChars≈423 |
| LinkedIn body LIVE | **Confirmed** — BrowserOS public post + recent-activity; full hook text present |
| LinkedIn first-comment CTAs | **Confirmed** after switching sort to **Most recent** — links: home UTM, `/go/android`, `/go/ios` |
| Threads | **Not LIVE** — BrowserOS hit Instagram SSO login wall; did not force hijack/manual |
| dev.to/Medium/Bluesky/Zyvop same-day | Still LIVE other angle — still **do not double-post** |


