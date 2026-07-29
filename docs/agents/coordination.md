# Multi-agent coordination — full protocol

> Extracted verbatim from `AGENTS.md` on 2026-07-29 to keep the always-injected core small.
> The hard rules ("Never" list) remain in `AGENTS.md`; this file holds the full detail.

## Two-layer model (researched 2026-06-24)

Multiple autonomous agents (Claude Code, Cursor, Antigravity, gemini/codex) work this repo. To NOT
clobber each other:

1. **Isolation:** one agent per **git worktree + branch**; serialize git ops; **sequential** merge onto `main` (rebase first), gated on `npm test` + Maestro E2E.
2. **Coordination:** [`plan.md`](../../plan.md) is the **shared live board**. It is the single source of truth for who is doing what.

**Protocol (every task):**
1. **Read `plan.md`.** Pick a `pending` task whose claimed files are `(free)`.
2. **Claim before you touch** — set Owner+Status in the Task Board AND add your files to the File Ownership Map (your `agent-id` + UTC date), and commit `plan.md` *first*, before editing code.
3. Work only on your claimed files, in your worktree.
4. **Discovered work** → append to plan.md §4; don't silently expand scope.
5. Verify against the task's AcceptanceCheck; on green, set `done`, release your files (append a line), add a Decisions-Log entry.

Cap concurrency at **2–3 agents** on this tightly-coupled mobile codebase. If your session directive conflicts with an in-progress `plan.md` claim, surface it — do not diverge.

Note: AGENTS.md is read natively by Cursor, gemini/Gemini, Copilot, Aider, Windsurf, Zed, Claude Code. Antigravity may need to be pointed at this file explicitly.

## Delegating to sub-agents (explicit boundaries, not implied caution)

When an agent spawns its own sub-agents/sub-tasks (not the top-level multi-agent-on-this-repo
case above — this is one agent fanning out its own work), state the operational boundary in
the delegating prompt itself. Don't rely on the sub-agent inferring caution from context.

- **State the stop condition literally:** "open a PR, do NOT merge it yourself" / "draft it,
  do NOT send it" / "verify with --help output, do NOT run this against production." A
  sub-agent given "add rollback support" will happily also merge the PR and deploy it unless
  told not to — it isn't being reckless, it's completing the task as scoped.
- **Require proof, not a completion claim:** "prove it with a real before/after" (break the
  thing on purpose, show it detected, restore it, show it's healthy again) beats "add tests"
  — a sub-agent told to "add tests" will write tests that trivially pass regardless of
  whether the fix does anything; a sub-agent told to prove a specific before/after transition
  has to demonstrate the fix actually causes the observed difference.
- **This works — evidence, not theory:** every sub-agent dispatched this way in the
  2026-07-26 session stayed inside its stated boundary (opened PRs without merging, verified
  CLI flags via `--help` without running them against real infra, proved detection logic by
  genuinely breaking and restoring state) because the boundary was in the prompt, not implied.

## Planner / worker swarm economics (2026-07-22)

Harness quality beats model mix. Same models thrash without ownership; explicit roles + thrash detection ship more finished AC per dollar. Source lesson: Cursor agent-swarm model economics, applied at **human tempo** (worktrees + sequential merge — not a custom 1k commits/sec VCS).

### Roles (context efficiency)

| Role | Does | Does not |
|------|------|----------|
| **Planner** | Decompose goal → leaf tasks, write AcceptanceCheck, claim free files, record design in `plan.md` §3 | Implement worker leaves in the same context; delegate the same design question to two subtrees |
| **Worker** | Implement **one** claimed free leaf; stacked verification; ship | Invent design; edit foreign claims; self-merge megafile conflicts |

Set `AGENT_ROLE=planner` or `worker` (default worker). Session start prints guidance via `node tools/agent-swarm-harness.js`.

### Model economics

- **Frontier** (Claude/Grok/Cursor frontier): planning, ambiguous product/architecture, AcceptanceCheck quality.
- **Cheap/local** (`tinker-yolo` q4, Composer-class): execute explicit leaves once AC + claims are locked.
- **Anti-pattern:** five frontier agents re-deriving the same design on a megafile.

### Thrash detection (not productivity)

Measure finished AcceptanceChecks, multi-claimer count, and megafile contention — **not** commit rate.

```bash
node tools/agent-swarm-harness.js          # human brief + Field Guide
node tools/agent-swarm-harness.js --json   # machine-readable
node tools/plan-coordination-snapshot.js   # active tasks (named + numeric T- ids)
```

If harness reports contention or HOT megafile multi-owner → mark `blocked`, log, **STOP**.

### Megafiles (serialize or split)

Known choke points (also in harness `MEGAFILES`):

- `hermes-mobile/src/context/GatewayContext.tsx`
- `hermes-mobile/src/screens/ChatScreen.tsx`
- `hermes-mobile/src/services/gatewayDiscovery.ts` / `gatewayProfiles.ts` / `tailscaleDiscovery.ts`
- `hermes-mobile/src/utils/gatewayProfilePicker.ts`
- `hermes-mobile/src/components/ConnectMacGate.tsx`
- `tools/hermes-cloud-connector.js`
- `apps/hermes-control-plane/app/dashboard/DashboardClient.tsx`

PRs that touch these **must** cite a `plan.md` §3 decision (`D-YYYY-MM-DD-…` or "Decisions Log"). Check:

```bash
git diff --name-only origin/main...HEAD | node tools/agent-swarm-harness.js check-hot-files --stdin --body-file pr-body.md
```

### Field Guide (stigmergy)

Agents curate short successor context at [`docs/agent-field-guide/index.md`](../agent-field-guide/index.md) (≤80 lines). Capture **surprises**, prune stale lines. Injected automatically by `agent-session-start` / `agent-swarm-harness`.

### Stacked verification lenses

No single check is enough. Before "done" / "shipped":

1. Focused unit tests for the claimed surface
2. Typecheck when TS/mobile touched
3. Continuous E2E pass **or** honest skip reason (phone lease / no device)
4. Greptile on onboarding / auth / OTA / pairing PRs
5. Sequential merge onto `main` only when required checks are green

Detail: [`docs/AGENT-SWARM-HARNESS.md`](../AGENT-SWARM-HARNESS.md).
