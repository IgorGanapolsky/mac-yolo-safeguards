# Seed-YOLO Full Setup — Tools, Memory, Connectors, YOLO (August 2026)

**Date:** 2026-08-13  
**Status:** Live diagnosis + setup playbook for Igor's Mac  
**Related:** `tools/seed-yolo-wrapper.js`, Hermes Agent, Volcengine Ark, TRAE

---

## Executive diagnosis (why the Herdr `seed` tab looked useless)

The screenshot shows prompt `seed-2.1-pro >` and the model **claiming no filesystem access**. That is not a Seed model limitation by itself — it is a **harness / routing failure**.

| Layer | What you need | What was broken on this Mac |
|-------|---------------|-----------------------------|
| **Model** | Weights that can emit tool calls | `bytedance/seed-2.1-pro:free` in Hermes config **does not exist** on OpenRouter (2026-08-13). Real OpenRouter Seed IDs are paid (`bytedance-seed/seed-2-1-turbo`, `seed-2.0-code`, …). |
| **Harness** | Hermes Agent tool loop + `--yolo` | `seed-yolo` already wraps Hermes with toolsets, but **CLI `-z` / `--doctor` were mis-parsed** (oneshot put `-z` into the prompt → Hermes argparse error). |
| **Context** | `AGENTS.md` from cwd | Works when launched from a repo root; fails outside any repo (`doctor` reports `ready: NO`). |
| **Memory** | Hermes memory tool + vault-brain plugin | Hermes memory is **enabled** globally (`provider: vault-brain`). |
| **MCP / connectors** | Hermes MCP servers | Enabled: `browseros-neo`, `context7`. `thumbgate` present but currently **disabled** in `hermes mcp list`. |
| **Permissions / YOLO** | `--yolo` + `--accept-hooks` | Correctly passed by the wrapper when chat/oneshot actually start. |
| **Volcengine native Seed 2.1 Pro** | `ARK_API_KEY` + `custom:volcengine-seed-pro` | **No `ARK_API_KEY`** in env or Keychain. Provider block exists in `~/.hermes/config.yaml` but cannot authenticate. |

**Token economics evidence:** `bytedance/seed-2.1-pro: 6 calls (6 spin), in=0 out=0` — pure spin with zero tokens = failed model route, not a working agent.

**Core product fact (industry consensus, June–Aug 2026):** ByteDance **Seed 2.1 Pro/Turbo is a model family**, not a complete coding agent. Tools, FS, terminal, memory, MCP, and auto-approve live in the **harness** (Hermes, Claude Code, Cline, TRAE, OpenCode). Calling the API with a chat persona and no tool schemas produces exactly the “I have no filesystem” behavior in the screenshot.

