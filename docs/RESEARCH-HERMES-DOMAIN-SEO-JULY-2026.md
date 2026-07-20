# Hermes control-plane domain decision — July 2026

**Decision date:** 2026-07-20
**Deep-research run:** `trun_05457d7261984afbbe94c201a1418c60`
**Raw report:** `parallel-research/hermes-domain-seo-july-2026.md`
**Decision:** use `control.thumbgate.ai`; do not buy `leash.dev` or a `hermes*` domain.

## Immediate privacy and security containment

The OpenAI Sites URL exposed the account owner's surname. The site was changed from
public access to owner-only custom access before this recommendation was produced.
Anonymous HTTP now returns `401`.

The WorkOS client identifier and callback URI were deployed as non-secret Sites
variables. A WorkOS secret, Stripe live credentials, a Stripe account password, a
webhook secret, and a backup code were later pasted into chat. They were not used,
stored, or deployed. Targeted secret-shape scans returned no matching files in the
repo or canonical Obsidian vault. All exposed credentials require rotation before
authentication or billing is activated.

## Executive verdict

Use the existing owned brand and domain:

- Marketing and citable content: `https://thumbgate.ai`
- Subscription control plane: `https://control.thumbgate.ai`
- Product name: **ThumbGate Control** or **Hermes Control by ThumbGate**

This is stronger than a new domain because `thumbgate.ai` is already live with the
same AI-agent safety positioning, the exact GitHub hits are the owner's repositories,
and the npm name is already part of the same product entity. `control.thumbgate.ai`
has no current DNS record, so it can be assigned without exposing a personal name.

No new-domain purchase is required. This is a product/SEO recommendation, not a
legal trademark clearance.

## Corrections to the two prior recommendations

### The domain is not irrelevant

Google says new generic TLDs are generally handled like other gTLDs; `.com` does not
receive a documented ranking bonus over `.dev` or other new gTLDs. Google also says
AI-search features use the same foundational SEO practices as ordinary Search.
Those facts do **not** prove that the domain string has no business or retrieval
effect. A name still affects entity disambiguation, branded queries, memorability,
voice transcription, link/mention consistency, and user trust.

Primary Google guidance:

