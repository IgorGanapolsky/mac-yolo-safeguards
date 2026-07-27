# ThumbGate.app-first Content Engine v4.0

**Canonical.** Supersedes Hermes Web+Mobile Evidence-to-Installs v3.0 (co-equal heroes).  
**Product pivot (2026-07-26):** **ThumbGate.app is the main product and primary CTA.**  
Hermes Mobile and thumbgate.ai are **downstream defaults** from the web funnel.

| Artifact | Path |
|----------|------|
| This engine | `docs/social/hermes-mobile-content-engine.md` |
| Memory log | `docs/social/hermes-mobile-content-log.tsv` |
| Grok skill (auto-invoke) | `~/.grok/skills/thumbgate-app-first-promo/SKILL.md` (mirrored under `.grok/skills/`) |
| Fan-out skill | `~/.grok/skills/thumbgate-chrome-promo-fanout/SKILL.md` |

---

## Purpose

Research, create, and when authorized publish platform-native content that drives this **ordered** funnel:

1. **Primary — ThumbGate.app**  
   Qualified visits → sign-in / pair → retained web sessions → Continuity trial or paid Continuity when proven  
2. **Default secondary — Hermes Mobile**  
   Store visits → **paid** installs → retained → pairing → first chat (and first approval when Leash applies)  
3. **Default secondary — thumbgate.ai**  
   Gates / Pro / diagnostic **only** when the angle is reliability / token burn (not “remote dashboard”)  
4. **Supporting**  
   GitHub traffic, contributors, testers · honest reviews only after success · never vanity metrics alone  

```
post / article
  → ThumbGate.app (hero + UTM)
      → pair / dashboard / Continuity
      → /go/android · /go/ios  (secondary)
      → thumbgate.ai only when gate/Pro is the pain
  → retained user → first success → honest review (optional)
```

Do **not** make Google Play or App Store the default first link unless  
`PrimaryProductMode=MOBILE_ONLY` and Research Receipt justifies it.

Never auto-publish: output is a draft unless `PublishMode: PUBLISH_APPROVED`  
(or CEO said promote / post everywhere / fill the gaps).

---

## Product stack (truth hierarchy)

### Primary — ThumbGate.app

| Field | Value |
|--------|--------|
| **URL** | https://thumbgate.app/ |
| **Live title (re-verify each run)** | ThumbGate — Hermes dashboard & continuity |
| **What it is** | Independent **web control plane** for Hermes agents on a computer the user operates. Chat, real agent state, pair without inbound ports. Continuity = optional paid VPS when Mac is offline (prove in real use; do not oversell). |
| **Hero line** | **Control your Hermes agents from any browser — on ThumbGate.app.** |
| **CTA priority** | (1) Sign in / pair (2) Continuity when offline angle (3) Mobile as “also on phone” |

### Secondary — Hermes Mobile

| Field | Value |
|--------|--------|
| **Android (ONLY)** | `com.iganapolsky.hermesmobile.paid` · https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&hl=en_US |
| **iOS** | lookup `com.iganapolsky.hermesmobile` · https://apps.apple.com/us/app/hermes-ai-agent-leash/id6786778037 |
| **Preferred links** | https://thumbgate.app/go/android · https://thumbgate.app/go/ios |
| **GitHub** | https://github.com/IgorGanapolsky/mac-yolo-safeguards/tree/main/hermes-mobile |
| **Pricing** | **Paid downloads only.** Re-fetch live price every run. Never “free to install.” |

**Standing (2026-07-22):** free Android package unpublished — never promote unpaid `com.iganapolsky.hermesmobile` if 404.

### Conditional — thumbgate.ai

| Field | Value |
|--------|--------|
| **URL** | https://thumbgate.ai/ |
| **When** | Token burn, runaway loops, pre-action gates, diagnostic $ / Pro SKU |
| **When not** | Remote chat, Continuity, pairing, phone remote → **thumbgate.app only** |

### Monetization (do not collapse)

| Surface | May sell after verification |
|---------|-----------------------------|
| thumbgate.app | Continuity (paid VPS) — only claims proven live |
| Hermes Mobile stores | Paid app download (live store price) |
| thumbgate.ai | Pro / diagnostic / gates + Stripe HTTP 200 |
| In-app Leash | Re-verify entitlement code; never invent free unlimited approvals |

### Positioning (one sentence)

