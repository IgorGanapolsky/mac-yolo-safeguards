# Hermes AI Vault

`tools/hermes-ai-vault.js` compiles a vendor-agnostic Markdown vault for Hermes
and our LLMs. It implements the high-ROI part of the AI second-brain workflow:
plain files, source manifest, agent rules, context packs, state, validation, and
token-efficient loading.

## What It Builds

Default output:

```bash
artifacts/hermes-ai-vault/
```

Required files:

- `README.md`
- `AGENTS.md`
- `SOURCE-MANIFEST.md`
- `VALIDATION-REPORT.md`
- `state.json`
- `Context Packs/Hermes Operating Context.md`
- `Context Packs/LLM Routing Context.md`
- `Context Packs/Token Efficiency Context.md`
- `Procedures/Agent Sync Procedure.md`
- `Procedures/Experiment Loop Procedure.md`
- `Decisions/Recent Decisions.md`
- `Status/Vault Conditions.md`
- `Sources/source-index.json`

## Usage

```bash
node tools/hermes-ai-vault.js build
node tools/hermes-ai-vault.js build --out /path/to/vault --json
node tools/hermes-ai-vault.js validate --vault /path/to/vault --json
```

## Design Boundaries

- Local source files only.
- No external account ingestion.
- No emails, messages, payments, deploys, merges, or process kills.
- No mutation of the original repo sources.
- Generated vault artifacts remain under `artifacts/` by default, which is
  gitignored.

## Why It Helps

- Every LLM gets the same Markdown source of truth.
- Obsidian can open the vault for graph/navigation, but the agents do not depend
  on Obsidian-specific APIs.
- `SOURCE-MANIFEST.md` keeps context source-backed.
- `state.json` and `Status/Vault Conditions.md` make the vault resumable and
  status-oriented.
- `Token Efficiency Context.md` helps agents load less context and spend fewer
  tokens while preserving evidence.