- [Google's handling of new top-level domains](https://developers.google.com/search/blog/2015/07/googles-handling-of-new-top-level)
- [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Provide a site name to Google Search](https://developers.google.com/search/docs/appearance/site-names)

There is no defensible public evidence that a domain string has *zero* effect on all
LLM/answer-engine retrieval. The safer inference is that clear entity identity and
citable content matter more than keyword stuffing.

### `leash.dev` is not the best brand

Registry RDAP returned `404` for `leash.dev` at 2026-07-20T15:50Z, which is a strong
unregistered signal but not a registrar checkout guarantee. It still fails the brand
screen:

- `leash.com` and `leash.ai` are registered.
- GitHub name search returned at least 20 repositories, including StrongDM's
  `strongdm/leash`.
- Both npm and PyPI return occupied package records.
- “Leash” is an ordinary dictionary word for restraint. It is not a coined/fanciful
  mark and has heavy pet/security/software ambiguity.

### `loomgate.ai` and `hermescontrol.dev` also fail

The raw deep-research report recommended `loomgate.ai`, but independent verification
found an exact historical LOOMGATE trademark, a current Picanol LoomGate industrial
monitoring product, an Eternal Strands “Loomgates” game entity, two GitHub name hits,
and a registered `loomgate.com`. It is not clean enough.

Any `hermes*` domain inherits collisions with Hermès, Hermes logistics, Apple software,
live AI-related trademark applications, and the 32K-star NousResearch Hermes Agent
project. A new domain should reduce ambiguity, not preserve it.

## Data used

### Live registry and product checks

RDAP is authoritative for registration records; `404` is treated as an unregistered
signal, never as proof that a registrar will sell a non-premium name. DNS absence was
recorded separately and never used alone.

Checks performed against:

- IANA RDAP bootstrap and Identity Digital RDAP for `.ai`, `.dev`, and `.app`
- Verisign RDAP for `.com`
- DNS A/AAAA/CNAME records
- GitHub repository-name search through authenticated `gh`
- npm registry and PyPI package endpoints
- Parallel web collision searches

`thumbgate.ai` resolves and returns the existing ThumbGate agent-safety site.
`control.thumbgate.ai` and `app.thumbgate.ai` have no DNS records. The zone currently
uses Spaceship nameservers; local Wrangler reports no authenticated Cloudflare user.

### Search-demand limitations

- Google Trends public exploration was attempted for “AI agent kill switch,” “agent
  control plane,” “agent observability,” and “remote AI agent”; Google returned HTTP
  `429`, so no Trends index numbers are claimed.
- Google Ads Keyword Planner requires an authenticated Ads account; no Google Ads
  credentials exist in this environment, so no monthly volumes or CPCs are claimed.
- Reddit and Reddit Answers were accessible through indexed result excerpts. Repeated
  buyer language includes “kill switch,” “runaway loop,” “circuit breaker,” “runtime
  governance,” “control plane,” “budgets,” “approvals,” and “remote access.” Examples:
  [runaway-agent prevention](https://www.reddit.com/r/LangChain/comments/1rhwz53/how_are_you_preventing_runaway_ai_agent_behavior/),
  [the missing kill-switch primitive](https://www.reddit.com/r/LocalLLaMA/comments/1q5uo0y/the_missing_primitive_for_ai_agents_a_kill_switch/),
  [agent control-plane discussion](https://www.reddit.com/r/AI_Agents/comments/1hocja5/anyone_working_on_agent_control_plane/), and
  [remote long-running sessions](https://www.reddit.com/r/ClaudeCode/comments/1rphlyl/how_do_you_maintain_reliable_remote_access_to/).

## Data-science / weak-supervision model

There is no labeled conversion dataset for domain names, and the revenue pipeline has
no 2026-07-20 prospect table. A trained predictive model would be theater. Instead, a
transparent weakly supervised linear ranker scores eight observable or reviewable
features from 0–100:

| Feature | Base weight |
|---|---:|
| Inverse brand/product/package collision | 20% |
| Registration/control signal | 15% |
| Entity uniqueness and LLM disambiguation | 15% |
| Semantic fit for governed continuity | 15% |
| Buyer-intent fit | 10% |
| Memorability and voice transcription | 10% |
| Descriptive-page SEO architecture fit | 10% |
| Defensive TLD coverage | 5% |

The features were rescored under SEO/AEO-first, brand-first, and enterprise-first
weight profiles. Results are sensitivity analysis, not conversion predictions.

| Candidate | Base | SEO/AEO | Brand | Enterprise |
|---|---:|---:|---:|---:|
| **control.thumbgate.ai** | **92.6** | **93.0** | **92.1** | **92.2** |
| thumbrelay.ai | 89.8 | 88.8 | 91.1 | 90.2 |
| thumbsentry.ai | 89.0 | 88.1 | 90.3 | 89.4 |
| failoverguard.ai | 85.5 | 86.3 | 83.5 | 86.9 |
| operatorgate.ai | 84.5 | 84.8 | 84.5 | 85.5 |
| agentcontinuity.ai | 82.0 | 83.4 | 76.8 | 82.7 |
| loomgate.ai | 60.0 | 60.0 | 58.1 | 55.7 |
| leash.dev | 58.7 | 58.8 | 56.1 | 54.2 |
| hermescontrol.dev | 53.1 | 54.3 | 46.5 | 48.6 |

Fallback purchase order if the existing brand must be abandoned:

1. `thumbrelay.ai` — RDAP 404 across `.ai`, `.com`, `.dev`, and `.app`; no GitHub,
   npm, or PyPI exact-name hit in the live screen.
2. `thumbsentry.ai` — the same clean registry/package signals, with a stronger safety
   meaning but weaker continuity meaning.
3. `failoverguard.ai` — semantically explicit but longer and more generic; `.com` is
   registered.

## Hosting decision

Move the application to the owner's Cloudflare account, using **Cloudflare Workers +
D1**, not a generic Pages-only assumption. The app already uses vinext, the Cloudflare
Vite plugin, a Worker entrypoint, and D1 migrations. However, the move is not currently
proven “small”:

- `wrangler whoami` reports unauthenticated.
- The Vite configuration imports Sites-specific hosting bindings and a Sites plugin.
- A direct Worker configuration, real D1 database binding, secrets, migrations,
  custom-domain route, and rollback proof still need to be created and tested.

Do not deploy exposed credentials. After rotation, the direct Cloudflare sequence is:

1. Create/bind the production D1 database in the owner's account.
2. Remove or isolate Sites-specific build bindings.
3. Deploy rotated WorkOS and Stripe values using `wrangler secret put` or dashboard
   secret entry; never commit them.
4. Configure `control.thumbgate.ai` in the Spaceship DNS zone or transfer DNS control.
5. Prove Google and Apple login, paid checkout/webhook, connector pairing, a real
   offline task, return-to-local reconciliation, and revenue readback.

## Commercial model

Use a free-control / paid-compute split:

- **Free:** web dashboard, paired-machine session/thread access, and remote control
  while the customer's own Hermes machine is online.
- **Paid ($29/month starting point):** managed cloud continuation when that machine is
  offline, longer audit retention, and team/governance capabilities.
- **Safety envelope:** keep the implemented 5 trial and 100 paid cloud-continuation
  ceilings, 2,048 output-token limit, 75-second execution timeout, 10 active-task cap,
  and 250-task daily cap until observed unit economics support changes.

This aligns price with the feature that incurs model/runner cost and differentiates the
product from free browser-control tools. It does not make the free tier costless:
relay bandwidth, D1 writes, WorkOS usage, support, and abuse still require per-account
rate limits and telemetry. Measure contribution margin as subscription revenue minus
model inference, Fly/Worker compute, storage/egress, authentication, payment fees, and
support—not merely subscription minus a nominal VPS price. A shared runner pool is
likely more efficient than one dedicated VPS per low-utilization subscriber, but that
requires production task-duration and cost receipts before changing architecture.

## Recommended public identity

**Brand:** ThumbGate Control
**Domain:** `control.thumbgate.ai`
**Title:** `ThumbGate Control — Stop Runaway AI Agents`
**H1:** `Control every agent run—from your Mac, phone, or cloud.`
**Positioning:** `Remote kill switches, bounded cloud continuity, and audit trails for
AI coding agents.`

Use descriptive, citable pages under the root brand for `/agent-control-plane`,
`/runaway-agent-kill-switch`, `/cloud-continuity`, and `/audit-logs`. Publish measured
incident reports and reproducible benchmarks; those are stronger Google/LLM discovery
assets than an exact-match domain.
