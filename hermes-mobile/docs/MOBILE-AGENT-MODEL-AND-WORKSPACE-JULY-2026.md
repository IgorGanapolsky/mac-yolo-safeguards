# Mobile agent model + workspace policy (July 2026)

**Status:** live on MacBook Pro gateway as of 2026-07-15.  
**Incident:** Phone chat showed project lane `mac-yolo-safeguards` but the agent kept pivoting to Skool while routed to **Qwen3.5 9B Hermes** (~24k input tokens).

## Research verdict (July 2026)

> Parallel deep-research CLI was unreachable from this host (DNS/proxy 403). Verdict below is grounded in July 2026 secondary sources cited inline, plus live Hermes fleet evidence.

| Topic | Industry practice | Our policy |
|-------|-------------------|------------|
| Workspace / cwd binding | Claude Code / Cursor isolate edits via worktrees + cwd-rooted `CLAUDE.md` / `.cursor/rules`; agents that only get a soft prompt still wander ([Claude Code worktrees](https://code.claude.com/docs/en/worktrees), [AgentPatterns lazy isolation](https://agentpatterns.ai/workflows/lazy-worktree-isolation/), [AGENTS.md / rules hierarchy 2026](https://www.bestaiweb.ai/how-to-engineer-code-context-with-claude-md-cursorrules-and-agents-md-in-2026/)). | **Hard stack:** (1) `terminal.cwd` = active product repo, (2) mobile `system_prompt` HARD CONSTRAINT with workspace path, (3) MEMORY must not hardcode a competing "canonical" repo. UI project lane alone is insufficient. |
| Local SLM vs cloud | Hybrid is optimal: local 7–9B for autocomplete / cheap workers; frontier / coding-plan cloud for multi-file agent loops. SWE-bench-style gaps remain 15–20+ points for small locals ([fp8.co 2026 local vs cloud](https://fp8.co/articles/Local-AI-Coding-Agents-Small-Models-vs-Cloud-Comparison), [jamesm.blog 2026](https://jamesm.blog/ai/local-vs-cloud-ai-2026/), [Tom Ron Feb 2026](https://medium.com/@rontom/the-state-of-coding-agents-using-local-llms-february-2026-83259140e6ec)). | **Phone / api_server default = `glm-coding` via LiteLLM `:4010`** (same quality stack as `hermes-yolo-route`). Local Qwen is **fallback only**, never the product default. |
| Poisoned long threads | Long sessions accumulate conflicting goals; industry guidance is new session / worktree rather than "try harder" in the same context. Hermes already refuses mega sessions near 500k input. | Force **Start fresh** when input ≥ **20k** tokens on phone UX, and never resume hard-blocked mega sessions. |
| System prompt / tools | Prompt-only isolation fails when tools inherit a global cwd or memory. | Pin cwd in gateway config + reinforce in mobile system prompt every turn. |
| Model picker UX | Users need honest model identity, not gateway alias `hermes-agent`. | Header shows live LLM id; **warn** when a weak local SLM is active. |
| Agentic RAG bleed | Cross-project memory without scoping causes topic hijack. | MEMORY entries must treat project as **dynamic** (mobile lane + cwd). Skool remains Telegram-lane only. |

**Verdict on local 9B for product coding:** unfit as the default phone brain. Fine as offline/zero-spend worker. Real-user Hermes Mobile ships on cloud coding models.

## Root cause of the 2026-07-15 Skool drift

1. **Empty `model.default`** → Hermes resolved a local Ollama worker (`qwen3.5:9b-hermes-64k`).
2. **`terminal.cwd` pinned to `skool_top1percent`** → tools literally ran in Skool.
3. **`MEMORY.md` "Canonical project: skool_top1percent"** → RAG/memory overrode the UI project lane.
4. **24k+ input tokens** on a weak model → prior Skool/Telegram context dominated attention.

Evidence: agent log `api_1784135134_*` used `qwen3.5:9b-hermes-64k` with `in=24282`; after fix, `api_1784135567_*` used `glm-coding` at `:4010` and `pwd` = `mac-yolo-safeguards`.

## Operator policy (do not regress)

| Surface | Setting |
|---------|---------|
| Default model | `model.provider: custom:litellm-gateway`, `model.default: glm-coding` |
| Fallback | `fallback_model` may stay on local Qwen for outages only |
| Default cwd | `terminal.cwd: …/mac-yolo-safeguards` (or the user's chosen project — never a stale Skool pin for product work) |
| Phone UX | Project lane → system prompt HARD CONSTRAINT; weak-model + huge-context warnings in chat header |
| Fresh chat | Required after model switch or when context ≥ 20k / mega-session BLOCK |

## Commands agents run (never hand to Igor)

```bash
hermes config set model.provider custom:litellm-gateway
hermes config set model.default glm-coding
hermes config set terminal.cwd /Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards
launchctl kickstart -k "gui/$(id -u)/ai.hermes.gateway"
node tools/hermes-mobile-pair.js
```

## Related code

- `src/utils/workspacePrompt.ts` — HARD CONSTRAINT prompt
- `src/utils/weakLocalModel.ts` — weak SLM + 20k poison heuristics
- `src/components/ChatScreenHeader.tsx` — warning banners
- Gateway: `~/.hermes/config.yaml`, `~/.hermes/memories/MEMORY.md`
