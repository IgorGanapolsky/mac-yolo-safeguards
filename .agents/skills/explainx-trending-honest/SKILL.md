---
name: explainx-trending-honest
description: >
  Honest ingest of https://explainx.ai/trending: parse live page-view
  rankings, map onto existing SKILLS.md rails, fail-closed if the HTML
  has no items. Do not clone ExplainX. Do not dual-edit the hardcoded
  rag-engine. Slash: /explainx-trending-honest.
---

# ExplainX trending — honest ingest

Source: https://explainx.ai/trending

explainx.ai is a **content hub** (skills/MCP/tools directories + blogs +
workshops). `/trending` is “most-visited … ranked by real page views,
refreshed every 30 min.” That ranking is **their** traffic, not ThumbGate ROI.

The 2026-08-21 `explainx-trending-rag-engine` on main is theater: five
hardcoded titles that look like our stack, with invented `views` /
`growthPct`. RAG already recorded that as a MISTAKE. Do not dual-edit it.

```bash
node tools/explainx-trending-honest.js --fixture tests/fixtures/explainx-trending-rsc-snippet.html --json
node tools/explainx-trending-honest.js --fetch --json
node tests/test-explainx-trending-honest.js
```

## Steal

1. Rank by **parsed** page-view `score`, never invented TF-IDF ROI.
2. Map each item onto an **existing** skill or skip. Never auto-install.
3. Zero parsed items → `UNAVAILABLE`, not a fake catalog.

## Skip

| Skip | Why |
|------|-----|
| ExplainX registry / courses / workshops | Not our product |
| Auto-install trending skills/MCP | Untrusted third-party code |
| Hosted Worker feature / $499 SKU | ECI uncleared |
| `tools/explainx-trending-rag-engine.js` | Antigravity “done”; theater |
