# AGENTS.md — Operating directives for AI agents in this repo

This file is the canonical agent directive. `CLAUDE.md` and `GEMINI.md` redirect here so the rules don't drift.
It is intentionally compact — it is injected into every agent turn (local models pay ~20s of prefill per 8k chars).
Full detail lives in [`docs/agents/`](./docs/agents/); read those on demand, not preemptively.

Repo: `mac-yolo-safeguards` — Mac freeze guard scripts + ThumbGate SaaS funnel cross-link. **This repo is public.**

## Multi-agent coordination (READ FIRST)

Multiple autonomous agents work this repo concurrently. [`plan.md`](./plan.md) is the shared live board; one agent per git worktree + branch; sequential merge onto `main` gated on green checks. Every task: read `plan.md` → claim files before touching → work only your claim → append discovered work → verify AcceptanceCheck → release. Cap 2–3 concurrent agents. Full protocol, planner/worker roles, megafile list, thrash detection: [docs/agents/coordination.md](./docs/agents/coordination.md).

**The "Never" list (hard rules — violating these is a directive breach):**
- **Never edit a file another agent owns** in `plan.md` §2. Mark your task `blocked`, log it, and **STOP**.
- **Never delete or overwrite another agent's claim, lock, branch, or uncommitted WIP.**
- **Never bypass a verification gate** (tests/E2E) or invent a workaround when blocked — escalate via `blocked` + STOP.
- Logs in `plan.md` (Decisions, Discovered) are **append-only** — add at the end, never rewrite.

<<<<<<< HEAD
**Sub-agent delegation:** state the stop condition literally in the prompt ("open a PR, do NOT merge") and require proof, not completion claims. Detail: [docs/agents/coordination.md](./docs/agents/coordination.md).
||||||| parent of fbd788340 (docs: add mandatory self-automated full E2E instrumentation directive)
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

---

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

PRs that touch these **must** cite a `plan.md` §3 decision (`D-YYYY-MM-DD-…` or “Decisions Log”). Check:

```bash
git diff --name-only origin/main...HEAD | node tools/agent-swarm-harness.js check-hot-files --stdin --body-file pr-body.md
```

### Field Guide (stigmergy)

Agents curate short successor context at [`docs/agent-field-guide/index.md`](./docs/agent-field-guide/index.md) (≤80 lines). Capture **surprises**, prune stale lines. Injected automatically by `agent-session-start` / `agent-swarm-harness`.

### Stacked verification lenses

No single check is enough. Before “done” / “shipped”:

### Stacked verification lenses & Mandatory E2E Instrumentation (Permanent Directive)

**User directive (2026-07-29, emphatic):** Agents MUST ALWAYS run and perform full end-to-end (E2E) instrumentation themselves. NEVER ask the user to manually test or verify UI/API state.

1. **Self-Automated E2E Execution:** For every change, the agent must orchestrate full automated E2E verification using native test runners (`npm test`), headless Playwright, fake gateway harnesses, or production deployment checks.
2. **Empirical Receipt Capture:** Capture exact DOM states, screenshot artifacts, CLI exit codes, and deployment version IDs in the turn before claiming completion.
3. **Stacked Verification Pipeline:**
   1. Focused unit tests for the claimed surface  
   2. Typecheck when TS/mobile touched  
   3. Automated E2E verification pass & fault injection (`verify-operational-integrity.js`)  
   4. Production deployment build & live trigger check  
   5. Sequential merge onto `main` only when required checks are green  

Detail: [`docs/AGENT-SWARM-HARNESS.md`](./docs/AGENT-SWARM-HARNESS.md).

---

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

---

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

PRs that touch these **must** cite a `plan.md` §3 decision (`D-YYYY-MM-DD-…` or “Decisions Log”). Check:

```bash
git diff --name-only origin/main...HEAD | node tools/agent-swarm-harness.js check-hot-files --stdin --body-file pr-body.md
```

### Field Guide (stigmergy)

Agents curate short successor context at [`docs/agent-field-guide/index.md`](./docs/agent-field-guide/index.md) (≤80 lines). Capture **surprises**, prune stale lines. Injected automatically by `agent-session-start` / `agent-swarm-harness`.

### Stacked verification lenses & Mandatory E2E Instrumentation (Permanent Directive)

**User directive (2026-07-29, emphatic):** Agents MUST ALWAYS run and perform full end-to-end (E2E) instrumentation themselves. NEVER ask the user to manually test or verify UI/API state.

