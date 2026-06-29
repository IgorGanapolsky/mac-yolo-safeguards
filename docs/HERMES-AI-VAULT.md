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
- `Procedures/Vault Interview Procedure.md`
- `Decisions/Recent Decisions.md`
- `LLM Entry Points/Codex.md`
- `LLM Entry Points/Claude.md`
- `LLM Entry Points/Gemini.md`
- `LLM Entry Points/GPT.md`
- `LLM Entry Points/Hermes.md`
- `LLM Entry Points/Ollama Local.md`
- `LLM Entry Points/Obsidian.md`
- `Routing/llm-routing.json`
- `Status/Vault Conditions.md`
- `Sources/source-index.json`
- `Templates/Context Request.md`
- `Templates/Task Brief.md`

## Usage

```bash
node tools/hermes-ai-vault.js build
node tools/hermes-ai-vault.js build --out /path/to/vault --json
node tools/hermes-ai-vault.js install
node tools/hermes-ai-vault.js validate --vault /path/to/vault --json
```

`install` writes the live Hermes-readable vault to:

```bash
~/.hermes/ai-vault/
```

and writes a pointer file:

```bash
~/.hermes/AI_VAULT.md
```

Hermes should read `~/.hermes/AI_VAULT.md`, then
`~/.hermes/ai-vault/Routing/llm-routing.json`, then the matching file under
`LLM Entry Points/` before choosing a model or sub-agent.

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
- Each LLM has a generated entrypoint with its role, read order, stop gates, and
  do/don't rules.
- `Routing/llm-routing.json` lets Hermes pick Codex, Hermes, Ollama-local,
  Gemini, GPT/Claude, or Obsidian by task type without guessing.
- `SOURCE-MANIFEST.md` keeps context source-backed.
- `state.json` and `Status/Vault Conditions.md` make the vault resumable and
  status-oriented.
- `Token Efficiency Context.md` helps agents load less context and spend fewer
  tokens while preserving evidence.

## Operating Pattern

1. Run `node tools/hermes-ai-vault.js install`.
2. Hermes reads `~/.hermes/AI_VAULT.md`.
3. Hermes loads `Routing/llm-routing.json`.
4. Hermes selects the matching LLM entrypoint:
   - code and tests -> Codex
   - orchestration and follow-up -> Hermes
   - cheap summaries/classification -> Ollama Local
   - large-context review -> Gemini
   - product/strategy reasoning -> GPT or Claude
   - human graph navigation -> Obsidian
5. The selected tool reads only the minimal context pack and reports the
   verifier it used.
