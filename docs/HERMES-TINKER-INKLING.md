# Hermes, Tinker, and Inkling

Inkling is a model candidate, not a replacement for the Hermes agent harness.
Claude Code, Codex, and Grok Build bundle model access with repository tools,
sandboxing, orchestration, and execution loops. Inkling is an open-weights base
model that Hermes could call after a serving route exists.

Primary sources:

- [Inkling announcement](https://thinkingmachines.ai/news/introducing-inkling/)
- [Inkling model card](https://huggingface.co/thinkingmachines/Inkling)
- [Using Inkling on Tinker](https://tinker-docs.thinkingmachines.ai/cookbook/inkling/)
- [Tinker training API and current pricing](https://thinkingmachines.ai/tinker)
- [Thinking Machines batch-invariant inference research](https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference)
- [Claude Code subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents)
- [Codex cloud](https://developers.openai.com/codex/cloud)
- [Grok Build open source](https://x.ai/news/grok-build-open-source)

## The actual advantage

| System | What it is | Best use in Hermes | Boundary |
|---|---|---|---|
| Inkling + Tinker | Open-weights, 975B-total/41B-active multimodal MoE; 1M context; controllable effort; managed LoRA customization | A remotely sampled, fine-tuned candidate for private domain tasks and multimodal evals | It is not a terminal agent. Local serving still needs all weights resident or streamed plus runtime/KV overhead. |
| Claude Code | Closed model plus mature terminal agent, hooks, MCP, and subagents | High-risk interactive repository work and mature integrations | No weight ownership; provider execution and policy boundary remain. |
| Codex | Coding agent with local and cloud surfaces, isolated cloud tasks, parallel delegation, and PR workflows | Evidence-heavy implementation and asynchronous repository jobs | No weight ownership; model customization is not Tinker's low-level training loop. |
| Grok Build | Open-source agent loop that can use a selected backend | Auditable local-first agent harness; Hermes currently pins its safe route to loopback Ollama | Opening the harness does not open the cloud model weights. Agent-loop quality and model quality are separate. |

Inkling's high-ROI differentiators are weight access, native text/image/audio
inputs, controllable thinking effort, and direct post-training on Tinker. They
matter when Hermes has a repeatable domain dataset and a measured gap that a
fine-tune can close. Claude Code and Codex retain the advantage when the desired
product is a ready-to-run coding agent rather than a model-training program.

The determinism claim is narrower than “the same prompt always produces the same
code.” Thinking Machines published batch-invariant inference techniques, but
reproducibility still depends on the serving kernels, sampling configuration,
runtime, and hardware. The harness therefore does not mark determinism as proven
from the weights alone.

## Why local Inkling is rejected on this Mac

The host-aware recommendation uses the full parameter count. Even a theoretical
4-bit representation of 975B parameters is about **487.5 GB before runtime, KV
cache, and other overhead**. The model's 41B active parameters reduce arithmetic
per token; they do not eliminate storage for inactive experts.

`tinker-yolo recommend --json` measures the current host rather than trusting a
machine nickname. It permits a local candidate only when both conditions hold:

1. the theoretical weight footprint fits; and
2. a future version implements and validates a host-bound compatible-runtime receipt.

This version deliberately has no environment-variable override for runtime proof. A larger
host alone cannot promote Inkling to a local route.

The local Hermes baseline remains unchanged regardless. Inkling promotion needs
paired baseline/candidate runs, at least three repeats per stable case, held-out
coverage, and no regression through the existing `hermes-harness-eval` profile
gate. The expected profiles are:

- `hermes-local-baseline`
- `inkling-tinker-candidate`

## Hardened `tinker-yolo` contract

### Local tool-using agent

Bare `tinker-yolo`, `tinker-yolo agent`, and `tinker-yolo chat` now start the
same local agent loop instead of delegating to the chat-only `ollama run` UI.
The agent declares JSON-schema tools to Ollama, executes returned calls, appends
the results, and continues until Qwen returns a final answer.

The local catalogue is:

- workspace working-directory discovery, file listing, reading, and ripgrep;
- atomic file writes and exact replacements;
- bounded shell execution with network access and a secret-sanitized child env;
- HTTP fetch and public web search.

Direct file operations remain inside the starting workspace. Shell commands
have ordinary local-account authority, matching the explicit yolo contract, but
use workspace-validated cwd, a bounded process group, output caps, and a
ten-minute absolute timeout. Every call writes a content-free, mode-0600,
hash-chained receipt under `~/.hermes/tinker/receipts/`.

Useful forms:

```text
tinker-yolo
tinker-yolo agent "inspect this repo and run its focused tests"
tinker-yolo chat --workspace /path/to/repo --model qwen3-hermes-tinker:q4
```

This path uses local Ollama only. It neither reads the Tinker API key nor makes
a provider call. See
[the July 2026 research ingest](./RESEARCH-TINKER-YOLO-FULL-TOOLS-JULY-2026.md)
for the official tool-use evidence and threat model.

Read-only and local commands do not activate training:

```text
tinker-yolo status
tinker-yolo recommend --json
tinker-yolo --doctor --json
tinker-yolo build
```

`build` now stores the dataset under the private Tinker state directory rather
than `/tmp`. Directories are mode `0700`; datasets and receipts are `0600`.
Temporary build material stays inside that private directory.

Every provider-training command requires all of the following before a provider
process can start:

```text
--approve-paid --approve-data-upload --max-cost-usd N
```

The wrapper also requires the fleet zero-spend marker to be absent, scans the
entire dataset for common secret patterns, rejects symlinks/invalid JSONL, limits
examples and steps, and refuses a run whose conservative cost estimate exceeds
the supplied cap. The estimate uses UTF-8 bytes as an upper-bound token proxy,
the configured training rate, and a 25% margin.

The cap is explicitly **not** represented as a provider-side hard billing cap;
the current downstream Tinker API path does not expose proof of that primitive.
Receipts therefore preserve `actualCostUsd: null` instead of inventing zero.

Training and deploy currently retain `Qwen/Qwen3-8B`, matching the downstream
renderer and local Ollama deployment path. Inkling is not silently substituted:
its renderer, remote sampling route, and paired evaluation must be wired and
proven in a separate candidate experiment first.
