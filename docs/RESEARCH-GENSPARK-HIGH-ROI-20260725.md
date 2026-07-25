# Genspark competitive scan → Hermes / ThumbGate high-ROI (2026-07-25)

**Source:** [genspark.ai](https://www.genspark.ai/) (AI Workspace 6.0) + official CLI `@genspark/cli` (`gsk` **1.4.2**).  
**Goal:** Steal *patterns*, not product identity. Hermes remains the agent runtime; ThumbGate remains remote control + Continuity.

## CLI installed (evidence)

```bash
npm install -g @genspark/cli   # → gsk 1.4.2 at ~/.npm-global/bin/gsk
gsk --version                  # 1.4.2
```

Auth: `gsk login` (browser) or `GSK_API_KEY`. This Mac session did **not** run interactive `gsk login` (no-desktop-hijack default). List-tools requires a key.

Capability map (from package readme): search/crawl, image/video/audio gen, email/calendar, Slack/Teams/Notion, GitHub, phone calls, mesh SSH, headless agent chat — **90+ tools behind one binary**.

## What Genspark does well (steal these)

| Pattern | Genspark | Hermes / ThumbGate translation |
|--------|----------|--------------------------------|
| **One primary action** | Super Agent: type → work product | Dashboard: **textarea + Run task** is the only full-width primary |
| **Tools as secondary chrome** | App grid (Slides/Docs/Sheets) below prompt | Mac / Cloud / Auto as **compact pills**, not a second essay |
| **Explain without covering work** | Side panels / steps, not on top of input | Phone: **hide route blurb card**; one-line route title only |
| **Workspace, not chat wall** | Tabs / modes (team, drive, apps) | Existing mobile tabs; keep header **stacked** so title never collides with plan/sign-out |
| **CLI for power users** | `gsk` unifies tools for agents/scripts | Keep fleet CLIs; optional later: thin `hermes` aliases — not a Genspark clone |
| **Outcome language** | “From a question to a live dashboard” | Continuity: “Mac first · keep the thread when the lid closes” (honest, product-true) |
| **Mixture-of-agents framing** | Less control, more tools + reflection | Leash + fenced 90s lease = *our* differentiator — keep visible, not buried |

## What we will **not** copy

- Generic “all-in-one AI workspace” positioning (commodity vs SEL guide).
- Fake productivity metrics or invented case studies.
- Media generation / phone-call marketplace (out of Hermes scope).
- Hashnode/Zernio fan-out; social still Chrome / direct APIs when publishing.

## Implemented this pass (high-ROI only)

1. **Phone dashboard unusable (CEO screenshot)**  
   - Stack header: title row → actions row  
   - Clamp long thread titles  
   - Never paint full `composer-route-explain` card on ≤700px (CSS `!important` + JS `matchMedia`)  
   - One-line route title on phone instead of multi-line card  
2. **This research note** for agents (stigmergy).

## Backlog (next high-ROI, not this PR)

| Idea | Why | Effort |
|------|-----|--------|
| Desktop: collapsible route explain (default collapsed after selection) | Genspark secondary chrome | S |
| Landing: non-commodity hero (operator scene + fenced lease) | SEL + Genspark outcome language | M |
| Optional `gsk`-adjacent fleet skill pack for Hermes connectors | Power-user parity | M |
| SWR restore in `DashboardClient` after #987 clobber | Instant nav | M |

## Verification checklist

- [x] `gsk --version` → 1.4.2  
- [ ] Control-plane unit/frictionless tests green  
- [ ] Deploy worker; phone viewport: title not under Manage plan; no blue route card over textarea  
- [ ] `plan.md` claim released when PR merges  
