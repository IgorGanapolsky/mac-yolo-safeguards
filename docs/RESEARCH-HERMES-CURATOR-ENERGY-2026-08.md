# Hermes Curator: cost, safety, and value gate

Research run: `trun_18f41c41d5474492bc2f63351ff01153`  
Completed: 2026-08-02  
Raw evidence: `parallel-research/hermes-curator-energy-2026-08.json`

## Decision

Keep Curator enabled in **prune-only** mode and keep LLM consolidation disabled.

This is not a claim that Curator universally wastes energy. The defensible finding is narrower:

- Hermes documents deterministic prune-only maintenance as the default path.
- LLM consolidation is opt-in and is documented as typically requiring 50-100 API calls.
- The current consolidation implementation has no useful hard call, token, runtime, spend, or energy ceiling; its agent ceiling is 9,999 iterations.
- The Reddit report of a long, high-power local run is credible user feedback, but it lacks the model, tokens, hardware counters, and run receipt needed to generalize the energy figure.
- Open upstream incidents document broad archiving and broken-reference/support-file risks. Reversibility is helpful but does not prove dependency safety.

Sources: [official Curator documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/curator), [official implementation](https://github.com/NousResearch/hermes-agent/blob/main/agent/curator.py), [opt-in consolidation change](https://github.com/NousResearch/hermes-agent/pull/47840), [community report](https://www.reddit.com/r/hermesagent/comments/1uq5aqg/hermesagent_curator_is_a_waster_of_energy/), [auto-archive incident](https://github.com/NousResearch/hermes-agent/issues/18373), [reference-safety incident](https://github.com/NousResearch/hermes-agent/issues/67515), and [support-file-loss incident](https://github.com/NousResearch/hermes-agent/issues/44760).

## Implemented control

`node tools/hermes-curator-value-audit.js` separates evidence collection from grading and writes a mode-safe receipt at:

`~/.hermes/receipts/curator-value-audit/latest.json`

For prune-only mode it requires:

1. backups enabled with non-zero retention;
2. a readable latest run report matching `.curator_state`;
3. a run summary proving consolidation was skipped;
4. zero LLM model/provider identity and zero tool calls.

For consolidation mode it fails closed unless all of the following exist:

1. hard call, iteration, input-token, output-token, runtime, and spend budgets;
2. code-level enforcement of every budget, not config-only decoration;
3. a candidate-bound eval receipt with a non-empty fixture set and zero regressions.

The audit intentionally reports electricity and remote-provider energy as unknown. Duration and token counts are not substitutes for measured watt-hours.

## Why the SMEvals pattern helps

[SMEvals](https://simonwillison.net/2026/Jul/31/smevals/) uses small reviewable fixtures, stores the model/prompt/harness configuration, and separates execution from grading. The Curator control applies the same high-ROI principles:

- the run report is evidence, not its own grade;
- cheap deterministic invariants run before any judge;
- the candidate artifact must be identified in the quality receipt;
- an LLM opinion cannot override missing budgets, missing evidence, or a deterministic regression;
- a small fixture set can grow one real failure at a time without creating an opaque eval platform.

This also matches the agent-harness lesson: the harness should define and enforce “good,” then expose failure, performance, security, and cost evidence. More reflection or more agents are not improvements unless those measured outcomes move.

## Live evidence on 2026-08-02

The latest installed Curator run reported:

- mode: prune-only;
- duration: 0.23 seconds;
- skills checked: 87;
- state changes: 0;
- LLM: skipped because consolidation is off;
- model/provider: empty;
- tool calls: 0;
- backups: enabled, keep 5.

The audit scored that observed mode 100/100. That proves this run avoided the LLM consolidation path. It does **not** prove a watt-hour number or that future dependency-aware pruning is perfect.

## Community answer draft (do not auto-publish)

The energy concern is valid for opt-in consolidation, not for every Curator run. Current Hermes separates deterministic prune-only maintenance from the LLM consolidation pass. On this installation, the latest prune-only run took 0.23 seconds and recorded zero model identity and zero tool calls. Consolidation still needs hard call/token/time/spend budgets plus dependency fixtures before it should run unattended. The useful community ask is a structured per-run receipt—mode, model, tokens, calls, duration, changes, and rollback—not an unsupported universal wattage claim.

