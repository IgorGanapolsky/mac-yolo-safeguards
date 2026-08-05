# OpenRouter July recap → free high-ROI steals (no OpenRouter auto burn)

**Source:** OpenRouter Gmail *July recap: five benchmarks, evals, and Auto Router* (2026-08-04).

**Policy:** Never default to `openrouter/auto` or `openrouter/auto-beta`. Never agent-spend. Flat-rate / free / local LiteLLM only unless the operator pins env.

## How it helps us

| OpenRouter idea | Steal | Module |
|-----------------|-------|--------|
| Auto Router task types + 7d spend | Local task-type classify + spend priors over **our** pool | `tools/hermes-yolo-auto-router.js` |
| `cost_quality_tradeoff` | `cheap` \| `balanced` \| `quality` re-rank | wired into `hermes-yolo-route-policy.js` |
| Turn budget > brand model | `turnBudget` on every route + offline curve | `--eval-turns`, route receipts |
| Cost ≠ quality | Efficiency winner on multi-setup board | `evaluateHarnessBoard` |
| Ori Eval (own work) | Already: Node gates + harness-smeval | `docs/DECISIONS/D-2026-08-03-eval-architecture.md` |
| Classifiers / agent spend spikes | Tag agent + task_type on receipts | `tools/hermes-spend-classifier.js` |

## Commands

```bash
# Auto-router (local)
node tools/hermes-yolo-auto-router.js --task "fix pair USB" --tradeoff balanced --json
node tools/hermes-yolo-auto-router.js --eval-turns --json
node tools/hermes-yolo-auto-router.js --board --task "implement login" --json

# Route policy (enriched)
node tools/hermes-yolo-route-policy.js --task "implement login" --json
node tools/hermes-yolo-route-policy.js --task "implement login" --tradeoff cheap --json

# Spend classifiers
node tools/hermes-spend-classifier.js --task "smoke" --agent grok --record --json
node tools/hermes-spend-classifier.js --aggregate --json

# Tests
node tests/test-hermes-yolo-auto-router.js
node tests/test-hermes-spend-classifier.js
node tests/test-hermes-yolo-route-policy.js
```

## Env

| Env | Effect |
|-----|--------|
| `HERMES_COST_QUALITY` / `--tradeoff` | `cheap` \| `balanced` \| `quality` |
| `HERMES_TURN_BUDGET` | Pin max agent turns |
| `HERMES_AGENT_ID` | Spend tag agent |
| `HERMES_SPEND_PRIORS` | JSON override of local model weights |

## Live wrapper wiring (2026-08-05)

`hermes-yolo-wrapper.js` now:

1. Classifies task via route-policy / auto-router before SuperGrok selection
2. **Smoke / classify / draft / routine / cheap** → `hermes-legacy` (not SuperGrok plan quota)
3. Coding / plan with SuperGrok ready → still SuperGrok
4. Legacy spawn applies policy `model` + stamps `HERMES_TURN_BUDGET` / `HERMES_TASK_TYPE`
5. Optional spend receipt: `HERMES_SPEND_CLASSIFIER=1`
6. Never emits `openrouter/auto`

```bash
# Proof: smoke demotes SuperGrok
node -e "const {classifyBackend}=require('./hermes-yolo-wrapper'); console.log(classifyBackend(['Reply with exactly HERMES-YOLO-READY'],{HERMES_YOLO_ROUTE_POLICY:'1'},{grokReady:true}))"
```

## Deliberately skipped

- Paid OpenRouter Batch API / Activity SaaS
- Defaulting interactive yolo to community auto-router
- Treating public HLE/BrowseComp scores as ship proof
