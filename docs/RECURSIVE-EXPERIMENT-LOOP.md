# Recursive Experiment Loop

`tools/recursive-experiment-loop.js` adapts public automated-research ideas into
a Hermes operating gate. It ranks improvements only when they are experimentable,
source-backed, and guarded against fake wins.

## What It Adds

- Closed loop: proposal, implementation, experiment, validation, retained
  context, and next action.
- Tight evaluator: every selected experiment must have a runnable command or
  explicit verifier.
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
```

## High-ROI Default Experiments

- `cross_agent_sync_packet`: keeps agents aligned through source-backed sync
  packets.
- `provider_routing_benchmark`: prevents model/provider defaults from changing
  without latency, cost, context, and smoke evidence.
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
change provider defaults. Those actions still require the repo's existing
approval and evidence gates.