ThumbGate.app is the web remote for Hermes agents; Hermes Mobile is the paid phone remote for the same computer-side agents; thumbgate.ai is the separate reliability/gates surface. **Independent of Nous Research, Anthropic, OpenAI, Cursor, Fly.io** unless a dated primary source proves otherwise. Never imply affiliation.

**Do not mention Oak & Sparrow Systems or Gatekeeper** in content from this engine.

---

## Product ground truth (re-verify every run — table is not eternal truth)

**Hermes Mobile is never free-to-install** on either store.

| Fact | How to verify |
|------|----------------|
| Play paid package LIVE | curl listing for `com.iganapolsky.hermesmobile.paid` |
| Play free package | Expect unpublished / 404 — do not promote |
| iOS public | iTunes lookup `com.iganapolsky.hermesmobile` returns product URL |
| In-app subscriptions | Check `hermes-mobile/src/constants/monetization.ts` — do not invent SKUs |
| Device claims | `hermes-mobile/docs/proofs/continuous/latest.json` e2e=pass or honest skip |
| Continuity claims | Match **live** thumbgate.app copy (e.g. “proving out” language) |

Pricing rule: state only what the live store/web page shows today.

---

## Primary CTA rules (hard)

Every public promo that is not Reddit-restricted MUST include:

1. **Hero:** `https://thumbgate.app/?utm_source=CHANNEL&utm_medium=social&utm_campaign=BATCH&cta_id=BATCH_CHANNEL_home`  
2. **Secondary (default):** store via `/go/*` or paid store URLs when asset shows mobile  
3. **Tertiary (conditional):** thumbgate.ai diagnostic/Pro with UTMs when angle is gates/reliability  

**Cash path:** Continuity / Pro / Diagnostic only with live checkout (HTTP 200 same day). No placeholder Stripe URLs.

**Hashnode: FROZEN** — never publish/re-try; use Medium + dev.to for longform.  
**Never double-post** same channel + campaign beat the same day.

At least **4 of 7** rolling days: hero CTA = thumbgate.app.

---

## Daily inputs

1. **Date** — YYYY-MM-DD  
2. **PublishMode** — `DRAFT_ONLY` \| `PUBLISH_APPROVED`  
3. **AuthenticatedPlatforms** — logged-in this session only  
4. **AvailableAssets** — verified media or `none`  
5. **PrimaryProductMode** — default `THUMBGATE_APP_FIRST`; overrides `MOBILE_ONLY` or `GATES_AI_ONLY` need Research Receipt justification  
6. **Memory log** — TSV rows (see columns below)

---

## Memory / dedup

Log: `docs/social/hermes-mobile-content-log.tsv`  

Preferred columns:  
`Date Platform Persona Pain Angle Evidence Hook CTA Campaign Status PostURL Outcome HeroDomain SecondaryLinks`

Within 14 days never repeat: title, hook, metaphor, CTA phrasing, structure, scenario, persona.  
Memes: no reuse within 30 days. One row per platform per successful attempt.

---

## Mandatory research (omit claims on failure)

1. Live fetch **thumbgate.app** (title, hero, Continuity wording, store badges).  
2. Live fetch **thumbgate.ai** only if angle may use it.  
3. Play paid package + US search snapshot (rank = dated snapshot only).  
4. iTunes lookup by bundle id — promote iOS only if public URL returns.  
5. Repo: README, commits/release notes, monetization constants, continuous E2E proof.  
6. One competitor + one timely community pain.  
7. Feature claimable only if code path + entitlement ship.  
8. Live pricing only — never remembered prices.  
9. No “works on device” unless E2E pass.

### Hard truth guards

- Never free store install language.  
- Never invent traction, customer counts, ranking gains, guaranteed savings.  
- Sentry: “crash logs only, never sold” — not “zero telemetry” unless proven.  
- Connectivity may need Wi-Fi / Tailscale / tunnel / relay.  
- Never unconditional “keys never leave the device” / “free unlimited approvals.”  
- Never ask for a *positive* review; honest review only after success.  
- Published only when URL opens with intended content — else Drafted/Blocked.

---

## Daily strategy

Choose **exactly one** persona, one pain, one proof, one transformation, one CTA.  
One primary story + ≤3 channel adaptations (not identical clones).

### Personas (rotate; one not used in 7–14 days)

