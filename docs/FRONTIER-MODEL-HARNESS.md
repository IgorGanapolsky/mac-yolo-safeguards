# Frontier-model harness patterns (Fable 5 / GPT 5.6 Sol → this repo)

Maps public guidance from [How to Get the Most Out of Fable 5 and GPT 5.6 Sol](https://www.youtube.com/watch?v=69JMFDFuI3A) onto **mac-yolo-safeguards / Hermes** harness tools. Not a second rule bible — each idea has **one** owner artifact.

## Commands

```bash
node tools/agent-swarm-harness.js                    # full brief + SessionContract + effort table
node tools/agent-swarm-harness.js session-contract   # boundaries once
node tools/agent-swarm-harness.js effort-policy      # task class → effort
node tools/openrouter-reasoning-plan.js --effort medium --json
```

Default reasoning effort (when `HERMES_REASONING_EFFORT` unset): **medium** (step-down from max). Use `--effort high` or `xhigh` only for hard design / ship claims.

## Pattern → owner

| Video pattern | Owner in this repo |
|---------------|--------------------|
| Explicit boundaries | `sessionContract()` in `tools/agent-swarm-harness.js`; AGENTS.md Never-list; plan claims |
| One copy of each rule | AGENTS.md + skills; worker prompts = AC + files + verify only |
| Keep/drop (not blanket brevity) | `sessionContract.keep` / `.drop` |
| Concrete behavior vs tone words | Leaf AcceptanceCheck wording |
| Effort step-down | `effortPolicy()` + `openrouter-reasoning-plan.js` + `docs/HERMES-ECONOMIC-ROUTER.md` |
| Voice / unstructured dump | Planner extracts AC; workers get leaves only |
| Automate optics | Harness matrix, continuous E2E `latest.json`, promo LIVE matrix, pipeline DS — not essay status |
| Blind-spot / unknowns | Planner role: 3 unknowns before locking AC |
| Hard bar + loops | `hardBarForDone()` + stacked verification + thrash STOP |
| Where memory lives (stateless vs stateful) | `stateLayerPolicy()` + `whereIsStateCheck()` — chat→session store; ownership→plan.md; resume→loop/E2E/Field Guide |
| Auth on toolbox not agent (Foundry) | `toolboxPolicy()` + `whereIsAuthCheck()` + `workerToolboxPrompt()` — packs × auth × host × gates |

## State layers (Pro + mini)

Do not max context by replaying chat across Macs. Match store to surface:

- **Stateless:** LiteLLM / Ollama calls, worker leaf payloads (AC + files + verify).
- **Session-stateful:** Hermes Mobile / web chat (`session_id` + gateway).
- **Shared-stateful:** `plan.md` claims, `hermes-loop-state`, Field Guide, RAG.

```bash
node tools/agent-swarm-harness.js state-layers
node tools/agent-swarm-harness.js where-is-state --json
```

Env: `HERMES_FLEET_HOST_ROLE=mac_pro|mac_mini` when hostname detection is wrong.

## Toolboxes (auth boundary)

Bind identity to the pack; inject **entrypoints only** into workers:

```bash
node tools/agent-swarm-harness.js toolboxes
node tools/agent-swarm-harness.js where-is-auth --task "Stripe cash close"
node tools/agent-swarm-harness.js worker-toolbox --task "implement leaf plan.md claim"
```

Gates: `HERMES_SESSION_PUBLISH=PUBLISH_APPROVED`, `HERMES_ALLOW_INTERACTIVE_CHROME=1` (interactive Chrome only with explicit user ask). Optional task text: `HERMES_TASK_TEXT` or `--task`.

## Doctor / eval / SRE (remaining high-ROI)

```bash
node tools/agent-swarm-harness.js doctor --json
node tools/agent-swarm-harness.js eval-abilities
node tools/agent-swarm-harness.js propose-eval --task "empty stream stuck Checking"
node tools/agent-swarm-harness.js sre-act --subsystem litellm --health-age-ms 5000
node tools/revenue-local-draft.js --label acme --offer diagnostic --template --json
```

## SessionContract (env overrides)

| Env | Meaning |
|-----|---------|
| `HERMES_SESSION_WRITE_SCOPE` | Default: claimed files only |
| `HERMES_SESSION_PUBLISH` | `DRAFT_ONLY` vs `PUBLISH_APPROVED` |
| `HERMES_SESSION_SEND` | Outbound send policy |
| `HERMES_REASONING_EFFORT` | `none`…`xhigh` dial |
| `HERMES_SESSION_STOP_WHEN` | Objective stop condition |

## Done bar (examples)

- `node tests/test-….js` exits 0  
- typecheck when TS touched  
- continuous E2E `e2e=pass` or honest skip  
- social LIVE only with verified URL + CTA  
- revenue `paid` only with Stripe/ledger proof  

Adjective-only bars (“high quality”) are invalid AC language.

## Related

- [docs/AGENT-SWARM-HARNESS.md](./AGENT-SWARM-HARNESS.md)
- [docs/HERMES-ECONOMIC-ROUTER.md](./HERMES-ECONOMIC-ROUTER.md)
- [docs/SDD-SPECIFICATION-DRIVEN-DESIGN.md](./SDD-SPECIFICATION-DRIVEN-DESIGN.md)
- [AGENTS.md](../AGENTS.md)
