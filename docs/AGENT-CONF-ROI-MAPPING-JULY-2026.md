# Agent Conf themes → our stack (July 2026)

Source: Callstack Agent Conf invite (Warsaw, Sept 17–18 2026) — session teasers only, not full talks.

| Theme | Their teaser | Our ship (this PR) |
|-------|--------------|--------------------|
| Meta control plane | Manage thousands of agents | `tools/agent-control-plane.js` — plan locks + LaunchAgent + E2E health score; `claim-check` gate |
| eBay alert agents | ~70% faster alert investigation | `tools/alert-investigation-loop.js` — scan → open → mitigate → close with **ttmMs** |
| Grafana observability | Vibes insufficient | `tools/hermes-observability-gate.js` — `e2e=skipped ≠ pass`; freshness SLO |
| Booking.com migration | Autonomously migrate 40M Perl lines | **Deferred** — no Perl/legacy migration debt in this repo; avoid theater |
| Context / memory | Agent memory + handoff | `tools/agent-incident-capture.js` — secret-safe ThumbGate capture payload |

Wire-in: `tools/agent-automation-status.js` prints control-plane score + observability status.

Commands:

```bash
node tools/agent-control-plane.js status --json
node tools/agent-control-plane.js claim-check tools/foo.js --agent cursor-x
node tools/alert-investigation-loop.js scan --json
node tools/hermes-observability-gate.js --mode ship --json
node tools/agent-incident-capture.js --title "..." --root-cause "..." --fix "..." --json
```

## Mobile product layer (follow-up — this PR)

Phone users do not run `node tools/*`. Agent Conf themes must surface **in chat**:

| Theme | Mobile ship |
|-------|-------------|
| eBay alert TTM | `hermes-mobile/src/utils/chatStallInvestigation.ts` — after 45s on Delivering/Working, classify cause (weak model / mega / no tokens / unreachable) |
| Human control | RunProgressBanner shows investigation + **Start fresh** / **Switch Mac** CTA |
| Grafana honesty | Investigation uses `macHttpOk` (chat path), not vibes-only Connected label |
| Meta control plane | Switch Mac opens picker (fleet choose); start fresh exits poisoned thread |
| Booking migration | Still deferred (no Perl theater) |

```bash
# unit
cd hermes-mobile && npm test -- --runInBand src/__tests__/chatStallInvestigation.test.ts
```