1 Solo agent user · 2 Cursor power user · 3 Claude Code user · 4 Codex user ·  
5 Startup CTO · 6 Automation builder · 7 DevOps/platform · 8 Security eng ·  
9 Eng manager · 10 Founder · 11 Infra autonomous workflows ·  
12 Mac operator away from desk · 13 Team lead (Mac sleep / offline work)

| Persona emphasis | Default hero | Secondary |
|------------------|--------------|-----------|
| Away from desk / browser remote | thumbgate.app | Mobile |
| Mac offline / Continuity | thumbgate.app Continuity | — |
| Phone-first HITL | Mobile (exception day) | thumbgate.app |
| Token burn / gates | thumbgate.ai | thumbgate.app |

### Measurement (ordered)

```
post click
  → thumbgate.app visitor
  → sign-in / pair / dashboard
  → Continuity trial or secondary store click
  → installer or retained web user
  → paired computer
  → first chat
  → first approval (if Leash)
  → purchase (Stripe/ledger proof only)
```

---

## Channel rules

### Reddit
- Disclose you built it; technical + limitation-first.  
- Default link: GitHub and/or thumbgate.app.  
- No store spam, pricing, vote/review CTA.  
- No multi-sub identical promo. Check recent removals before posting.  
- thumbgate.ai only if thread is about agent mistakes/gates.  
- Prefer flair-required subs only when flair can be set.

### LinkedIn
- Operator story + one proof + one business outcome.  
- **Hero CTA = thumbgate.app** with UTM (body preferred for cash/hero links).  
- Account: authorized brand LinkedIn only (`ig5973700` skill).  
- Name Nous Hermes / @NousResearch, Fly.io / @flydotio when relevant — no affiliation.

### X, Bluesky, Threads
- Concise hook, one primary link = thumbgate.app.  
- No fake threads. Secondary store in reply if needed.

### Medium / dev.to
- One canonical longform; syndicate with canonical URL.  
- Hero thumbgate.app; stores in “Also available.”  
- **Hashnode FROZEN — skip entirely.**

### Instagram / memes
- Real vertical demo or rights-safe meme; hero thumbgate.app.

### GitHub / HN
- Value-first; product link only when on-topic.  
- No cold checkout spam. HN may flag Show HN — report dead honestly.

---

## Output (every run)

1. **Research Receipt** — claim → source → UTC; include live thumbgate.app title/description.  
2. **Daily Decision** — persona, pain, angle, evidence, **hero domain**, secondary links, metric.  
3. **Primary post** + ≤3 adaptations.  
4. **Asset brief** when visual.  
5. **Publish Ledger** — Drafted/Published/Blocked/Skipped/FROZEN + URL or error.  
6. **Measurement plan** + next-day rule.  
7. **TSV rows** with HeroDomain + SecondaryLinks.

---

## PublishMode + automation posture

| Mode | Allowed |
|------|---------|
| `DRAFT_ONLY` | Research + drafts only |
| `PUBLISH_APPROVED` | Named platforms after pre-flight; LIVE matrix required |

Fan-out mechanics: `~/.grok/skills/thumbgate-chrome-promo-fanout/SKILL.md`.  
No Zernio. Prove each LIVE URL. Do not claim “everywhere” without the matrix.

Desktop: do not hijack interactive Chrome unless this turn authorizes promo/publish; prefer dedicated window and URL-substring tab match.

---

## Newsletter (owned channel)

ICP: developers running autonomous coding agents who fear runaway loops / token burn / destructive commands.  
Promise: one shippable agent-safety play per issue. Soft CTA may point to thumbgate.app / Continuity once list exists. Cadence weekly. Human send-gate for revenue mail.

---

## Diff vs prior engines

| Prior (v3.0) | v4.0 app-first |
|--------------|----------------|
| Web + Mobile + GitHub co-equal | **thumbgate.app hero** → mobile → ai |
| Store-first measurement often | Web pair/session first, then install |
| Hashnode in longform set | **Hashnode frozen** |
| Gatekeeper name-drops allowed | **Do not mention** |
| Link-in-first-comment LinkedIn default | Hero + cash CTAs in body when possible |

---

## One-line operator summary

**Promote ThumbGate.app as the product people land on; let Hermes Mobile and thumbgate.ai ride as defaults from that site; prove every LIVE row; never claim free installs or Hashnode success.**
