# Hermes Economic Router

The economic router turns Hermes model/tool selection into a receipt-producing
decision instead of a hidden default. It implements the high-ROI part of the
agentic-commerce and multi-agent-pipeline research: specialized agents,
explicit budgets, proof gates, and route receipts.

It also implements the useful part of the vLLM Semantic Router micro-agent
pattern: callers can treat `hermes/auto` as one stable model alias while the
router chooses a bounded recipe behind it. The recipe is infrastructure policy,
not application glue.

The OpenRouter June 2026 update adds the same economic principle from another
angle: reduce the cost of the correct result, not just the cheapest token. Hermes
uses that as router policy for Fusion, Advisor, Subagent, and model price checks.

It does **not** move money, call wallets, publish posts, or invoke paid models.
It chooses a route and emits the gates required before a runtime wrapper should
act.

## Why Qwen Is The Default

`qwen2.5:3b-64k` is the routine local route because it is free, fast, available
through local Ollama, and proven by the Hermes YOLO smoke path. That is the
right default for low/medium-risk work: local tests, exact-marker smokes,
small code edits, and cheap diagnostics.

GLM 5.2 is still configured as a higher-reasoning option. It should win when
the task is high-risk, cross-file, architecture-heavy, or when the user is
explicitly challenging certainty. It must also pass budget and paid-provider
gates.

## Route Classes

| Route | Provider/model | Use when | Gate |
|---|---|---|---|
| `local_fast` | `custom:ollama-local-64k` / `qwen2.5:3b-64k` | routine local work, smokes, cheap diagnostics | exact marker or focused test |
| `local_coder_candidate` | local coding candidate such as Ornith | benchmark new coding models | benchmark before default |
| `glm52_reasoning` | `custom:zai-coding-glm` / `glm-5.2` | high-risk reasoning, architecture, "are you sure?" loops | paid OK, cost cap, provider smoke |
| `fugu_escalation` | OpenRouter `sakana/fugu-ultra` | rare hard multi-agent research/review | explicit approval and cost cap |
| `openrouter_fusion` | OpenRouter `openrouter/fusion` | hard grounded questions where one model may miss | explicit approval, cost cap, grounding required |
| `openrouter_advisor` | OpenRouter Advisor | cheap executor consults stronger model only when stuck | explicit approval, executor/advisor selected |
| `openrouter_subagent` | OpenRouter Subagent | delegate self-contained routine subtasks to cheaper workers | explicit approval, worker model must be cheaper |
| `mobile_e2e_gate` | local tests + Maestro | Hermes Mobile release/user proof | file ownership, unit tests, latest E2E proof |

## Command

```sh
node tools/hermes-economic-router.js \
  --task "are you sure? use GLM 5.2 for cross-file architecture debugging" \
  --risk high \
  --max-cost-usd 0.10 \
  --latency-ms 30000 \
  --paid-ok \
  --json
```

Use `--write` to append a private JSONL receipt to:

```text
~/.hermes/economic-router-receipts.jsonl
```

Receipts include:

- selected route
- `microAgentRecipe` with `modelAlias: "hermes/auto"`
- bounded recipe type: `confidence`, `ratings`, `remom`, `fusion`, `advisor`, `subagent`, or `workflow`
- hard caps for cost, latency, concurrency, and step count
- optional dry-run `executionPlan` when `--execute-plan` is passed
- OpenRouter server-tool request payloads for Fusion, Advisor, and Subagent
- `modelCatalogQuery` / `modelsApi` query evidence for the OpenRouter Models API
- `modelCatalogCandidates` from the OpenRouter June model/pricing set when a
  task asks for price, benchmarks, Advisor, Subagent, or Fusion
- rejected routes and reasons
- cost and latency estimates
- model/provider environment hints
- pipeline stages
- approval requirements
- proof gates

## Micro-Agent Recipes

| Recipe | Pattern | Use when | Guardrail |
|---|---|---|---|
| `local_confidence_escalation` | confidence | routine local work | stop on exact-marker smoke or focused test; escalate only if proof is missing |
| `architecture_fusion` | fusion | high-risk architecture, root-cause, or "are you sure?" tasks | compare cheap local pass with GLM 5.2 under `max_concurrent=2` |
| `strict_contract_remom` | remom | exact-answer, hidden-test, high-variance reasoning, or strict output-contract tasks | require two successful evidence samples, synthesize with contract repair, fall back to best valid evidence |
| `coding_candidate_ratings` | ratings | Ornith/new coding model evaluation | benchmark against local baseline before promotion |
| `rare_research_fusion` | fusion | rare approved Fugu/Sakana-style research review | explicit paid approval and cost cap |
| `openrouter_fusion_panel` | fusion | grounded hard questions with web-search/panel value | explicit approval; do not use for routine work |
| `openrouter_advisor_escalation` | advisor | cheap executor gets stuck | consult stronger advisor only on missing proof or low confidence |
| `openrouter_subagent_delegation` | subagent | routine self-contained subtasks | delegate to cheaper worker, then assemble evidence |
| `mobile_release_workflow` | workflow | Hermes Mobile release/device proof | runtime lock plus load, swap, and simulator pressure gates |
| `approval_first_workflow` | workflow | wallet, Stripe, send, post, publish, or payment surfaces | return a blocked receipt unless explicit approval exists |

These recipes deliberately preserve one client surface. The caller does not need
to build a bespoke agent graph; Hermes records the chosen recipe, roles,
fallback policy, and proof gates in the receipt.

Use `--execute-plan` for a dry-run plan:

```sh
node tools/hermes-economic-router.js \
  --task "use Advisor: cheap executor gets stuck then consult a stronger model" \
  --risk high \
  --max-cost-usd 0.10 \
  --latency-ms 30000 \
  --paid-ok \
  --execute-plan \
  --json
```

The plan remains `blocked` when an approval-gated route is selected, but it
still includes the post-approval steps, OpenRouter payload, and Models API query
so the operator can inspect cost and routing before any provider call exists.

## Policy

- Routine Hermes CLI and YOLO work stays local-first.
- Paid routes need explicit `--paid-ok` plus a cost cap.
- `hermes/auto` means "pick the smallest bounded recipe that fits the task,"
  not "run every model."
- OpenRouter Fusion, Advisor, and Subagent routes are approval-gated. The router
  may plan them, but it does not call them directly.
- Model price/catalog checks are receipt evidence. They are not a substitute for
  a live provider smoke before promotion.
- Wallet, stablecoin, Stripe, send, post, publish, and external-action tasks
  only emit an approval gate. The router never executes them.
- Ornith and other new coding models are candidates until benchmark receipts
  prove they beat the current local route.
- Mobile release claims stay separate from CLI/model routing; they route to
  the E2E verifier.