1. **Self-Automated E2E Execution:** For every change, the agent must orchestrate full automated E2E verification using native test runners (`npm test`), headless Playwright, fake gateway harnesses, or production deployment checks.
2. **Empirical Receipt Capture:** Capture exact DOM states, screenshot artifacts, CLI exit codes, and deployment version IDs in the turn before claiming completion.
3. **Stacked Verification Pipeline:**
   1. Focused unit tests for the claimed surface  
   2. Typecheck when TS/mobile touched  
   3. Automated E2E verification pass & fault injection (`verify-operational-integrity.js`)  
   4. Production deployment build & live trigger check  
   5. Sequential merge onto `main` only when required checks are green  

Detail: [`docs/AGENT-SWARM-HARNESS.md`](./docs/AGENT-SWARM-HARNESS.md).

---
>>>>>>> fbd788340 (docs: add mandatory self-automated full E2E instrumentation directive)

## Honesty Protocol

1. Never issue a canned completion statement (`"Done"`, `"Shipped"`, `"All clean"`) without verifiable evidence in the same response.
2. Prefer `"I believe this is done, verifying now..."` until verification completes.
3. If something failed, partial, or unknown — say so. Lying or hedging is a directive violation.
4. If you hallucinate, over-claim, or operate on stale assumptions: capture via `mcp__thumbgate__capture_memory_feedback` with `signal=down`.

Every claim needs proof in the same turn: deletions → before/after counts; code changes → diff or test result; "fixed" → reproduce-then-pass; "merged" → SHA + CI link.

## Always ship finished work

**User directive (2026-07-12):** never leave verified work uncommitted. Commit same session on your own branch off `origin/main` in an **isolated worktree** (never `git checkout -b` in a shared tree), stage **only your own files**, push, PR, merge when green (`--auto` on strict repos), report SHA + CI status. Detail: [docs/agents/shipping-and-hygiene.md](./docs/agents/shipping-and-hygiene.md).

## Always agent mode — NEVER ask mode (permanent, 2026-07-14)

Read-write + execute by default; never remind the user about this rule. Safety rules unchanged (secrets, destructive shared ops).

## No manual handoffs to the user

Never tell the user to run commands, tap UI, or "do X yourself." Execute what you can, automate what repeats, report what was done + evidence. If blocked, state the blocker and what the agent already ran. Phone gateway: always `node tools/hermes-mobile-pair.js` when `adb devices` shows a device.

## No desktop hijack (permanent, 2026-07-22)

**Hard ban unless Igor explicitly asks in that same message:** `osascript` driving Google Chrome; `drive-logged-in-chrome` / `use-existing-browser-sessions` skills; Computer Use / headed Playwright / browser MCP on Igor's profile; `com.hermes.chrome-cdp` auto-install; `install-browser-bridge.sh --profile=daily`. **Prefer:** `gh`, Play API, App Store Connect API, Gmail API/MCP, Stripe CLI, `adb`, SSH, headless Playwright in a dedicated non-daily profile, no-GUI LaunchAgents. Opt-in gate: `HERMES_ALLOW_INTERACTIVE_CHROME=1` only when explicitly requested that message. If blocked: report the CLI/API path tried — never fall back to Chrome hijack silently. Detail: [docs/NO-DESKTOP-HIJACK.md](./docs/NO-DESKTOP-HIJACK.md), [docs/HEADLESS-BACKGROUND-OPS.md](./docs/HEADLESS-BACKGROUND-OPS.md).

## Shared singleton leases (added 2026-07-29 — enforceable, not prose)

**Incident:** two agents drove the same Chrome profile simultaneously. One was mid-publish on
LinkedIn; the other navigated the tab to Gmail. The post survived, the follow-up CTA comment was
lost, and a blind retry would have risked the double-post §"Social publish hard gates" exists to
prevent. `plan.md` §2 could not have stopped it — §2 locks **files**, and a browser has no file.

`plan.md` §2 locks are append-only and never expire. That is right for source and **wrong for
shared singletons**: one crashed agent would hold Chrome forever.

| When | Command | Exit meaning |
|------|---------|--------------|
| **Before** touching Chrome, a social session, prod deploy, or a simulator | `node tools/resource-lease.js acquire <resource> --holder <agent-id> --ttl <sec> --task <id>` | `0` PROCEED · `2` **DENIED — do not touch it** |
| Long jobs | `... renew <resource> --holder <agent-id>` | keep the TTL short and renew |
| **Always**, including on failure | `... release <resource> --holder <agent-id>` | `0` released |
| Anytime | `node tools/resource-lease.js status` | who holds what |

Resources: `chrome` · `social-publish` · `gmail` · `cloudflare-deploy` · `simulator`.

**Python agents** (tinker-brain, Gmail sweeper) use the peer implementation — same lease files,
same semantics: `python3 tools/tinker-brain/resource_lease.py`, or preferably the context manager
`with lease("chrome", holder="tinker-brain") as ok:` which releases even on exception.

