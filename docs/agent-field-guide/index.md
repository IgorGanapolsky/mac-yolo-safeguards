# Agent Field Guide (line budget ≤ 80)

Agents own this file. Capture **surprises** that shorten the next trajectory.
Prune stale lines when over budget. Weights are frozen — only written surprises transfer.

## Coordination (never skip)

1. Read `plan.md` → claim free files → commit claim **before** code.
2. Cap **2–3** concurrent in_progress owners on Hermes Mobile.
3. Never edit another agent's §2 claim; `blocked` + STOP.
4. Run `node tools/agent-swarm-harness.js` at session start (also via `agent-session-start`).

## SDD loop (specs govern agents)

discover → blueprint → modular-specs → execute → **gap-analysis** → verify.  
Gap mid-build: update AC/claim/§3 **first**, then code. `node tools/agent-swarm-harness.js sdd`.

## Planner vs worker

- **Planner:** decompose, write AcceptanceCheck, claim files, record design in §3. No leaf implementation in the same context.
- **Worker:** implement one claimed leaf. No new design. Escalate ambiguity.
- **Economics:** frontier for planning; cheap/local (`tinker-yolo` q4) for explicit leaves.

## Megafiles (serialize or split)

`GatewayContext.tsx`, `ChatScreen.tsx`, `gatewayDiscovery.ts`, `gatewayProfiles.ts`,
`tailscaleDiscovery.ts`, `gatewayProfilePicker.ts`, `ConnectMacGate.tsx`,
`hermes-cloud-connector.js`, control-plane `DashboardClient.tsx`.

Hot-file PRs need a `plan.md` §3 decision pointer (or `D-YYYY-MM-DD-…`).

## Thrash signals (not productivity)

High commit rate + multi-claimer conflicts = busywork. Measure finished AC, not activity.

## Verification stack (decorrelated lenses)

Unit → typecheck → continuous E2E (or honest skip) → Greptile on auth/onboarding/OTA →
merge only when required checks green. Never “unit green = shipped.”

## Real-user product

Every Hermes Mobile test is a stranger: no assumed adb reverse, no demo=1 false greens,
no Igor-only USB path. Production OTA needs E2E pass or fresh-user proof.
