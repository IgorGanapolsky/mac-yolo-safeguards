## Summary

<!-- What changed and why (intent / AcceptanceCheck). -->

## Role

- [ ] **Planner** — design, AC, claims only (no leaf implementation in this PR)
- [ ] **Worker** — implements a claimed free leaf from `plan.md`

## plan.md coordination

- Task id(s):
- Files claimed in §2:
- Decision ref(s) for megafiles / design (required if touching GatewayContext, ChatScreen, discovery, ConnectMacGate, hermes-cloud-connector, DashboardClient):  
  <!-- e.g. D-2026-07-22-serialize-gateway or "plan.md §3 …" -->

## AcceptanceCheck

<!-- Paste the task AC and mark evidence. -->

## Verification stack (decorrelated lenses)

- [ ] Focused unit tests (command + result)
- [ ] Typecheck if TS/mobile touched
- [ ] Continuous E2E pass **or** honest skip reason (phone lease / no device)
- [ ] Greptile reviewed if onboarding / auth / OTA / pairing
- [ ] No foreign `plan.md` §2 claims edited

## Model economics (optional note)

<!-- frontier planned / cheap-local executed, if relevant -->

## Risk / rollback

<!-- Hot files, user-visible behavior, OTA implications -->

## Merge fast-lane (high-ROI, Aug-2026 Copilot)

- [ ] Risk tier chosen (low/medium/high). Auto-merge eligible only for low + green.
- [ ] Up to date with base (no merge conflicts) — or routed through merge queue.
- [ ] Copilot code review requested (`@copilot review`) — link or note N/A.
- [ ] No new CodeQL/security alerts (or Autfix branch linked).
- [ ] Agent iteration notes (review replies applied via `@copilot`) — or "none."
- [ ] Body metadata: `Closes AGENT-XX` + this commit SHA + verification output.
- [ ] `agent:copilot` (+ primary agent) label + cycle-time frontmatter in Linear.
