# Beta Launch Campaign Research — Hermes Mobile / Leash Pro (July 2026)

Research date: **2026-07-05**. Product: **Hermes Mobile** (free approve/deny + ThumbGate thumbs) + **Leash Pro** ($19/mo gate-rule management, ThumbGate memory). Audience: prosumer AI agent operators (Cursor, Claude Code, OpenClaw, hermes-yolo).

Sources: Kickstarter/Indiegogo rules (2026), Product Hunt playbooks, developer-tool GTM guides, SaaS waitlist/LTD literature, repo artifacts (`LAUNCH-CAMPAIGN-PLAN.md`, `LEASH-PRO-MONETIZATION-RESEARCH.md`, `monetization.ts`, `docs/beta-page/index.html`).

---

## Executive summary

| Question | Answer |
|----------|--------|
| **Kickstarter?** | **NO** — wrong fit for subscription SaaS; use only if repositioned as a hardware bundle (M5Stack leash). |
| **Best campaign type** | **Paid founding-member beta** on owned landing + **Product Hunt** launch week; Stripe/Lemon Squeezy Payment Links before App Store IAP is live. |
| **Landing URL (plan)** | **Canonical:** `https://thumbgate.ai/leash-beta` (extend existing funnel). **Repo prototype:** `hermes-mobile/docs/beta-page/index.html` (GitHub Pages or thumbgate deploy). |
| **Beta pricing** | Free core + **$9/mo founding Leash Pro** (12 months, then $19/mo) OR **$49 one-time founding year**; capped **$149 lifetime** tier (max 150 seats). |
| **Top 3 channels (July 2026)** | 1) Hacker News Show HN · 2) Product Hunt (+ Ship waitlist 14 days prior) · 3) Reddit + GitHub issue help-first outreach (r/ClaudeAI, r/Cursor, agent repos). |

---

## 1. Kickstarter verdict: **NO** (for software-only Leash)

### Why not

