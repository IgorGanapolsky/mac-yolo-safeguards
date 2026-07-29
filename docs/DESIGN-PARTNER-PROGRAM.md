# ThumbGate Continuity — Design Partner Program (v1)

**Offer type:** co-build, not free forever SaaS.  
**Cap:** 5–10 partners (research: &lt;5 overfits; &gt;15 kills cadence).  
**Source:** July 2026 deep research `trun_33f2b0228da74b9bb7cf5ae11b867fbd`.

## One sentence ICP

**Staff/senior eng or eng manager at a 20–200 person software company who uses Cursor/Claude Code (or similar) daily and has felt either (1) a runaway agent burn or (2) agent death when the Mac lid closed.**

## What partners get

| Phase | Price | Commitment |
|-------|-------|------------|
| Design (30–60 days) | **$0** (or optional $499 Diagnostic if they want a formal teardown first) | 45 min call every 2 weeks + async feedback within 5 business days |
| After design | **50% off Continuity list** for 12 months (list = live `/api/billing/plan`, currently Pro $10/mo → **$5/mo** locked) | Stay on Continuity; optional case-study quote |

## What we get

- Real offline-lid / control-plane feedback  
- Permission to quote (optional, written)  
- First path to **non-owner Stripe** when they convert off discount  
- Stop building features nobody will pay for  

## Agreement essentials (email is enough to start)

- Mutual NDA if they ask; default: no NDAs for speed  
- Roadmap **vote not veto**  
- Either party exits with 30 days notice  
- No public promo of their company without approval  

## Recruitment priority (research order)

1. Warm network / people who already replied to posts  
2. Prior pipeline who touched agent-reliability offers  
3. Targeted LinkedIn (connection → value → DP ask)  
4. Public complainers (HN/X/GitHub issues) — value reply first  

## Scripts

### LinkedIn connection (no note) then DM after accept

> Saw you’re deep in agent tooling at [Company]. I’m co-building ThumbGate Continuity (Mac stays primary; paid VPS only when the lid closes). Looking for 5 design partners for a 30–60 day co-build — free Continuity during design, 50% off for a year after. 45 min every other week. Interested?

### Email DP ask (igor@igorganapolsky.com)

Subject: Design partner for offline agent Continuity?

Body: see `tools/design-partner-outreach.js` templates.

## Tracker

Private: `business_os/revenue/design-partners-2026-07.tsv`  
Stages: `identified` → `asked` → `accepted` → `active` → `converted_paid` | `exited`

## Anti-patterns

- More than 10 simultaneous DPs  
- Free forever with no conversion path  
- Building megafeatures before 3 active DPs  
- Cold email blasts of identical “$499” bodies (domain burn)
