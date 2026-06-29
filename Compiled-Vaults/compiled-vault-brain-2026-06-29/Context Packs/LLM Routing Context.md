---
type: "context-pack"
scope: "LLM routing and context selection"
source_status: "source-backed"
last_verified: "2026-06-29T13:49:05.760Z"
tags:
  - "llm"
  - "routing"
  - "context"
---
# LLM Routing Context

## Routing Principles

- Use the smallest context pack that answers the task.
- Prefer source-backed Markdown over chat memory.
- Use code-capable agents for repository edits and tests.
- Use stronger reasoning models for ambiguous synthesis, audits, and risk calls.
- Use local/Ollama models only when the compact pack is enough and privacy or
  latency is more important than broad tool capability.

## Experiment-Gated Defaults

- cross_agent_sync_packet: metric=sync_packet_generated=true, redaction_tests_pass=true, active_locks_visible=true; evaluator=`node tests/test-agent-sync-brief.js && node tools/agent-sync-brief.js --no-write --stdout`
- arena_token_efficiency_benchmark: metric=task_improvement_per_1k_output_tokens, tool_hallucinations, bash_recovery_failures, evaluator_pass; evaluator=`node tests/test-recursive-experiment-loop.js && node tools/recursive-experiment-loop.js efficiency --before 40 --after 64 --output-tokens 800 --tool-hallucinations 0 --bash-recovery-failures 0 --evaluator pass --json`
- checkout_recovery_experiment: metric=qualified_followups_sent, checkout_reopened, payment_succeeded_count, complaint_count; evaluator=`node tools/payment-waiting-audit.js && node tools/revenue-control-checks.js`
- provider_routing_benchmark: metric=latency_ms, cost_usd, context_tokens, smoke_pass, quality_score; evaluator=`node tests/test-openrouter-graphify-tools.js && node tests/test-kimi-model-upgrade-audit.js && node tests/test-glm52-hermes-config.js`
- rag_source_grounding_eval: metric=source_pack_present=true, graph_query_success=true, cited_files_count>=2; evaluator=`node tests/test-hermes-source-packs.js && node tests/test-openrouter-graphify-tools.js`

## Privacy Boundaries

- Do not copy secrets into prompts or vault notes.
- Do not ingest external accounts unless connector identity and approval are
  recorded.
- Summarize sensitive operational data minimally and point to source provenance.

## Provenance

- SOURCE-MANIFEST.md: agent-directives, coordination-board
- Recursive plan generated from tools/recursive-experiment-loop.js