Sources: [ByteDance Seed2.1 launch](https://seed.bytedance.com/en/blog/seed2-1-officially-released-advancing-ai-productivity), [Verdent Seed2.1 coding-agent guide](https://www.verdent.ai/guides/agent/seed2-1-coding-agents), [Volcengine Ark Coding/Agent Plan guide](https://codepick.dev/en/guides/ark-coding-plan-guide/), [TRAE custom agents + MCP](https://docs.trae.ai/ide/agent).

---

## Architecture: model vs full YOLO agent

```
┌─────────────────────────────────────────────────────────────┐
│  seed-yolo (launcher)                                        │
│  → Hermes Agent (--yolo --accept-hooks --toolsets …)         │
│       ├─ Project context: AGENTS.md / CLAUDE.md walk-up      │
│       ├─ Memory: MEMORY.md + vault-brain (+ optional mem0)   │
│       ├─ Skills registry (~149 enabled on this Mac)          │
│       ├─ Toolsets: terminal, file, web, code_execution, …    │
│       ├─ MCP: browseros-neo, context7, (thumbgate)           │
│       └─ LLM provider ─────────────────────────────────────┐ │
│                                                             │ │
│   A) openrouter/free          zero-cost, tool-calling free   │ │
│   B) bytedance-seed/*         paid OpenRouter Seed weights   │ │
│   C) doubao-seed-2.1-pro      Volcengine Ark (needs ARK key) │ │
│   D) ollama local             offline zero-cost              │ │
└─────────────────────────────────────────────────────────────┘
```

If you only change the **model** without Hermes toolsets, you still get a chatbot.  
If you only run Hermes tools with a model that **cannot tool-call**, you get spin / empty tool use.

---

## Recommended setup on this Mac (three tiers)

### Tier 1 — Working full YOLO **today** (zero-cost, Hermes harness)

This is what `seed-yolo` is designed for after the 3.1 fix:

```bash
cd /path/to/repo-with-AGENTS.md   # required for context injection
seed-yolo doctor --json           # ready must be true
seed-yolo                         # interactive YOLO chat
# or
seed-yolo -z "List package.json name using the file tool"
```

**Defaults:**

| Knob | Value |
|------|--------|
| Provider | `openrouter` |
| Model | `openrouter/free` (auto free tool-capable model; receipt shows real id) |
| Toolsets | `terminal,file,web,code_execution,clarify,skills,memory` |
| YOLO | `--yolo` + `--accept-hooks` always on |
| Memory | Hermes built-in + vault-brain |
| MCP | whatever Hermes has enabled globally |

**Full tool surface:**

```bash
SEED_YOLO_FULL_TOOLS=1 seed-yolo
# adds browser, computer_use, delegation, todo, session_search
```

**Doctor (live 2026-08-13):**

- runtime: `~/.local/bin/hermes` present  
- skills: **149 enabled**  
- context: repo `AGENTS.md` when cwd is inside the project  
- toolsets: all default sets probe as enabled  

**Herdr seed tab:** start with **`seed-yolo`**, not a raw model switch to `seed-2.1-pro`. You should see the banner:

```text
[seed-yolo] real Hermes agent runtime
[seed-yolo] route=openrouter/openrouter/free ...
[seed-yolo] tools=terminal,file,web,...
[seed-yolo] yolo=on
```

If the prompt is only `seed-2.1-pro >` with no banner, you are **not** on the full launcher.

---

### Tier 2 — Real ByteDance Seed weights via **OpenRouter** (paid)

OpenRouter Seed catalog as of 2026-08-13 (none of these are free):

| Model ID | Notes |
|----------|--------|
| `bytedance-seed/seed-2-1-turbo` | Seed 2.1 Turbo, 262k ctx, tool-capable |
| `bytedance-seed/seed-2.0-code` | Coding-focused Seed 2.0 |
| `bytedance-seed/seed-2.0-lite` / `seed-2.0-mini` | Smaller / cheaper |

```bash
export OPENROUTER_API_KEY=...   # already used by Hermes status on this Mac
SEED_YOLO_PROVIDER=openrouter \
SEED_YOLO_MODEL=bytedance-seed/seed-2-1-turbo \
SEED_YOLO_ALLOW_METERED=1 \
SEED_YOLO_FULL_TOOLS=1 \
seed-yolo
```

**Fix Hermes config myth:**  
`~/.hermes/config.yaml` provider `openrouter-seed-pro` currently points at  
`bytedance/seed-2.1-pro:free` — **that model id is not on OpenRouter**. Update it to a real id (e.g. `bytedance-seed/seed-2-1-turbo`) or stop using that custom provider block.

---

### Tier 3 — Official **Volcengine Doubao Seed 2.1 Pro** (China Ark)

Hermes already has:

```yaml
volcengine-seed-pro:
  api: https://ark.cn-beijing.volces.com/api/v3
  key_env: ARK_API_KEY
  model: doubao-seed-2.1-pro
  context_length: 262144
```

**Missing piece:** store `ARK_API_KEY` (macOS Keychain + Hermes env), never in git.

Volcengine product split (2026):

| Plan | Use when | Endpoint family |
|------|----------|-----------------|
| **Coding Plan** | Cline / Claude Code / OpenCode / Hermes text coding | `/api/coding/v3` (OpenAI) or `/api/coding` (Anthropic-compat) |
| **Agent Plan** | Multimodal + harness extras (search, agent memory, Supabase) | `/api/plan/v3` or `/api/plan` |

Do **not** mix Coding Plan keys with Agent Plan base URLs (official failure mode).

```bash
# After ARK_API_KEY is installed for Hermes:
SEED_YOLO_PROVIDER=custom:volcengine-seed-pro \
SEED_YOLO_MODEL=doubao-seed-2.1-pro \
SEED_YOLO_ALLOW_METERED=1 \
SEED_YOLO_FULL_TOOLS=1 \
seed-yolo
```

Compatible clients documented for Ark (2026): Claude Code, OpenCode, Hermes Agent, TRAE, Cline, Codex CLI.

---

## Permissions, connectors, memory — concrete map

### YOLO / permissions

| Mechanism | Where | Effect |
|-----------|--------|--------|
| `--yolo` | seed-yolo → hermes | Auto-approve tool execution |
| `--accept-hooks` | seed-yolo → hermes | Accept project/session hooks |
| `--safe-mode` | opt-in only | Opposite of YOLO — avoid for "full YOLO" |
| Hermes `approvals` | `hermes approvals` | Policy store; YOLO bypasses interactive prompts |

### Tools (Hermes toolsets)

Default seed-yolo set (always on):

- `terminal` — shell  
- `file` — read/write/list  
- `web` — search/scrape  
- `code_execution` — sandboxed code  
- `skills` — skill registry  
- `memory` — durable memory tool  
- `clarify` — clarifying questions  

Optional (`SEED_YOLO_FULL_TOOLS=1`):

- `browser`, `computer_use`, `delegation`, `todo`, `session_search`

Enable/disable globally: `hermes tools list` / `hermes tools enable <name>`.

### MCP connectors

```bash
hermes mcp list
# browseros-neo  http://127.0.0.1:9210/mcp   enabled
# context7       https://mcp.context7.com/mcp enabled
# thumbgate      (local)                     disabled  ← enable if needed
```

Config lives under `mcp_servers:` in `~/.hermes/config.yaml`.  
`inherit_mcp_toolsets: true` is set — chat sessions inherit MCP tools.

### Memory

```bash
hermes memory status
# Memory injection: enabled
# User profile: enabled
# Memory tool: enabled
# Active plugin: vault-brain
```

Optional plugins installed: mem0, openviking, hindsight, byterover, retaindb, supermemory, holographic, honcho.

Volcengine **Agent Plan** also advertises first-party “Agent memory” as a cloud harness feature — separate from Hermes vault-brain; only relevant if you route through Agent Plan endpoints.

### Project context

- Walk-up from cwd for `AGENTS.md` (Hermes also respects its own project rules).  
- `seed-yolo doctor` **fails closed** if no `AGENTS.md` is reachable — intentional.  
- Always start seed-yolo from the target repo root (or a child path that walks up to `AGENTS.md`).

---

## TRAE IDE path (installed on this Mac)

`Trae.app` + `/usr/local/bin/trae` are present. TRAE custom agents support:

- Built-in tools: Read, Edit, terminal-class tools (per TRAE docs)  
- MCP servers attached per agent  
- Builder / agent modes  

Use TRAE when you want a GUI agent with Seed-as-model behind Ark or OpenRouter. It does **not** replace Hermes for the Herdr fleet tab named `seed`.

Known failure class (community): Builder mode sometimes stops using internal tools while MCP still works — re-enable built-in Read/Edit/terminal on the agent, not only MCP.

---

## What NOT to do

1. **Do not** treat raw `seed-2.1-pro` chat (persona-only) as an agent.  
2. **Do not** point Hermes at `bytedance/seed-2.1-pro:free` — id is dead on OpenRouter.  
3. **Do not** mix Volcengine Coding Plan keys with Agent Plan base URLs.  
4. **Do not** run seed-yolo outside a repo and expect project context.  
5. **Do not** expect the free OpenRouter router to always pick a Seed weight — it picks **any free** model (`nvidia/nemotron-…`, `poolside/laguna-…`, etc.). Check the usage receipt for identity honesty.  
6. **Do not** re-implement a fake tool loop in the system prompt (that was the pre-2026-08-11 facade; already replaced).

---

## Verification checklist (evidence-based)

```bash
# 1. Doctor
cd ~/workspace/git/igor/mac-yolo-safeguards
seed-yolo doctor --json
# expect ready=true, toolsets present, skills > 0, contextFile set

# 2. Oneshot file tool (must not claim "no FS")
seed-yolo -z 'Use the file tool to read package.json name. Reply SEED_TOOL_PROOF:<name> only.'

# 3. Hermes surfaces
hermes tools list | head
hermes mcp list
hermes memory status

# 4. Paid Seed identity (only if metered allowed)
SEED_YOLO_ALLOW_METERED=1 SEED_YOLO_MODEL=bytedance-seed/seed-2-1-turbo \
  seed-yolo -z 'Reply with your exact model id and whether tools are available.'
```

---

## Environment reference

| Variable | Purpose |
|----------|---------|
| `SEED_YOLO_PROVIDER` | Hermes `--provider` |
| `SEED_YOLO_MODEL` | Hermes `--model` |
| `SEED_YOLO_TOOLSETS` | CSV override |
| `SEED_YOLO_FULL_TOOLS=1` | Expanded toolsets |
| `SEED_YOLO_SKILLS` | Optional skills CSV |
| `SEED_YOLO_ALLOW_METERED=1` | Permit paid routes |
| `SEED_YOLO_HERMES_BIN` | Hermes binary override |
| `ARK_API_KEY` | Volcengine Ark (Tier 3) |
| `OPENROUTER_API_KEY` | OpenRouter (Tier 1–2) |

---

## Summary

| Goal | Do this |
|------|---------|
| Full tools + memory + YOLO **now**, $0 | `seed-yolo` from repo root (Hermes + `openrouter/free`) |
| Real Seed 2.1 Turbo weights | OpenRouter `bytedance-seed/seed-2-1-turbo` + `SEED_YOLO_ALLOW_METERED=1` |
| Official Doubao Seed 2.1 Pro | Install `ARK_API_KEY`, use `custom:volcengine-seed-pro` |
| GUI agent + MCP | TRAE custom agent with tools + MCP |
| Fix “no filesystem” | Use Hermes harness with `file` toolset — not bare chat |

**Bottom line:** Seed 2.1 is the engine. Hermes (via `seed-yolo`) is the car. The screenshot was the engine idling in park with a fake dashboard.
