# Tinker-brain continuous loop — ThumbGate sales & marketing

**Purpose:** keep the deterministic GTM brain **self-healing**, **self-learning**, and **self-improving** without LLMs inventing cash or strategy.

## Hard guarantees (do not break)

| Guarantee | How |
|-----------|-----|
| Fail-closed cash | External revenue only from non-owner Stripe receipts; no invented $ |
| No hallucinated GTM | Answers from `THUMBGATE_EXPERT_CARD` + `ANSWER_CARD` only |
| Honest non-answers | Coverage checker + gap log when the card does not address the question |

## Continuous loop

```bash
python3 tools/tinker-brain/tinker_brain_continuous.py --once --heal --json
```

| Phase | Action |
|-------|--------|
| **HEAL** | Detect snapshot vs repo divergence; promote **newer `AS_OF_RESEARCH`**; re-export snapshot (live health + billing) |
| **LEARN** | Fold coverage-gap terms + funnel-stage fails + **human feedback** + billing probe into `coordination/tinker-brain-research-agenda.json`; mark absorbed feedback `consumed` |
| **IMPROVE** | Re-run golden eval; append `~/.hermes/receipts/tinker-brain/continuous-journal.jsonl` |

Human feedback (closes the loop — not collect-only):

```bash
python3 tools/tinker-brain/tinker_brain_production_metrics.py feedback \
  --question "..." --signal need_section --needed-card-section POSITIONING
```

Health shorthand:

```bash
python3 tools/tinker-brain/tinker_brain_health.py --heal --json
```

## Artifacts

| Path | Role |
|------|------|
| `config/THUMBGATE_EXPERT_CARD.txt` | Git-editable GTM law |
| `~/.hermes/business-brain/data-snapshot/` | Runtime card + ANSWER_CARD (wins at load) |
| `coordination/tinker-brain-coverage-gaps.jsonl` | Questions the card could not answer |
| `coordination/tinker-brain-research-agenda.json` | Ranked research + sales next actions |
| `~/.hermes/receipts/tinker-brain/continuous-latest.json` | Last loop receipt |

## LaunchAgent (hourly)

```bash
cp com.igor.tinker-brain-continuous.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.igor.tinker-brain-continuous.plist
launchctl kickstart -k gui/$(id -u)/com.igor.tinker-brain-continuous
```

Logs: `~/Library/Logs/hermes/tinker-brain-continuous.{out,err}.log`

## Sales next actions (examples from learn phase)

- Campaign beat fail → ship LIVE beat ≤2d with UTMs, Leash/gate-first copy  
- Coverage gap `trademark` / `nous` → ensure card sections exist (v2 already has trademark/Nous)  
- Billing probe → never hard-code Continuity $; read `/api/billing/plan`  

## What this is not

- Not an autonomous ad buyer or spam sender  
- Not an LLM fine-tune loop  
- Not a substitute for Stripe-cleared revenue  
