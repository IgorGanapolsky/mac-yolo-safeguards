# MCP data tools (Search Engine Land) → fleet apply (2026-08-12)

**Source:** [How to use MCP to get more data from the tools you already use](https://searchengineland.com/mcp-data-tools-484650) (Alex Juel)

## How this helps us

The article’s claim is simple: **dashboards hide multi-report answers; MCP makes those answers askable.**

| Article pattern | Our transfer |
|-----------------|--------------|
| Ask hard competitor-growth questions via Ahrefs/Semrush MCP | Use **Semrush MCP** when `SEMRUSH_API_KEY` is set — already listed in `.mcp.json` |
| GA4 MCP for “which pages lost traffic by device/country” | Install **official GA4 MCP** when organic/funnel diagnosis is the sprint (OAuth cost) |
| Community **GSC MCP** for queries/CTR/position | Highest organic ROI for **thumbgate.app** — not installed yet |
| Prefix prompts with “Using the X MCP” | Prompt library enforces routing (models otherwise web-search) |
| Chain tools; verify output; watch API credits | Chain + `agent-memory-before-gen` store after verified answers |

**Beachhead honesty:** We are not an SEO agency. Paying for Ahrefs Brand Radar to “have MCP” is not the AHLS $149 cash path. Prefer free rails: **grepai**, **github**, **memory-before-gen**, then one paid SEO MCP with a real key.

## What we found live

| Surface | Reality |
|---------|---------|
| `.mcp.json` | `github`, `context7`, `grepai`, **`semrush`** |
| `SEMRUSH_API_KEY` | **unset** → Semrush is configured but not credential-ready |
| Empty Bearer risk | `Bearer ${SEMRUSH_API_KEY:-}` can send invalid empty auth (same class as old context7 bug) |
| GSC / GA4 / Ahrefs MCP | **not** in `.mcp.json` |
| Theater harness (dirty tree) | Claimed GSC/GA4 CONNECTED + score 94.8 — **rejected** |

## Implemented

```bash
node tools/mcp-seo-data-harness.js inventory --json   # honest status
node tools/mcp-seo-data-harness.js plan
node tools/mcp-seo-data-harness.js prompts --property thumbgate.app
node tools/mcp-seo-data-harness.js gaps
```

Also:

- `SERVER_META.semrush` in `tools/mcp-health-check.js`
- `.mcp.json` Semrush headers removed until a real key exists (no empty Bearer)
- Inventory docs regenerated via `--write-docs` when shipped

## Immediate operator steps (when SEO is the sprint)

1. Store `SEMRUSH_API_KEY` in Keychain/env; re-add `headers.Authorization` with non-empty key only.
2. Run prompt library against **thumbgate.app** via host MCP (Claude/Cursor) with Semrush connected.
3. Store verified bullets:  
   `node tools/agent-memory-before-gen.js store --domain seo --query "…" --answer "…" --json`
4. GSC next: local community MCP + least-privilege OAuth (article: Suganthan Mohanadasan server).

## Not done (and why)

- Did not mint fake AI visibility scores
- Did not install GSC OAuth (needs Google Cloud project + browser consent)
- Did not purchase Ahrefs
- Did not claim Semrush “ACTIVE” without a key
