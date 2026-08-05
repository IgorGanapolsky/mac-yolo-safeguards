# SKILLS Registry

> **Purpose:** Single source of truth for every agent capability in this repo.
> Each entry maps a skill to: what triggers it, where its definition lives, its
> version, its health-check command, and its blast radius.
>
> This file is **tested** — see `tests/test-session-context.js` (registry
> validation suite). A stale or broken entry fails the build.

## Skill Index

| Skill | Trigger | Definition | Version | Health Check | Blast Radius |
|-------|---------|------------|---------|--------------|--------------|
| `agent-session-start` | Start of every agent session | `tools/agent-session-start.js` | 1.0 | `node tools/agent-session-start.js --json` exits 0 | Repo-wide |
| `agent-decision-stack` | Before non-trivial decisions or ship claims | `tools/agent-decision-stack.js` | 1.0 | `node -e "require('./tools/agent-decision-stack')"` | Repo-wide |
| `mac-freeze-rescue` | Mac sluggish / fans / load | `~/.claude/skills/mac-freeze-rescue/SKILL.md` | 1.2 | `bash scripts/heal-launchd-paths.sh` | Local Mac |
| `multi-agent-coordination` | Any change touching shared files | `docs/agents/coordination.md` + `plan.md` | 1.0 | `node tests/test-agent-swarm-harness.js` | Repo-wide |
| `hermes-mobile-connect` | Phone ↔ Mac pairing help | `hermes-mobile/.cursor/skills/hermes-mobile-connect/SKILL.md` | 1.0 | `curl -sf -m 3 http://127.0.0.1:8642/health` | Mobile + Mac |
| `social-publish-gate` | Before any Post/Publish | `tools/social-publish-gate.js` | 1.3 | `node tests/test-social-publish-gate.js` | Public channels |
| `verify-public-post` | After publishing | `tools/verify-public-post.js` | 1.0 | `node tests/test-verify-public-post.js` | Public channels |
| `fleet-repo-intelligence` | Code search / exploration | `tools/fleet-repo-intelligence-status.js` | 1.0 | `node tools/check-rag-health.js` | Repo-wide |
| `inference-gateway` | Model call observability | `tools/hermes-inference-gateway.js` | 1.0 | `node tests/test-hermes-inference-gateway.js` | Inference |
| `session-handoff` | End of session / agent transfer | `tools/hermes-mobile-session-handoff.js` | 1.0 | `node -e "require('./tools/hermes-mobile-session-handoff')"` | Mobile continuity |
| `tinker-brain` | GTM / revenue / positioning | `tools/tinker-brain/tinker_brain_answer.py` | 1.1 | `python3 tools/tinker-brain/tinker_brain_answer.py --card config/THUMBGATE_EXPERT_CARD.txt --question "ping"` | Revenue |
| `ota-gate` | Before production EAS Update | `hermes-mobile/scripts/require-fresh-user-ota-gate.sh` | 1.4 | `npm run ota:gate` exits 0 | Mobile OTA |
| `ship-guard` | Before claim "fixed/shipped" | `hermes-mobile/.maestro/ship-guard.yaml` | 1.0 | `npm run e2e:ship-guard` | Mobile E2E |

## How to Use

### For agents
1. At session start, read this registry. Run the health check for your skill.
2. Before acting, check if any listed skill is the right entry point for your task.
3. If your task doesn't match a listed skill, create one and register it here.

### For the context engineering team
- **Adding a skill:** Append to the table, add a `tests/test-<name>.js` or
  verify its health check command works, and reference this file from AGENTS.md.
- **Versioning:** Bump the `Version` column when the skill's behavior changes.
  Add a changelog entry at the bottom of the skill's definition file.
- **Health checks:** Each must be runnable in CI without interactive auth.
  Use `--json` flags where available.

## Skill Resolution Flow

```
User query → agent-loop (bin/agent-loop) → match trigger keyword → run skill health check → act → verify → capture learning
```

The `bin/agent-loop` script reads this registry at startup and presents
the relevant skills for the current context (E2E status, plan claims,
RAG health).
