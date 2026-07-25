# How ARC-AGI improves Hermes / ThumbGate (2026-07-25)

**Source:** [ARC Prize — ARC-AGI](https://arcprize.org/arc-agi) · Chollet, *[On the Measure of Intelligence](https://arxiv.org/abs/1911.01547)*

## What ARC-AGI actually measures

ARC-AGI is **not** “another hard exam for LLMs.” It measures **fluid intelligence**:

> skill-acquisition efficiency on **novel** tasks given **core knowledge priors** (objectness, geometry, number, basic color), *not* skill bought with unlimited task-specific training data.

- **Crystallized skill** (coding contests, MMLU, leaderboard macros) can be purchased with data + fine-tunes.  
- **Skill-acquisition** = how fast a system turns a few demos into a rule that works on a held-out instance.

That distinction is the product of the ARC Prize definition of AGI: *match human learning efficiency on unknown tasks.*

## Why that improves *our* system

| Failure mode we already hit | ARC-AGI corrective |
|----------------------------|--------------------|
| Ship claims from green unit tests / memorized flows | Hold-out induction: train demos ≠ test task |
| “Smarter model” marketing without generalization proof | Prefer **holdoutAccuracy** over raw chat quality |
| Overfitting agents to Igor's Mac + USB dogfood | Core priors: same rules must transfer (USB/Tailscale/new Mac) |
| Tool thrash / infinite loops on novel errors | Few-shot rule fit or **fail closed** (no inventing) |
| Decision stack = intuition | `arcSkillEfficiency` gate before model/profile promotion |

Hermes is an **agent runtime** (tools + leases + Continuity). ThumbGate is **remote control**. Neither wins by memorizing yesterday’s ticket. They win when a new failure class is solved from a few examples with the same core machinery (pairing, fenced 90s lease, Leash).

## What we implemented (high-ROI, local, $0 API)

| Artifact | Role |
|----------|------|
| `tools/arc-skill-efficiency.js` | Few-shot grid battery (ARC *spirit*, original tasks) + program induction + efficiency score |
| `tests/test-arc-skill-efficiency.js` | Deterministic CI unit coverage |
| `tools/agent-decision-stack.js` | `--with-arc` / auto-run on promote/eval keywords; blocks soft “smart” claims when holdout fails |
| This doc | Shared agent memory |

### Metric (proxy for Chollet efficiency)

```
efficiency = 1 / (program_complexity × train_pair_count)   if test success else 0
holdoutAccuracy = successes on held-out task IDs / holdout count
```

Gate: `trainAccuracy ≥ 0.9` and `holdoutAccuracy ≥ 0.8` (default).

### Commands

```bash
node tools/arc-skill-efficiency.js --verbose
node tools/arc-skill-efficiency.js --gate --json
node tools/agent-decision-stack.js --task "promote fleet model" --with-arc --json
node tests/test-arc-skill-efficiency.js
```

## What we deliberately did **not** do

- Download/redistribute the **official** ARC Prize private eval set (license + contest integrity).  
- Spend LLM tokens on grid puzzles in CI (flaky + costly).  
- Claim Hermes “is AGI” or leaderboard placement.

## Next high-ROI (not this PR)

1. Optional LLM probe: same battery, few-shot prompts to candidate fleet models → store under `~/.hermes/receipts/arc/` (cost-gated).  
2. Wire holdout fail into `hermes-harness-eval` profile promotion.  
3. Continuity offline tasks as *real* few-shot transfer tests (new Mac, no saved profile).

## Bottom line

ARC-AGI improves our system by forcing **evidence of generalization** before we call something intelligent, ready, or promotable — aligning fleet ops with the only scientifically grounded “are we getting smarter?” signal that resists data-buying theater.
