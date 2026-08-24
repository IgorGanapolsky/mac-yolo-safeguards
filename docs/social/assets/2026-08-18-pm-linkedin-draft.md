# LinkedIn draft — 2026-08-18-pm — Claude Code user — MiHoYo overnight token burn

Status: written and verified against live research, NOT posted. Blocked on unresolved
account identity (see below) — do not post until an operator confirms the Buffer-connected
LinkedIn channel "igor-ganapolsky-859317343 LinkedIn Profile" is the mandated
`ig5973700@gmail.com` account (AGENTS.md L63 requires that account only). This question has
now stood unresolved across 5 consecutive runs (2026-08-11, 2026-08-17-am, 2026-08-17-pm,
2026-08-18-am, 2026-08-18-pm).

## Body

At the 2026 Alibaba Cloud Summit, MiHoYo's AI lead described what happened when an employee
set up dozens of agents to collaborate on an internal project: the agents fell into an
all-night loop of critiquing and re-generating each other's output. Nothing crashed. Nobody
was paged. By morning it had burned roughly 2 million yuan (~$300K) in tokens and produced
nothing usable.

I build ThumbGate, and this is the exact failure mode it's built around — not "the agent did
something malicious," just "the agent kept going and no human was in the loop to say stop."

Two things stay true no matter what tier you're on:
- Leash approve/deny is free, forever, on web and mobile. You don't pay to have a human gate
  in the loop.
- Continuity ($10/mo, 14 days free) keeps your agent's session reachable from any browser
  even when your laptop is asleep — so "I wasn't at my desk" stops being the reason nobody
  caught it early.

ThumbGate is early — a handful of us building in public, no big user numbers to point to yet.
But this is the problem I'm building it to solve.

https://thumbgate.app/?utm_source=linkedin&utm_medium=social&utm_campaign=2026-08-18-pm&cta_id=2026-08-18-pm_linkedin_home

## First comment (post immediately after the body goes live)

Also on: Android https://thumbgate.app/go/android · iOS https://thumbgate.app/go/ios · GitHub https://github.com/IgorGanapolsky/mac-yolo-safeguards/tree/main/hermes-mobile

## Evidence

- MiHoYo incident: Zheng Yinhe (head of AI NPC & Gameplay tech, "Honkai" series) at the 2026
  Alibaba Cloud Summit, ~2M yuan (~$300K) burned in a 13-hour overnight multi-agent loop.
  Cross-confirmed via 36kr (eu.36kr.com/en/p/3825876529238657) and independent X post by
  @Pirat_Nation (x.com/Pirat_Nation/status/2060723403301269859), both fetched 2026-08-18.
- thumbgate.app hero copy fetched live 2026-08-18: "Hermes that stays on." / "Always on, even
  when your computer is off. Always awake. Always working."
- Continuity price: live billing API `https://thumbgate.app/api/billing/plan` →
  unitAmount=1000, currency=usd, interval=month, active=true, matches page copy "Flat
  $10/month. 14 days free. Cancel anytime." (fetched 2026-08-18)
- Leash free-forever claim: standing product fact per AGENTS.md, not re-derived from a page
  fetch this run (approve/deny gating is free on web+mobile by design, not a live-priced item).
