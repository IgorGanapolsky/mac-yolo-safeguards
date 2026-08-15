# Search-as-Code fleet

Steal from Perplexity's June 2026 [Search as Code](https://research.perplexity.ai/articles/rethinking-search-as-code-generation) paper and the 2026-08-14 Threads update (further SaC optimizations, ~10% cost/task). Implemented here as a **fleet adapter** that every agent home and harness can run.

This stack is independent of the uncommitted `tools/sac-engine.js` work in the shared tree. If that engine later lands, `AgenticSearchSDK` delegates `search()` to it and keeps cost, serde, WANDR, and install layers.

## Why

Traditional search is one query → one SERP → all hits in the model context. Agents then loop the same endpoint. That is the rigidity Perplexity named: coarse context, unused domain knowledge, serial control flow.

SaC makes the model the control plane. It generates a program. The sandbox does fan-out, filter, join, dedupe, and stop logic. The model sees a compact table.

## Layers

| Layer | This repo |
|-------|-----------|
| Models | Any wrapper (hermes-yolo, seed-yolo, ali-yolo, grok-yolo, Codex, Claude, Cursor, Gemini) plus the skill |
| Sandbox | `SaCSandboxRunner` (vm) + `SacStateStore` under `~/.hermes/sac-state` |
| SDK | `tools/sac-fleet.js` + `tools/sac_fleet_sdk.py` |
| Cost | cache, lexical prefilter, dedup-before-fetch, early-stop, compact |
| Eval | `tools/sac-fleet-wandr.js` soft/hard F1 |

## CLI

```bash
bin/sac-fleet doctor --json
bin/sac-fleet search "Search as Code" --fanout --rerank --compact
bin/sac-fleet run tests/fixtures/sac-fleet-workflow.js
bin/sac-fleet install
bin/sac-fleet benchmark --json
bin/sac-fleet cost
```

## Fleet install

`bin/sac-fleet install` symlinks `.agents/skills/search-as-code-fleet` into:

- `~/.grok/skills` `~/.claude/skills` `~/.cursor/skills` `~/.agents/skills`
- `~/.hermes/skills` `~/.codex/skills` `~/.gemini/config/skills`
- repo `hermes-skills/` / `hermes-local-skills/`
- sibling projects that already have `.agents/skills` (ThumbGate, Resume, agency, …)

Writes `~/.hermes/sac-fleet.json` and `~/.local/bin/sac-fleet`.

Hermes lean-context already walks those skill roots, so wrappers pick the skill up without editing locked `hermes-yolo-wrapper.js`.

## Harness hooks

- `tools/agent-session-start.js` prints a one-line SaC brief
- `tools/agent-swarm-harness.js` report includes `sacFleet`
- `tools/lib/sac-yolo-hook.js` for wrappers that opt in
- `bin/agent-loop` is owned elsewhere; use `bin/sac-fleet recollect` as the Recollect rail

## Tests

```bash
node tests/test-sac-fleet.js
```

Offline. No live web required.