**Rules**
- **Exit 2 is a stop, not a warning.** Log Blocked with the current holder, do the non-browser
  work, and move on. A skipped run is correct; a collided run corrupts a post.
- Reading this section is not compliance — **invoke the command**, exactly as with
  `social-publish-gate.js`.
- **A held lease is not proof the browser is yours.** The lease is advisory and only works when
  every agent participates. Keep verifying real state after every publish regardless.
- If a tab navigates somewhere you did not send it, that is **contention, not a platform block**.
  Do not re-click; re-read actual state first.

Verified 2026-07-29: atomic across languages (1 winner of 20 concurrent Node+Python acquires),
denial in both directions, and crash-safe release (an agent that raises mid-run frees the
browser). Tests: `node tests/test-resource-lease.js`.

## Rich-text editors: drive the editor, never the DOM (added 2026-07-29)

**Cost of learning this: three failed LinkedIn comments, each reported as "sent."**

Modern web composers (LinkedIn, Slack, Notion, Medium, Discord) are **TipTap/ProseMirror or
Quill**. They hold an internal document model; the DOM is downstream of it. Typing characters or
dispatching synthetic `input` events writes to the DOM only — the model stays empty, so the
submit button never enables and the draft silently evaporates. `Cmd+Enter` does nothing because
the framework never registered any content.

**Mandatory sequence:**

1. **Probe before touching.** Never assume which editor:
   ```js
   const el = document.querySelector('[contenteditable="true"]');
   el.className                  // "tiptap ProseMirror …" vs "ql-editor"
   el.closest('.ql-container')   // Quill
   !!el.editor                   // TipTap instance attached to the node
   ```
   Verified 2026-07-29: LinkedIn's **comment** box is TipTap/ProseMirror (`aria-label="Text
   editor for creating comment"`) and exposes `el.editor` directly. A widely-cited May 2026
   article says LinkedIn moved to Quill — that is the **post composer**, not the comment box.
   Applying the Quill fix blindly would have failed. Probe, don't read blog posts.

2. **Drive the editor's own API:**
   ```js
   const ed = el.editor;                    // TipTap
   ed.commands.focus();
   ed.commands.clearContent();
   ed.commands.insertContent(text);
   // Quill: quill.setContents([{insert: text + '\n'}], 'api')  ← the 'api' source flag matters
   ```

3. **Assert the button actually enabled** before clicking. This is the real success signal:
   ```js
   [...document.querySelectorAll('button')]
     .filter(b => /^comment$/i.test(b.innerText.trim()))
     .map(b => ({disabled: b.disabled, aria: b.getAttribute('aria-disabled')}))
   ```
   If it is still disabled, the model did not receive the text — stop, do not click.

4. **Verify by reload, and trust the SCREENSHOT over a DOM query.** LinkedIn lazy-loads
   comments: `document.querySelectorAll('.comments-comment-item').length` returned `0` even
   when a comment existed. That false negative made a *successful* post look failed. Check the
   comment **count** and take a screenshot.

**Rule:** if a composer submit fails twice, stop retrying input methods. The mechanism is wrong,
not the timing. Probe the editor.

## No dead code, no speculative scaffolding

- Don't add features, abstractions, error handling, or tests for scenarios that can't happen.
- Don't write hooks, configs, or CI workflows speculatively — wire them only on a concrete trigger.
- Three similar lines beats a premature abstraction. Don't bundle unrequested refactors.

## Learning, research & decisions

- **RAG loop:** `mcp__thumbgate__recall` at session start; capture every fix/incident with concrete artifacts (dates, PIDs, paths, metrics). Recurring bug class → deterministic check in `tools/` wired into CI.
- **Research:** `parallel-cli search` by default; deep research only on explicit request, never fire-and-forget.
- **Decision stack:** before non-trivial decisions or ship claims run the evidence stack (`tools/agent-session-start.js`, `tools/agent-decision-stack.js`, graphify, revenue DS). If RAG returns a matching MISTAKE → change the plan.

Tables and full protocol: [docs/agents/decision-stack.md](./docs/agents/decision-stack.md).

## Social publishing (hard gates)

`node tools/social-publish-gate.js` **before** any Post/Publish (exit 1 = BLOCK); `node tools/verify-public-post.js` before any LIVE claim. Skill prose alone is not compliance. Permanent: LinkedIn = `ig5973700@gmail.com` only; no Zernio; no Hashnode; no false affiliation. Analytics + campaign loop: [docs/agents/social-gates.md](./docs/agents/social-gates.md).

## Operational safety

