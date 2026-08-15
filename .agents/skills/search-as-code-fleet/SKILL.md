---
name: search-as-code-fleet
description: >
  Perplexity Search-as-Code across every agent/harness: generate a retrieval
  program (fanout, filter, dedupe, BM25+RRF, verify, compact) instead of
  serial web_search/MCP dumps. ≥10% cost/task via cache, prefilter, early-stop.
  Trigger: research, lookup, find all, wide/deep search, WANDR, cite sources,
  compare vendors, or any task that would otherwise loop tool-calling search.
---

# Search-as-Code (fleet)

Do **not** retrieve through function-calling or MCP. Write a short program and
run it in the sandbox so ranking, joins, and noise stay out of the model context.

```bash
bin/sac-fleet search "<question>" --fanout --rerank --compact
bin/sac-fleet run ./workflow.js
bin/sac-fleet doctor --json
```

## Compose, don't call

```javascript
const hits = await sac.fanout([
  "ThumbGate spend guard false deny",
  "ThumbGate commerce vocabulary matcher",
], { limit: 6 });
const keep = sac.filter(sac.dedupe(hits), (d) => !/aggregator|nvd/i.test(d.url || d.source || ''));
const ranked = sac.rerank("ThumbGate false deny", keep, { strategy: 'rrf', limit: 6 });
const coverage = await sac.backfillCoverage(ranked, [{ query: "satisfy_gate allowlist" }], { floor: 2 });
persist('deny-research', { ranked, extra: coverage.extra });
return sac.synthesize_table(ranked, ['title', 'source', 'snippet']);
```

Python harnesses: `from tools.sac_fleet_sdk import sac`.

## Hard rules

| Never | Always |
|-------|--------|
| Serial `web_search` / MCP result dumps | One sandbox turn, thousands of deterministic ops |
| Pass intermediate candidate lists as tokens | Filesystem serde (`persist` / `load_state`) |
| Trust a page without a cited excerpt | `verify_claims` + WANDR leaf checks |
| Stop at a handful of examples on wide tasks | Coverage floor + backfill sparse buckets |

Cost target: **≥10% fewer tokens/task** vs naive dump (`bin/sac-fleet cost`).
Compaction target: **85%+** when raw snippets are long.

## WANDR (wide + deep)

A wide task is a hierarchy, not a paragraph: `entity(n) → field(m) → url(k)`.
Grade soft F1 (partial members) and hard F1 (complete subtrees). Discover first,
then enrich every member, then attach evidence. `node tools/sac-fleet-wandr.js --benchmark`.

## Wrapper hook

`tools/lib/sac-yolo-hook.js` → `shouldUseSac(task)` / `runSacForTask(task)`.
Lean-context already loads this skill once `sac-fleet install` links agent homes.
