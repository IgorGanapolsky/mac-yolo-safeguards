---
name: local-first-sync-engine
description: Local-First Sync Engine & Reactive Collection Architecture (ElectricSQL / TanStack DB style, query-driven sync, optimistic mutations with transactional rollback) for all coding agents on Igor's Mac.
trigger: ["sync", "local-first", "electric", "tanstack-db", "query-driven-sync", "codex-platform"]
---

# Local-First Sync Engine & OpenAI Codex Platform Harness

Steals the top high-ROI breakthroughs from OpenAI Codex Platform (August 2026) and ElectricSQL / TanStack DB (InfoQ):

1. **OpenAI Codex Platform & App-Server Protocol**:
   - Embeds agents inside domain dashboards rather than standalone chatboxes.
   - Consequential action consent ladder (`pending_approval` state for sensitive writes with cryptographic receipts).
   - Retained reasoning & context compaction (6x token reduction).

2. **Local-First Query-Driven Sync Engine**:
   - Replaces cascading polling loops with declarative collection sync.
   - Instant local optimistic mutations with transactional confirmation and automatic rollback.
   - Sub-millisecond local joins across in-memory collections.

## CLI Usage

```bash
# Run test suite
node tests/test-codex-platform-and-sync-engine.js

# Test Codex App-Server & Sync Engine
node tools/codex-app-server-harness.js
node tools/local-first-sync-engine.js
```