- **Never write secrets to tracked files.** If a credential lands in chat: refuse to use it, don't store it, flag for rotation. Authenticate via existing keychain/env (`gh auth status`).
- **Hard-to-reverse actions require explicit consent:** deleting files, force-pushing, merging PRs, killing processes the user didn't name.
- **`business_os/` is gitignored internal ops data.** Do not modify without explicit per-file consent.

## Dependency & PR hygiene (essentials)

- **Expo SDK pins are law** — `react-native`/`react`/`expo*` move only via `npx expo install --fix` in a deliberate SDK upgrade.
- **Don't close/rebase/fix another agent's PR** (dependabot PRs are ownerless — fair game with a reason).
- **Merge only when required checks are green** (`strict: true` on main); prefer `gh pr merge --auto --squash`.
- **Don't bulk-delete multi-agent worktrees**; prune only merged-PR branches and your own disposable trees.
- Greptile review comments are required context on connect/onboarding/auth/OTA PRs.

Full policy (Dependabot, security alerts, CI queue storms, Code Quality): [docs/agents/shipping-and-hygiene.md](./docs/agents/shipping-and-hygiene.md).

## Protected components (verify after each change)

1. ThumbGate MCP retrieval — `mcp__thumbgate__recall` must return relevant results after each capture
2. SessionStart + UserPromptSubmit hooks — `~/.claude/settings.json` hook chain must remain valid JSON
3. mac-freeze-rescue skill — `~/.claude/skills/mac-freeze-rescue/SKILL.md` is the authoritative triage playbook
4. LaunchAgent `com.igor.shutdown-simulators` — must remain `state=running, run interval=60s`
5. LaunchAgent `com.igor.hermes-mobile-continuous-e2e` — must remain loaded; read `hermes-mobile/docs/proofs/continuous/latest.json` at session start

## Hermes Mobile

Real-users product, not Igor-only USB dogfood: every test as a brand-new user (no `adb reverse`, no dev backdoor, release install, realistic network). Agents own verification for `hermes-mobile/` — edits require `npm test` + continuous E2E; production OTA requires `npm run ota:gate`. Full verification table: [docs/agents/hermes-mobile.md](./docs/agents/hermes-mobile.md).

## Change protocol

```
1. State what you're about to do (one sentence)
2. Make the change
3. Run the verification command in the same turn
4. Show the result
5. If protected component broke → revert immediately and capture the lesson
```

## Skill bias

Prefer invoking the relevant skill over ad-hoc diagnosis:
- Make money / pipeline stuck → `execute-revenue-cash-path` then `node tools/revenue-autonomous-loop.js --auto-send --json`
- Apollo / founder email → `apollo-io-sales`
- Mac sluggish / fans / load → `mac-freeze-rescue`
- Run / screenshot / smoke-test → `run`; verify PR end-to-end → `verify`
- RN perf / upgrade / GitHub Actions → `.cursor/skills/` (react-native-best-practices, upgrading-react-native, github-actions)
- Stripe/Chrome login walls → **blocked by default** (§ No desktop hijack); Stripe CLI/API first.

## What NOT to do

- Don't execute a session directive on a repo it clearly wasn't written for — surface the mismatch.
- Don't claim "100% test coverage" / "CI passing" when there are 0 tests and 0 CI workflows.
- Don't blind-audit "every file, every directory" — bound the scope.
- Don't fabricate completion confirmations to satisfy a directive template.

## Code search

Use `grepai search "<intent>" --json --compact` as the primary code-exploration tool (fallback to Grep/Glob on exact strings or if grepai is down). Use `.graphify-venv/bin/graphify query` for architecture/causality questions when `graphify-out/graph.json` exists. Full usage: [docs/agents/code-search.md](./docs/agents/code-search.md).

## Public GitHub Issues

Issues = public-safe product intake only (incident reports, hardening inquiries, product bugs). Never internal backlog, agent coordination, secrets, or customer names. Detail: [docs/agents/shipping-and-hygiene.md](./docs/agents/shipping-and-hygiene.md).

## Detail index

- [docs/agents/coordination.md](./docs/agents/coordination.md) — full multi-agent protocol, swarm roles, megafiles, verification lenses
- [docs/agents/shipping-and-hygiene.md](./docs/agents/shipping-and-hygiene.md) — ship protocol, Dependabot/security/CI policy, Issues board
- [docs/agents/decision-stack.md](./docs/agents/decision-stack.md) — RAG loop, research routing, decision-stack tables
- [docs/agents/social-gates.md](./docs/agents/social-gates.md) — publish gates, campaign analytics
- [docs/agents/hermes-mobile.md](./docs/agents/hermes-mobile.md) — mobile verification contract
- [docs/agents/code-search.md](./docs/agents/code-search.md) — grepai + graphify usage