1. **Business model mismatch.** Leash Pro is recurring SaaS ($19/mo) with relay/gateway/ThumbGate API marginal cost. Kickstarter backers expect a **deliverable reward**, not an ongoing subscription obligation. Kickstarter explicitly prohibits equity/revenue-sharing rewards; subscription economics are awkward to explain on a campaign page ([Kickstarter Rules](https://www.kickstarter.com/rules/), [Prohibited Items](https://www.kickstarter.com/rules/prohibited)).

2. **Platform sweet spot is creative/physical.** July 2026 comparisons consistently rank Kickstarter/Indiegogo for **hardware, games, films** — capital to fund production — not dev-tool subscriptions ([Product Hunt vs Kickstarter](https://creati.ai/ai-tools/producthunt-com/alternatives/product-hunt-vs-kickstarter-in-depth-comparison-of-discovery-and-crowdfunding-platforms/), [2026 launch software comparison](https://wifitalents.com/best/product-launch-software/)).

3. **Cost vs return.** Kickstarter takes ~5% platform fee + ~3% payment processing, requires 30–45 days of campaign ops, video, tier fulfillment, and backer support. Serious **software** campaigns often need **$4.5k–$15k** ad spend *before* platform fees ([Apps & Software Kickstarter 2026 guide](https://www.boostyourcampaign.com/kickstarter-marketing/apps-software-2025)). Hermes is pre–public-store; that burn buys little vs a Stripe link + Show HN.

4. **Lifetime tier trap.** `LAUNCH-CAMPAIGN-PLAN.md` proposed **$19 one-time “lifetime Leash Pro.”** That conflicts with `monetization.ts` ($19/**mo**) and creates permanent support/API cost with no recurring revenue ([Freemius LTD guide](https://freemius.com/blog/saas-lifetime-deals/), [SaaSbyMonday 2026](https://www.saasbymonday.io/blog/lifetime-vs-subscription-saas)). Do **not** run a Kickstarter tier promising unlimited lifetime SaaS at $19.

5. **Rules still allow software — but you’d be fighting the audience.** Kickstarter permits app/software projects with a **working prototype** and transparent roadmap ([Kickstarter Rules — prototype requirement](https://www.kickstarter.com/rules/)). Hermes has that. The issue is **conversion**, not eligibility.

### When Kickstarter *could* make sense (future)

Reposition as **Hermes Hardware Leash** (M5Stack control surface + mobile app bundle) — a tangible reward tier alongside software access. Repo already has `docs/HERMES-HARDWARE-LEASH.md`. That is a **different campaign**, not Leash Pro SaaS.

### Indiegogo vs Kickstarter for this product

Both are **inferior to owned landing + PH** for software. Indiegogo’s InDemand continuation helps **physical** pre-orders ([2026 crowdfunding guide](https://blog.mean.ceo/crowdfunding-campaign-guide-strategy/)). Skip both for July 2026 software launch.

---

## 2. What converts in July 2026 (developer / AI agent tools)

### Channel conversion hierarchy (evidence-weighted)

| Channel | Role | Typical outcome | Fit for Hermes |
|---------|------|-----------------|----------------|
| **Owned paid beta landing** | Capture email + payment intent | 20–40% visitor→signup on tight pages; paid tiers filter serious users ([Waitlister 2026](https://waitlister.me/growth-hub/guides/saas-product-launch-waitlist)) | **Primary revenue** |
| **Product Hunt** | Discovery + social proof | Top dev tools (Kilo Code, Tabstack, Architect) → #1–#5 POTD; optimize for **email capture**, not upvotes ([Demand Curve PH playbook](https://www.demandcurve.com/playbooks/product-hunt-launch), [awesome-product-hunt 2026](https://github.com/fmerian/awesome-product-hunt)) | **Launch spike** |
| **Product Hunt Ship** | Pre-launch waitlist on PH | Free list building; pairs with 7-day teaser before launch ([EarnifyHub Ship vs AppSumo](https://earnifyhub.com/blog/appsumo-vs-product-hunt-ship)) | **14-day preheat** |
| **Hacker News Show HN** | High-intent operators | Best when post is technical, shows CPU/token before/after ([daily.dev dev-tool GTM](https://business.daily.dev/resources/go-to-market-strategy-developer-tools-launching-product-technical-audience/)) | **Day-0 traffic** |
| **AppSumo LTD** | Cash injection | High volume, ~16–17% refunds, low sub conversion ([Freemius](https://freemius.com/blog/saas-lifetime-deals/)) | **Defer** until IAP + support ready |
| **Kickstarter / Indiegogo** | Crowdfunding | Physical/creative; heavy ops | **No** (software-only) |

### Successful AI agent launches (2025–2026 patterns)

- **Kilo Code** (VS Code agent): repeated PH #1 launches; open-source + clear developer benefit ([awesome-product-hunt](https://github.com/fmerian/awesome-product-hunt)).
- **Publora** (Feb 2026 PH #1): MCP + API for agents; **$2.99/account/mo**, launch coupon `PH20THANKU` ([Publora launch post](https://publora.com/blog/publora-launch-product-hunt-2026)).
- **Architect by Lyzr** (Feb 2026): visual agent control plane; #3 POTD ([hunted.space](https://www.hunted.space/product/architect/launches/architect-by-lyzr)).
- **Pancake AI**: “OpenClaw in Slack”; PH #1 with onboarding demo ([Kingy AI review](https://kingy.ai/news/pancake-ai-review-the-slack-ai-cofounder-trying-to-make-startups-autonomous/)).

**Pattern:** MCP/control-plane positioning, honest pricing, PH + dev communities, **not** crowdfunding.

---

## 3. Beta landing page best practices (2026)

### Page structure (high-converting)

1. **Outcome headline** above the fold — not feature soup ([LaunchList 2026](https://getlaunchlist.com/blog/waitlist-landing-page-examples-that-convert)).
2. **Single CTA** — email only first; qualifying question post-signup (agent stack: Cursor / Claude / OpenClaw).
3. **60–90 second demo** — GIF or Loom of approval on phone + watchdog log (20–30% lift vs static).
4. **Social proof** — GitHub stars, continuous E2E badge, testimonial quotes (no invented counts).
5. **Referral on success page** — “Skip the queue: share link” ([developer waitlist guide](https://business.daily.dev/resources/build-developer-waitlist-convert-before-launch/)).
6. **No nav bar** — 10–15% conversion lift on waitlist pages.

### Tool stack (pick one path)

| Need | Tool | Notes |
|------|------|-------|
| Waitlist + referrals | [LaunchList](https://getlaunchlist.com), [Waitlister](https://waitlister.me) | Hosted waitlist, fraud detection |
| Email sequences | [Loops](https://loops.so), ConvertKit | Post-signup nurture; technical updates not fluff |
| Qualifying survey | [Tally](https://tally.so) | Agent stack, Mac vs Linux, team size |
| **Paid beta checkout** | **Stripe Payment Links** | Fastest validation; 2.9% + $0.30 ([IdeaStack 2026](https://www.ideastack.co/blog/pre-sell-uk-saas-stripe-payment-links-founding-members-2026)) |
| Global tax as MoR | **Lemon Squeezy** | 5% + $0.50; handles VAT ([designrevision 2026](https://designrevision.com/blog/stripe-vs-lemonsqueezy)) |
| Quick page | Carrd, Framer, existing `beta-page/index.html` | Extend — don’t duplicate thumbgate.ai brand shell |

### Paid beta vs free waitlist

- **Free waitlist:** best for list-building 4+ weeks before launch.
- **Paid beta ($1–$49):** filters tire-kickers; even **$1** improves signal ([DEV pricing post](https://dev.to/projekta2/freemium-vs-one-time-vs-subscription-how-i-chose-the-pricing-model-for-my-chrome-extension-4jan)).
- **Paid early access before product is useful:** risky unless audience already trusts you ([Editorialge waitlist guide](https://editorialge.com/saas-waitlist-launch/)). Mitigate with explicit refund policy and “founding member” framing.

**Recommendation for Hermes:** **Hybrid** — free waitlist for OSS watchdog installers; **paid Stripe link** for Leash Pro founding tier (serious operators).

---

## 4. Pricing: paid beta / LTD vs subscription

### Repo constraints

- **Free forever:** in-chat approve/deny, ThumbGate 👍/👎 (`LEASH-PRO-MONETIZATION-RESEARCH.md`).
- **Paid:** Leash Pro gate rules — **`$19/mo`** via `thumbgate_leash_monthly` IAP when stores live (`monetization.ts`).
- **Relay entitlement:** `/v1/entitlements/thumbgate-leash/verify` (server-side Pro).

### Recommended beta pricing (July 2026)

| Tier | Price | What they get | Cap | After beta |
|------|-------|---------------|-----|------------|
| **Free** | $0 | Hermes Mobile + approvals + thumbs + OSS Mac watchdog | — | Always free |
| **Founding Leash Pro** | **$9/mo** (annual prepay **$89/yr**) | Gate rules + ThumbGate memory; Stripe until IAP live | First **200** subscribers | → $19/mo list |
| **Founding year bundle** | **$49 one-time** | 12 months Leash Pro (no auto-renew) | **100** seats | Renew at $19/mo or lapse |
| **Lifetime Gate Keeper** | **$149 one-time** | Leash Pro + priority support | **150** seats max | No new LTD after cap |
| **VIP setup** | **$79** | Founding Pro + 30-min pairing call | **20**/month | Service revenue |
| **Team Shield** | **$299** | 10 seats + team rules sync | **10** teams/quarter | Custom quote |

**Do not** sell unlimited lifetime Leash Pro at $19 — it undermines $19/mo IAP and ThumbGate API economics.

### LTD vs subscription decision

- **Subscription ($19/mo)** is the long-term model (ongoing gateway/relay/API cost).
- **Bounded LTD ($149, 150 cap)** is acceptable as **validation capital** with explicit seat limit ([Freemius direct LTD](https://freemius.com/blog/saas-lifetime-deals/)).
- **AppSumo:** defer until support + IAP + docs are boring; expect deal-seekers and ~17% refunds.

---

## 5. Alternatives inventory

| Platform | Use for Hermes | Verdict |
|----------|----------------|---------|
| **Stripe Payment Links** | Founding Pro checkout today | **Use now** |
| **Lemon Squeezy** | Global beta if US-only tax is painful | **Use at ~50+ intl paid users** |
| **Gumroad** | Simple pre-order | OK; 10% fee; MoR |
| **Product Hunt Ship** | 400+ email list before PH day | **Use** (target 400+ per Demand Curve) |
| **Product Hunt launch** | July spike | **Use** after waitlist warm |
| **BetaList** | Pre-PH teaser | Optional |
| **AppSumo** | LTD blast | **Later** |
| **Kickstarter** | Software SaaS | **No** |
| **Indiegogo** | Hardware pre-order | **Only with M5Stack bundle** |

---

## 6. Copy framework

### Headline options (A/B)

1. **Primary:** “Stop runaway AI agents from freezing your Mac — approve tools from your phone.”
2. **Alt (HN):** “Show HN: A circuit breaker for Cursor/Claude Code — mobile approvals + a 60s watchdog.”
3. **Alt (PH):** “Leash — human-in-the-loop gate for AI agents on your Mac.”

### Value prop (3 bullets)

- **Wallet guard:** kill token-burn loops before they hit your API bill.
- **Machine guard:** OS watchdog reaps runaway simulators/CLI children when load spikes.
- **Thumb from couch:** approve `git push`, migrations, and destructive bash from Hermes Mobile — free; **Leash Pro** manages standing gate rules.

### CTA labels

- Waitlist: **“Join the founding beta”**
- Paid: **“Lock founding Pro — $9/mo”**
- OSS path: **“Install free watchdog (GitHub)”** → mac-yolo-safeguards README

### Objection handlers

| Objection | Response |
|-----------|----------|
| “Why pay before App Store?” | Founding rate + direct APK/TestFlight; Stripe refund within 14 days if pairing fails. |
| “I already use Cursor approvals” | Leash works across agents + standing rules sync + ThumbGate memory. |
| “Is this secure?” | Local gateway; relay optional; no cloud execution of your commands. |

---

## 7. Landing page URL plan

### Extend existing funnel (don’t duplicate)

- **Production URL (target):** `https://thumbgate.ai/leash-beta?utm_source=beta&utm_medium=landing&utm_campaign=july2026`
- **Pro upgrade (in-app today):** `THUMBGATE_PRO_URL` → `https://thumbgate.ai/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=pro_upgrade`
- **Repo static prototype:** `hermes-mobile/docs/beta-page/index.html` — glassmorphism page already built; wire Stripe/Tally before public traffic.

### Deploy options (<2 hr)

1. **thumbgate.ai subdomain/path** — best brand continuity.
2. **GitHub Pages** from `/docs/beta-page/` on mac-yolo-safeguards.
3. **Cloudflare Pages** — same static folder.

### App integration (done in repo)

- `HERMES_BETA_LANDING_URL` in `src/constants/monetization.ts` — Settings “Join founding beta” can open beta page with UTM.

---

## 8. Seven-day launch checklist

| Day | Action | Owner artifact |
|-----|--------|----------------|
| **D-7** | Publish landing; connect Tally (agent stack) + Loops welcome sequence | `beta-page/index.html`, thumbgate.ai |
| **D-7** | Create Stripe Payment Links (Founding $9/mo, Year $49, LTD $149) | Stripe dashboard |
| **D-6** | Product Hunt Ship page live; “Notify me” CTA | producthunt.com/ship |
| **D-5** | Record 90s Loom: watchdog log + phone approval | embed on landing |
| **D-4** | Draft Show HN post + 3 Reddit help replies (no spam) | `LAUNCH-CAMPAIGN-PLAN.md` templates |
| **D-3** | Email waitlist: pricing reveal + founding cap countdown | Loops |
| **D-2** | PH hunter outreach (or self-hunt); warm 400+ supporters | DM / newsletter |
| **D-1** | Test Stripe → manual TestFlight/APK invite flow | Firebase / `android:phone` |
| **D-0** | **Launch:** Show HN 9am ET + Product Hunt 12:01am PT | monitor PH comments 12h |
| **D+1** | Wave 1 invites (5–10% waitlist); personal Loom to paid buyers | batch onboarding |
| **D+3** | Publish “Wall of Love” quotes; fix top 3 onboarding drop-offs | PostHog |
| **D+7** | KPI review; decide AppSumo vs double-down on content | see §9 |

---

## 9. KPIs (30-day window)

| Metric | Target | Tool |
|--------|--------|------|
| Landing visitor → email signup | **≥ 25%** | PostHog / Plausible |
| Email → paid founding | **≥ 5%** of signups | Stripe |
| Paid founding members | **≥ 30** (goal **100**) | Stripe |
| MRR / pre-order cash | **≥ $500 MRR equivalent** | Stripe |
| Show HN → landing CTR | **≥ 8%** | UTM |
| PH upvotes | **≥ 200** (stretch 400+) | Product Hunt |
| PH → email signup | **≥ 15%** of PH landing sessions | UTM `utm_source=producthunt` |
| Beta activation (paired Mac + 1 approval) | **≥ 60%** of invitees | PostHog `mac_scan_complete` |
| Refund rate (paid beta) | **< 10%** | Stripe |
| Leash Pro 7-day retention | **≥ 50%** of activated Pro | gateway entitlement logs |

**Kill / pivot signals:** <100 waitlist signups after $200 ads + Show HN; <3% email→paid; refund rate >15%.

---

## 10. Top 3 acquisition channels (July 2026) — ranked

### 1. Hacker News — Show HN

- **Why:** Dense cluster of Cursor/Claude operators; technical posts that show **measured** CPU/token savings win ([daily.dev GTM](https://business.daily.dev/resources/go-to-market-strategy-developer-tools-launching-product-technical-audience/)).
- **Hook:** “Circuit breaker for autonomous coding agents” + link to landing with Stripe founding tier.
- **KPI:** 500+ landing sessions; 30+ paid if conversion holds.

### 2. Product Hunt (+ Ship preheat)

- **Why:** 2026 agent tools (Kilo, Publora, Architect) prove PH still moves dev SaaS; MCP/control-plane angle fits ([Publora #1 2026](https://publora.com/blog/publora-launch-product-hunt-2026)).
- **Tactic:** Ship waitlist 14 days; launch Tuesday–Thursday; email list is real KPI ([Demand Curve](https://www.demandcurve.com/playbooks/product-hunt-launch)).
- **KPI:** 400+ waitlist; 200+ upvotes; 50+ paid from `utm_source=producthunt`.

### 3. Reddit + GitHub help-first outreach

- **Why:** High-intent pain threads (“agent loop spent $50”, “simulator frozen Mac”) — match `LAUNCH-CAMPAIGN-PLAN.md` template; link OSS first, beta second.
- **Subs:** r/ClaudeAI, r/Cursor, r/LocalLLaMA, r/MacOS, r/devops
- **GitHub:** Comment on runaway-process issues in agent CLI repos with genuine fix + link.
- **KPI:** 10 quality threads/week; 20% of paid betas cite “found via Reddit/GitHub”.

**Runner-up (week 2):** X/Twitter build-in-public clips; Dev.to “multi-agent launch playbook” style post ([DEV PH playbook 2026](https://dev.to/whoffagents/we-just-launched-on-product-hunt-heres-our-exact-multi-agent-playbook-3p14)).

---

## 11. Conflicts to resolve before spending ad dollars

1. **`LAUNCH-CAMPAIGN-PLAN.md` $19 lifetime** vs **`monetization.ts` $19/mo** — use founding tiers in §4; update campaign plan when executing.
2. **IAP not live in stores** — Stripe founding access must map to relay entitlement manually until Play/ASC `thumbgate_leash_monthly` ships.
3. **thumbgate.ai** is cross-promo hub today — beta path should be **`/leash-beta`**, not generic homepage, for attribution.

---

## 12. References

- [Kickstarter Rules (2026)](https://www.kickstarter.com/rules/)
- [Kickstarter Prohibited Items](https://www.kickstarter.com/rules/prohibited)
- [Apps & Software Kickstarter Marketing 2026](https://www.boostyourcampaign.com/kickstarter-marketing/apps-software-2025)
- [Product Hunt vs Kickstarter](https://creati.ai/ai-tools/producthunt-com/alternatives/product-hunt-vs-kickstarter-in-depth-comparison-of-discovery-and-crowdfunding-platforms/)
- [Demand Curve Product Hunt Playbook](https://www.demandcurve.com/playbooks/product-hunt-launch)
- [Developer waitlist that converts](https://business.daily.dev/resources/build-developer-waitlist-convert-before-launch/)
- [SaaS waitlist playbook 2026](https://waitlister.me/growth-hub/guides/saas-product-launch-waitlist)
- [Stripe Payment Links pre-sell](https://www.ideastack.co/blog/pre-sell-uk-saas-stripe-payment-links-founding-members-2026)
- [SaaS lifetime deals — when/how](https://freemius.com/blog/saas-lifetime-deals/)
- [awesome-product-hunt (2026)](https://github.com/fmerian/awesome-product-hunt)

---

## Appendix: repo artifacts

| File | Role |
|------|------|
| `hermes-mobile/docs/beta-page/index.html` | Static beta landing prototype |
| `hermes-mobile/docs/LAUNCH-CAMPAIGN-PLAN.md` | Traffic loops + tier draft (needs pricing sync) |
| `hermes-mobile/src/constants/monetization.ts` | `THUMBGATE_PRO_URL`, `HERMES_BETA_LANDING_URL` |
| `hermes-mobile/docs/LEASH-PRO-MONETIZATION-RESEARCH.md` | Free vs Pro feature split |
