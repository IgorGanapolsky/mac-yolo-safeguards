# Token Economics — real teach/produce/spin measurement

`tools/token-economics-rollup.js` classifies every call recorded in the LiteLLM
gateway traffic logs (`~/.hermes/litellm-logs/traffic.jsonl*`) into the
Teach / Produce / Spin taxonomy using per-record metadata only
(`prompt_tokens`, `completion_tokens`, `status`, `finish_reason`,
`empty_kind`, `model`). Message bodies are never written to reports.

## Run

```bash
node tools/token-economics-rollup.js            # last 3 days, table + JSON report
node tools/token-economics-rollup.js --days 7 --json
```

Reports land in `~/.hermes/telemetry/token-economics-YYYY-MM-DD.json`.

## Nightly schedule

The script is copied to `~/.hermes/bin/token-economics-rollup.js` and run by
the LaunchAgent `com.igor.token-economics` (03:45 daily). LaunchAgents must
point at `~/.hermes/bin`, never at a git checkout or worktree path — pruned
worktrees have killed launchd jobs before (exit 127).

## First real findings (2026-08-06, 3-day window, 20,915 calls)

- Input:output token ratio **91:1** (238.0M in / 2.6M out) — confirms the
  fleet's input-bloat problem with fresh data.
- **Spin = 57% of all tokens.** Dominant sources:
  - `health` — 16,029 canary/health-probe calls (77% of ALL gateway calls);
  - `failed` — 2,654 calls with empty/error results (e.g. `glm-coding`
    2,197 calls with 0 tokens);
  - `retryDup` — 86 third-or-later identical retries; `capped` — 55.

## Known limits (honest by design)

- **Teach attribution is unavailable** until gateway callers tag purpose.
  Fix: send an `x-purpose: teach|produce` header at call sites; the rollup
  will pick it up as a follow-up.
- `health` uses a heuristic (canary prefix, or ≤30 prompt / ≤12 completion
  tokens) and can over-count very small legitimate calls.
- Dollar costs are intentionally omitted: the main lanes are flat-rate
  subscriptions or local models, so tokens are the honest unit.

## Companion (unmerged)

`tools/token-spend-classifier.js` (separate agent's WIP, not on main yet)
carries the taxonomy scoring for hand-labelled workflow suites. Its demo mode
must never be presented as a system grade; real grades come from this rollup.
