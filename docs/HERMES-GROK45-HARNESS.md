# Hermes Grok 4.5 Harness

`grok-yolo` pins the official Grok Build CLI to `grok-4.5`, enables its
always-approve mode, and retains explicit denials for destructive commands and
common secret-bearing paths. It works as a standalone coding agent and as an
independent verifier inside the Hermes harness.

`hermes-yolo` now prefers this Grok 4.5 backend for ordinary prompts. It no
longer silently drops to Qwen when a paid Hermes provider key is absent.
Hermes administrative commands such as `hermes-yolo doctor`, `status`, and
`gateway` still use the Hermes CLI.

## Commands

```sh
# Interactive standalone Grok 4.5 agent
grok-yolo

# Standalone one-shot
grok-yolo -p "inspect this repo and identify the highest-risk bug"

# Same Grok 4.5 executor through the familiar Hermes command
hermes-yolo "fix the bug, run the focused tests, and report evidence"

# Zero-token proof of the installed route, model, auth/billing mode, and wrapper hash
hermes-yolo --route-status

# Independent verifier receipt for Hermes orchestration
hermes-grok45 \
  --task "review the current diff independently and verify the acceptance check" \
  --execute \
  --json \
  --write

# Mine prompt-free receipts and refresh the inspectable harness wiki
hermes-harness-eval --write --json
```

The legacy Hermes provider path remains available only as an explicit override:

```sh
HERMES_YOLO_BACKEND=hermes hermes-yolo "run with the configured Hermes provider"
```

## Two-Mac install

The installer deploys the standalone command, verifier harness, and corrected
`hermes-yolo` wrapper, receipt evaluator, and guarded Parallel Search client
locally and to the `hermes-mini` SSH host without touching either machine's
working repository:

```sh
bash scripts/install-grok-yolo.sh --update
```

It finishes with a secret-safe doctor on both hosts. A doctor is green only
when the CLI is current enough, the account is authenticated, and `grok-4.5`
appears in the live model catalog.

## Billing boundary

There are two distinct authentication and billing paths:

| Path | What the harness records | Payment behavior |
|---|---|---|
| Grok Build login (`grok.com_oauth`) | `grok_plan_or_limited_free_quota` | Uses the current account plan or limited free trial/quota. It does not activate API-key billing. Limits and future terms can change. |
| `XAI_API_KEY` | `xai_api_pay_as_you_go` | Direct API usage is token-billed. The harness refuses execution without `--paid-ok`. |

As of 2026-07-08, direct `grok-4.5` API pricing is **$2 per million input
tokens**, **$0.50 per million cached input tokens**, and **$6 per million output
tokens**, with a 500K context window. Source: [xAI Grok 4.5 docs](https://docs.x.ai/developers/grok-4-5)
and [xAI pricing](https://docs.x.ai/developers/pricing).

No setup script creates an API key, buys credits, changes a billing limit, or
copies authentication files between Macs.

## Hermes integration contract

The verifier runs Grok 4.5 with:

- no subagents and no cross-session memory;
- a bounded turn count and hard process timeout;
- an independent-verifier system rule;
- command/test evidence required for a pass;
- secret redaction and private `0600` receipts;
- no merge, push, publish, delete, or credential operations;
- explicit auth and billing-mode evidence in every receipt.

The economic router exposes `grok45_verifier_candidate` only when a task
explicitly asks for Grok. It pairs the local Hermes executor with an independent
Grok reviewer, surfaces disagreement, and keeps the router's default route
unchanged until comparison receipts justify promotion.

Every `hermes-yolo` route writes a prompt-free receipt. The receipt records the
selected backend/model, explicit routing reason, exit status, duration, wrapper
hash, and whether any Qwen route was explicitly requested. It stores only a
digest of the task, never the prompt. The verifier writes a compact history
trace when `--write` is enabled:

```text
~/.hermes/receipts/hermes-yolo/latest.json
~/.hermes/receipts/hermes-yolo/history.jsonl
~/.hermes/receipts/grok45/latest.json
~/.hermes/receipts/grok45/history.jsonl
```

`hermes-harness-eval --write` deterministically mines those histories into
pass/failure rates, latency percentiles, failure clusters, silent-fallback
counts, and unexplained-Qwen counts. It writes:

```text
~/.hermes/receipts/hermes-yolo/eval-latest.json
~/.hermes/receipts/hermes-yolo/HERMES-HARNESS-WIKI.md
```

This is the high-ROI improvement loop: use traces to find the largest observed
failure cluster, turn that cluster into a regression test, and change routing
only when the offline evaluation improves. It follows the trace-driven agent
improvement approach described by [LangChain](https://www.langchain.com/blog/traces-start-agent-improvement-loop),
while the generated Markdown artifact supplies inspectable wiki-style memory
without storing raw chats; compare [LangChain wiki memory](https://www.langchain.com/blog/wiki-memory).

## Optional Parallel retrieval

`hermes-parallel-search` isolates fresh-web retrieval from model generation. Its
default mode is a zero-call dry run:

```sh
hermes-parallel-search \
  --objective "Find current official guidance for agent retrieval evaluation" \
  --query "official agent retrieval evaluation traces" \
  --max-results 10 \
  --write \
  --json
```

A provider call occurs only when all three gates are present:

```sh
PARALLEL_API_KEY="<key from environment or Keychain>" \
hermes-parallel-search \
  --objective "Find current official guidance for agent retrieval evaluation" \
  --execute \
  --paid-ok \
  --max-cost-usd 0.005 \
  --write \
  --json
```

The wrapper uses Parallel's documented `POST /v1/search` contract, records query
digests rather than raw query text, marks every excerpt as untrusted external
content, and never executes retrieved instructions. The pricing estimate assumes
no free credits: ten results cost $0.005 under the current documented pricing;
additional results add $0.001 each. Sources: [Parallel Search quickstart](https://docs.parallel.ai/search/search-quickstart),
[pricing](https://docs.parallel.ai/getting-started/pricing), and
[source policy](https://docs.parallel.ai/resources/source-policy).

Hard include/exclude-domain filters and `after_date` are available, but the
default is to steer toward official sources in the objective because overly
strict filters can reduce retrieval quality. The economic router treats this as
a paid candidate only; it does not make an automatic provider call or promote it
to the default. This keeps retrieval failures observable instead of disguising
them as generation failures, the separation emphasized in [Retrieval for AI Agent Architecture](https://thenewstack.io/retrieval-ai-agent-architecture/).

## Verification

```sh
node tests/test-grok-yolo.js
node tests/test-hermes-grok45-harness.js
node tests/test-hermes-harness-eval.js
node tests/test-hermes-parallel-search.js
node tests/test-hermes-yolo.js
node tests/test-hermes-economic-router.js
grok-yolo --doctor --json
hermes-yolo --route-status
hermes-grok45 --task "Return exactly GROK45-HERMES-SMOKE" --execute --json
hermes-harness-eval --write --json
```

A successful install is not the same as an authenticated runtime smoke. Report
the doctor, exact model, auth mode, exit code, and marker separately for each
Mac.
