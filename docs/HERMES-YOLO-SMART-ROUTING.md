# Hermes-Yolo Smart Routing

Hermes-Yolo can opt into an evidence-gated model router without changing explicit model pins or admin commands. The router prefers local or free inference when quality is close, reserves specialist models for tasks that need their capabilities, and fails closed for sensitive work when no qualified local model is installed.

## Decision order

1. **Privacy:** private, credential, customer, medical, legal, and contract tasks may use only an evaluated local model.
2. **Capability:** required modalities, tool calling, context length, and agentic difficulty must match the live catalog.
3. **Private evaluation:** every model needs at least three fresh probes, score at least 0.75, and failure rate no more than 0.20. Vendor benchmarks do not satisfy this gate.
4. **Provider credit:** paid routes require a fresh OpenRouter `/api/v1/credits` receipt with enough real credit for the estimated call.
5. **Local budget:** paid routes also require a fresh monthly ledger, remaining budget, explicit paid opt-in, and an estimated call cost no more than `$0.01` by default.
6. **Value:** the highest private-eval score wins; a zero-cost route within 0.04 of it wins instead.

The content-free decision receipt stores a task digest, requirements, rejection reasons, evaluated model identity, and estimated cost. It does not store the prompt.

## Candidate roles

| Candidate | Intended use | Hard gate |
| --- | --- | --- |
| IBM Granite 4.2 8B GGUF Q4_K_M via local Ollama | sensitive and routine local work | exact local artifact installed plus private eval |
| `openrouter/free` | opportunistic zero-cost work | actual served model identified and all private probes pass |
| IBM Granite 4.1 8B via OpenRouter | very-low-cost routine text/tool work | private eval, provider credit, and monthly budget |
| ByteDance Seed 2.0 Mini | multimodal or context above 131K | private eval, provider credit, and monthly budget |
| ByteDance Seed 2.1 Turbo | hard agentic or multimodal work | private eval, provider credit, and monthly budget |

Granite 4.2 is deliberately local-only because the exact model was absent from the live OpenRouter catalog on 2026-08-26. The local GGUF pull was stopped after its measured ETA exceeded 50 minutes on the degraded WAN; an incomplete download is not an installed-model claim.

## Commands and configuration

```bash
node tools/hermes-yolo-smart-router.js refresh
node tools/hermes-yolo-smart-router.js evaluate
node tools/api-token-budget-sync.js --json
HERMES_YOLO_DYNAMIC_ROUTING=1 node tools/hermes-yolo-smart-router.js route --task "summarize release notes"
HERMES_YOLO_DYNAMIC_ROUTING=1 node tools/hermes-yolo-smart-router.js doctor
```

Runtime opt-ins:

```dotenv
HERMES_YOLO_DYNAMIC_ROUTING=1
HERMES_YOLO_DYNAMIC_ALLOW_PAID=1
HERMES_YOLO_DYNAMIC_MAX_CALL_USD=0.01
HERMES_YOLO_ALLOW_LOCAL=1
```

Existing `HERMES_YOLO_PROVIDER` and `HERMES_YOLO_MODEL` values remain the fallback. Explicit Grok mode, admin commands, and model/provider flags bypass dynamic routing.

Receipts are stored with mode `0600` under `~/.hermes/receipts/hermes-yolo/`:

- `openrouter-catalog.json`: live capability, pricing, and provider-credit snapshot (6-hour catalog TTL; 1-hour credit TTL)
- `model-evals.json`: three-probe correctness, latency, token, cost, model-identity, and output-digest evidence (7-day TTL)
- `latest.json` and `history.jsonl`: per-run content-free routing decisions

## Live acceptance evidence — 2026-08-26

| Candidate | Score | Failure rate | Result | Measured eval cost |
| --- | ---: | ---: | --- | ---: |
| OpenRouter free | 0.3333 | 0.6667 | rejected | $0 |
| Granite 4.1 8B | 1.0000 | 0 | qualified by eval | $0.000015 |
| Seed 2.0 Mini | 0.3333 | 0.6667 | rejected | $0.00008680 |
| Seed 2.1 Turbo | 0 | 1.0000 | rejected; two requests returned HTTP 402 | $0.00006700 |

The private provider-credit receipt then showed an insufficient balance. Therefore every paid route is currently blocked even though the separate local monthly ledger has room. This two-ledger rule prevents a stale local budget from routing into provider 402 errors. With no qualified local model and the free eval rejected, nonsensitive work keeps the existing pinned fallback; sensitive work is blocked rather than sent externally.

Official model background: [IBM Granite 4.2](https://www.ibm.com/granite/docs/models/granite/), [ByteDance Seed LLM](https://seed.bytedance.com/en/direction/llm), and [OpenRouter credit API](https://openrouter.ai/docs/api/api-reference/credits/get-credits).
