# Recursive Experiment Loop

`tools/recursive-experiment-loop.js` adapts public automated-research ideas into
a Hermes operating gate. It ranks improvements only when they are experimentable,
source-backed, and guarded against fake wins.

## What It Adds

- Closed loop: proposal, implementation, experiment, validation, retained
  context, and next action.
- Tight evaluator: every selected experiment must have a runnable command or
  explicit verifier.
- Adoption ledger: improvements are recorded as `adopt`, `retry`, or `reject`
  from before/after metrics plus evaluator, reward-hack, and variance gates.
- Agent Arena-style token efficiency: candidate model runs are scored by
  verified task improvement per 1k output tokens, with penalties for tool
  hallucinations, bash recovery failures, latency, cost, and evaluator failure.
- Context retention: every loop names the state or lesson artifact that survives
  interruptions.
- Branch combination: promising ideas need a combine test before becoming a
  default.
- Reward-hack validation: metrics must not be shortcut by optimizing the wrong
  proxy.
- Variance validation: noisy outcomes need repeat runs, cohorts, or before/after
  windows.

## Usage

```bash
node tools/recursive-experiment-loop.js plan
node tools/recursive-experiment-loop.js plan --json --task "sync all agents"
node tools/recursive-experiment-loop.js validate --json
node tools/recursive-experiment-loop.js validate --file experiments.json
node tools/recursive-experiment-loop.js record \
  --experiment cross_agent_sync_packet \
  --before 1 \
  --after 3 \
  --evaluator pass \
  --reward-hack pass \
  --variance pass \
  --evidence "tests and sync packet diff verified" \
  --json
node tools/recursive-experiment-loop.js ledger --json
node tools/recursive-experiment-loop.js efficiency \
  --before 40 \
  --after 64 \
  --input-tokens 2000 \
  --output-tokens 800 \
  --tool-hallucinations 0 \
  --bash-recovery-failures 0 \
  --evaluator pass \
  --json
```

The default ledger path is `~/.hermes/recursive-experiment-ledger.jsonl` so
experiment outcomes persist across sessions without writing private operating
state into the repo.

## Adoption Rules

| Decision | Meaning |
| --- | --- |
| `adopt` | The evaluator passed, reward-hack check passed, variance check passed, and the metric improved beyond `--min-delta`. Hermes may keep the change. |
| `retry` | The metric improved but a required evidence gate is missing. Run the experiment again with complete evidence before changing defaults. |
| `reject` | The evaluator failed, reward-hack check failed, variance failed, or the metric did not improve. Do not promote the change. |

This is the important Recursive-style upgrade: Hermes must not accept its own
claim that a loop got smarter. It needs a before/after metric and independent
verification.

## Token Efficiency Gate

The `efficiency` command turns Agent Arena-style ranking into a local Hermes
routing rule. It answers: "Did this model produce verified task improvement
cheaply enough to earn cheap/local/default routing?"

The score is:

```text
verified task improvement per 1k output tokens
- tool hallucination penalty
- bash recovery failure penalty
- latency penalty
- cost penalty
- evaluator failure penalty
```

Routes:

| Route | Meaning |
| --- | --- |
| `cheap_or_local_candidate` | Efficient, evaluator-passing run. Candidate for North Mini, local GLM/Gemma/Ollama, or another cheaper route. |
| `expensive_model_allowed` | Not efficient enough to promote downward, but not disqualified. Keep frontier/Codex/Claude/GPT available. |
| `do_not_promote` | Evaluator failed, evidence missing, or penalties dominated. Do not use this run to change routing. |

This directly attacks Igor's token-burn problem: small jobs need measured cheap
routes, not expensive default models. It also prevents fake savings from
choosing a cheap model that hallucinates tools or cannot recover from shell
errors.

## High-ROI Default Experiments

- `cross_agent_sync_packet`: keeps agents aligned through source-backed sync
  packets.
- `provider_routing_benchmark`: prevents model/provider defaults from changing
  without latency, cost, context, and smoke evidence.
- `arena_token_efficiency_benchmark`: measures task improvement per output
  token and blocks cheap-route promotion when tool or shell reliability regresses.
- `rag_source_grounding_eval`: requires graph/source-pack evidence before broad
  architecture claims.
- `freeze_guard_feedback_loop`: turns Mac freeze incidents into safe guard
  experiments without killing unknown user-facing processes.
- `checkout_recovery_experiment`: separates abandoned checkout value from real
  Stripe revenue and keeps sends approval-gated.
- `mobile_e2e_portability`: makes Hermes Mobile proof reproducible across
  machines and realistic network paths.

## Boundaries

This tool plans and validates local experiments. It does not send customer
messages, mutate Stripe, merge PRs, kill processes, deploy, train models, or
change provider defaults. Recording an `adopt` decision means "safe to keep the
local improvement," not "safe to perform consequential external actions." Those
actions still require the repo's existing approval and evidence gates.
