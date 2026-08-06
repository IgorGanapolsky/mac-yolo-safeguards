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

**Sub-agent delegation:** state the stop condition literally in the prompt ("open a PR, do NOT merge") and require proof, not completion claims. Detail: [docs/agents/coordination.md](./docs/agents/coordination.md).

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

## No dead code, no speculative scaffolding

- Don't add features, abstractions, error handling, or tests for scenarios that can't happen.
- Don't write hooks, configs, or CI workflows speculatively — wire them only on a concrete trigger.
- Three similar lines beats a premature abstraction. Don't bundle unrequested refactors.

## Learning, research & decisions

- **RAG loop:** `mcp__thumbgate__recall` at session start; capture every fix/incident with concrete artifacts (dates, PIDs, paths, metrics). Recurring bug class → deterministic check in `tools/` wired into CI.
- **Research:** `parallel-cli search` by default; deep research only on explicit request, never fire-and-forget.
- **Decision stack:** before non-trivial decisions or ship claims run the evidence stack (`tools/agent-session-start.js`, `tools/agent-decision-stack.js`, graphify, revenue DS). If RAG returns a matching MISTAKE → change the plan.
- **Coding context pack (issue-first):** before multi-file product coding, load `node tools/coding-context-pack.js` (auto on session-start as `--minimal`). FOCUS open GH Issue + Linear map + e2e gate + skills. Sync buses: `--sync`. Ship claim gate: `--ship-check --pr N --agent AGENT-X`. Skill: `/coding-context-pack`. Workflow: `/coding-context-loop`.

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
- **Merge only when required checks are green** (`strict: true` on main); prefer `gh pr merge --auto --squash`. In CI queue backlogs, auto-merge handles sequential merging as checks clear.
- **In high-activity repos, `gh pr list -L 100`** avoids missing PRs beyond the default 30-item page. Flag CONFLICTING PRs to their owning agent — do not resolve another agent's conflicts.
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

## Context Engineering (HuggingFace Course)

This repo implements the [HuggingFace Context Course](https://huggingface.co/learn/context-course/unit0/introduction) concepts:

| Concept | Entry point |
|---------|-------------|
| **Agent loop** (Unit 6) | `bin/agent-loop` — Recollect→Plan→Observe→Act→Evaluate→Learn with metrics |
| **Skill registry** (Unit 1) | `SKILLS.md` — every skill: trigger, path, version, health check |
| **Context-layer tests** (Unit 5) | `node tests/test-session-context.js` — validates hooks, MCP, skills, RAG |
| **Publish gate plugin** (Unit 3) | `bin/verify-social-post` — wraps `social-publish-gate.js` + `verify-public-post.js` |
| **Sub-agent handoff** (Unit 4) | `scripts/handoff.sh` — transfers session state between agents |

**Session start:** run `bin/agent-loop` (validates context layer + plan + E2E before acting) or `bin/agent-loop --health --json` for CI. Full architecture: [docs/agents/context-engineering.md](./docs/agents/context-engineering.md).

## Code search

Use `grepai search "<intent>" --json --compact` as the primary code-exploration tool (fallback to Grep/Glob on exact strings or if grepai is down). Use `.graphify-venv/bin/graphify query` for architecture/causality questions when `graphify-out/graph.json` exists. Full usage: [docs/agents/code-search.md](./docs/agents/code-search.md).

## Public GitHub Issues

Issues = public-safe product intake only (incident reports, hardening inquiries, product bugs). Never internal backlog, agent coordination, secrets, or customer names. Detail: [docs/agents/shipping-and-hygiene.md](./docs/agents/shipping-and-hygiene.md).


## Code scanning hygiene (2026-08, permanent)

Security → Code scanning is **`branch:main` only**. Unmerged PR fixes do not clear it.

| NEVER | ALWAYS |
|-------|--------|
| Claim "security clean" / "0 open alerts" without live API | `node tools/codeql-agent-hygiene.js --claim "…"` |
| Re-implement ASC JWT / host `.includes` / naive script strip / shell `execSync(\`…\`)` | Helpers under `tools/lib/` + pattern gate |
| Parallel CodeQL burn-down while one PR is open | Finish/merge existing; session brief shows open count |

Session start prints open count. Detail: [docs/agents/codeql-orchestration.md](./docs/agents/codeql-orchestration.md).

## Detail index

- [docs/agents/coordination.md](./docs/agents/coordination.md) — full multi-agent protocol, swarm roles, megafiles, verification lenses
- [docs/agents/shipping-and-hygiene.md](./docs/agents/shipping-and-hygiene.md) — ship protocol, Dependabot/security/CI policy, Issues board
- [docs/agents/decision-stack.md](./docs/agents/decision-stack.md) — RAG loop, research routing, decision-stack tables
- [docs/agents/social-gates.md](./docs/agents/social-gates.md) — publish gates, campaign analytics
- [docs/agents/hermes-mobile.md](./docs/agents/hermes-mobile.md) — mobile verification contract
- [docs/agents/code-search.md](./docs/agents/code-search.md) — grepai + graphify usage
- [docs/agents/context-engineering.md](./docs/agents/context-engineering.md) — HF Context Course mapping, KV-cache optimization, PreToolUse safety gates
