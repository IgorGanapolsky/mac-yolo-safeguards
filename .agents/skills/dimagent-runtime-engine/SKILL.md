---
name: dimagent-runtime-engine
description: DimAgent-inspired Cache-Native Agent Runtime Engine (90-98% KV-cache hit rate, 3-layer error recovery, large output blob offloading for 20+ hour continuous execution, ACP JSON-RPC 2.0 stdio server, and two-layer hard plan mode) for all coding agents on Igor's Mac.
---

# DimAgent Cache-Native Resilience & ACP Runtime Skill

This skill implements the high-ROI architectures stolen from **DimAgent** (dimagent.com / archships/dimcode):

## 1. Cache-Native Context Architecture (98% KV-Cache Reuse)
- **Immutable System Prefixes**: Maintains stable system instructions and fixed tool parameter token offsets.
- **Cache-Aligned Token Ordering**: Preserves prompt prefixes across turns to achieve 90–98% KV-cache hit rates on DeepSeek V4, Qwen, and Claude models.

## 2. 3-Layer Error Recovery & Large Output Blob Offloading (20+ Hour Runs)
- **Layer 1: Transient Retry with Jitter**: Auto-recovers from 429 rate limits, network timeouts, and connection resets.
- **Layer 2: Context Overflow Compaction & Blob Offload**: Offloads outputs exceeding 2KB to `.cache/blobs/<sha256>.blob` with structured summary pointers, preventing context blowout.
- **Layer 3: Checkpointing & State Rollback**: Snapshots agent state every turn to allow rollbacks if subagents hallucinate or wedge.

## 3. Agent Client Protocol (ACP) JSON-RPC 2.0 Server
- Standard editor communication protocol over `stdio` (`dim acp` / `hermes acp`) for Zed, editors, and terminal TUIs.

## 4. Two-Layer Hard Plan Mode Gate
- Hard runtime interdiction for mutating tools (`write_file`, `run_command`, etc.) during plan mode, guaranteeing zero unintended data modifications.

## CLI Usage

```bash
# Check runtime health and KV-cache hit rate
bin/dim-agent status

# Execute task with two-layer plan mode
bin/dim-agent exec "analyze repository architecture" --mode=plan

# Launch standard ACP JSON-RPC 2.0 stdio server
bin/dim-agent acp
```
