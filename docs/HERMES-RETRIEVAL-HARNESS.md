# Hermes Retrieval Harness

`tools/hermes-retrieval-harness.js` is the local Hermes adaptation of the
legal-kb retrieval pattern: inventory first, retrieve candidate evidence, then
confirm exact text with `read` or `grep` before citing.

It is intentionally local and dependency-free. Hermes should use it for repo
docs, proofs, source packs, status notes, and tests without uploading private
documents to a hosted index.

## Why This Improves Hermes

- **Fewer stale claims:** every result has a file path, line window, content
  hash, and `cite:<id>` reference.
- **Better agent workflow:** agents can `find` candidate files, `retrieve`
  likely chunks, then `read` or `grep` exact evidence before answering.
- **Safer context sharing:** returned text is redacted for common token/key
  shapes before it leaves the tool.
- **No new cloud dependency:** the harness works against local files and can run
  inside `agent-decision-stack.js`.

This does not prove that CI passed, a phone run succeeded, a store submission is
live, or revenue cleared. It only proves what local source/proof files currently
say.

## Commands

```bash
node tools/hermes-retrieval-harness.js inventory
node tools/hermes-retrieval-harness.js find --contains continuous --json
node tools/hermes-retrieval-harness.js retrieve --query "gateway latest proof e2e skipped" --json
node tools/hermes-retrieval-harness.js read --file hermes-mobile/docs/proofs/continuous/latest.json --json
node tools/hermes-retrieval-harness.js grep --file plan.md --pattern "T-82|retrieval harness" --json
```

## Agent Contract

1. Run `find` or inspect the inventory before broad claims.
2. Run `retrieve` to identify likely evidence.
3. Run `read` or `grep` on the cited file before using that fact in a final
   answer.
4. Cite `path:lineStart-lineEnd` plus the tool output, not memory alone.
5. Keep local-file truth separate from live runtime, store, CI, or payment
   provider truth.

## Decision Stack Integration

`tools/agent-decision-stack.js` now includes `rag.localRetrieval` by default.
Use `--skip-local-retrieval` only when you are explicitly measuring the older
ThumbGate/Graphify-only path.

```bash
node tools/agent-decision-stack.js \
  --task "Hermes Mobile publication proof" \
  --json
```

## Scope

Default indexed roots:

- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `README.md`, `plan.md`
- `docs/`
- `tools/`
- `tests/`
- `hermes-mobile/AGENTS.md`
- `hermes-mobile/docs/`
- `services/hermes-relay/README.md`

Private operational data such as `business_os/`, compiled vault dumps,
build artifacts, native mobile build trees, `node_modules/`, and Git internals
are excluded by default.
