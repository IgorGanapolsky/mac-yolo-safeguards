# Multi-Agent Pipeline — retry ceiling, failure_source, independent critic

**Tool:** `tools/multi-agent-pipeline.js`
**Tests:** `tests/test-multi-agent-pipeline.js` (11 checks, deterministic, no network)
**Plan:** T-33

## Why this exists

This implements the three production guards from the Towards Data Science article
"Why I Stopped Using One Agent and Built a Multi-Agent Pipeline Instead", applied
to the Hermes Goal Cell orchestration pattern that already lives in
`~/.hermes/goal-cells/current.json` (router / researcher / verifier / closer).

The Goal Cell already splits a task across specialized roles and gates external
side effects through ThumbGate. What it did **not** have (verified by content
search of `~/.hermes` before this work) was the three loop-safety invariants the
article identifies as non-negotiable.

## The three guards

### GUARD 1 — retry ceiling (non-negotiable)

> "The `retry_count` ceiling is non-negotiable here. Without it, a pipeline that
> keeps failing critique will loop indefinitely." — TDS article

`buildState(userTask, { maxRetries })` initializes a hard `maxRetries`
(default 3). `shouldRetry(state)` checks the ceiling as its **first** condition:

```text
critique passed            -> respond
retryCount >= maxRetries   -> respond   // <- hard ceiling, surfaces best effort
otherwise                  -> rebuild
```

A secondary `hardStop = maxRetries + 2` counter in `runPipeline` protects the
loop even if `shouldRetry` logic is tampered with. This is exactly the failure
mode observed in this repo's session: the `ornith-9b-q4` model degenerated into
an infinite repetition loop and had to be killed externally at 120s. With this
pipeline, that class of failure terminates on its own and surfaces a best-effort
result instead of hanging.

**Proof:** `GUARD 1: retry ceiling halts an infinite critique loop` — a critic
that always rejects terminates at `retryCount === 3` with a `surfacedBestEffort`
response, stage sequence `build,critique` × 4 then `respond`.

### GUARD 2 — failure_source attribution

`recordStep(state, agentKey, result, stage)` records every agent invocation in
an append-only `state.trace` and sets `state.failureSource = { agent, reason,
stage }` whenever an agent fails (returns `{ ok: false }` OR throws). Thrown
errors are caught by `invokeAgent` and converted to attributed failures rather
than crashing the pipeline.

This replaces blind retries — instead of "retry the whole pipeline", you know
**which agent** failed and **why**, so the next retry can target the actual
defect. The Goal Cell's existing `stopRules` govern *when* to stop; `failureSource`
governs *diagnosis*.

**Proof:** `GUARD 2: a schema-agent failure is attributed to schema_agent` and
`a thrown agent error is caught and attributed, not crashed`.

### GUARD 3 — independent-context critic

> "You cannot credibly do this [validation] in the same context as generation
> because the model anchors to what it just wrote and will rationalise its own
> output rather than challenge it." — TDS article

`buildCriticContext(state)` returns a **frozen** object containing only:

```text
{ userTask, intents, schemaMapping, generatedQuery }
```

It deliberately omits `trace`, `retryCount`, `failureSource`, and any generator
reasoning. The critic sees the artifact to review and the original task — nothing
else — so it cannot anchor to the generator's chain-of-thought. Freezing prevents
a buggy critic from mutating real pipeline state.

**Proof:** `GUARD 3: critic context excludes trace, retryCount, failureSource`
asserts the forbidden fields are absent and the object is frozen.

## Architecture

```
intent_parser -> schema_agent -> ┌─ query_builder -> critic ─┐ -> responder
                                 └──── (rebuild loop) ───────┘
                                      bounded by GUARD 1
```

- `intent_parser` — decompose task into intents. Strict: must not reference schema.
- `schema_agent` — map intents to real tables/columns. Solves hallucinated columns.
- `query_builder` — generate the artifact. Receives `previousFailure` as a repair
  signal (this is NOT the critic's context — the builder legitimately needs its
  own feedback to fix a draft).
- `critic` — adversarial check on a **pristine** context (GUARD 3).
- `responder` — format final output; marks `surfacedBestEffort` when critique
  never passed.

## Usage

```bash
# Self-contained demo (happy path, no external deps)
node tools/multi-agent-pipeline.js --demo --json --task "Count active users"

# As a library (wire real LLM agents)
node -e '
const { runPipeline } = require("./tools/multi-agent-pipeline");
const agents = {
  intentParser: { key: "intent_parser", async run(p){ return { ok:true, output: {...} }; } },
  schema:       { key: "schema_agent",  async run(p){ return { ok:true, output: {...} }; } },
  queryBuilder: { key: "query_builder", async run(p){ return { ok:true, output: "SELECT ..." }; } },
  critic:       { key: "critic",        async run(ctx){ return { ok:true, output: { passed: true } }; } },
  responder:    { key: "responder",     async run(p){ return { ok:true, output: {...} }; } },
};
runPipeline(agents, "your task", { maxRetries: 3 }).then(r => console.log(r));
'
```

## Test evidence

```
$ node tests/test-multi-agent-pipeline.js
  ok - GUARD 1: retry ceiling halts an infinite critique loop
  ok - GUARD 1: maxRetries=0 means exactly one build, no rebuilds
  ok - GUARD 2: a schema-agent failure is attributed to schema_agent
  ok - GUARD 2: a thrown agent error is caught and attributed, not crashed
  ok - GUARD 3: critic context excludes trace, retryCount, failureSource
  ok - GUARD 3: critic that inspects forbidden fields self-reports anchoring
  ok - HAPPY PATH: passing critique terminates after one build and responds
  ok - shouldRetry: passed -> respond
  ok - shouldRetry: failing under ceiling -> rebuild
  ok - shouldRetry: failing AT ceiling -> respond (best effort)
  ok - buildState rejects empty task

11 checks passed.
ALL GREEN
```

## Scope and the "all machines" caveat

This tool is committed to the repo (`tools/`), so it is available on every Mac
that pulls this branch — it is not a `~/.hermes`-local artifact. The Hermes Goal
Cell (`~/.hermes/goal-cells/current.json`) is per-machine and not synced; wiring
these guards into the live cell on other macs requires the same edit there.
