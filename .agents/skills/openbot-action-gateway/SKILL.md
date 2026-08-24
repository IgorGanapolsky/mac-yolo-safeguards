---
name: openbot-action-gateway
description: CopilotKit OpenBot AG-UI Action Gateway, Per-Agent Sandboxed Coworkers & Deterministic Policy Interdiction Engine for ThumbGate
trigger: ["openbot", "action-gateway", "ag-ui", "per-agent-sandbox", "coworker-isolation"]
---

# OpenBot Action Gateway & Per-Agent Sandboxed Coworkers

Derived from CopilotKit OpenBot (`github.com/CopilotKit/openbot`, August 2026).

## Overview

OpenBot introduces the **AG-UI Action Gateway Protocol** and **Per-Agent Sandboxed Coworker Architecture** to run autonomous digital coworkers with deterministic action governance and per-agent isolation.

### Key Capabilities

1. **Deterministic Action Gateway**: Every tool call (shell command, file modification, web request, MCP tool) passes through an inline policy engine evaluated into `allow`, `ask`, or `deny`.
2. **Per-Agent Isolated Environments**: Coworkers run in dedicated, fenced VPS sandboxes with isolated credential vaults and renewable leases.
3. **AG-UI Protocol Receipts**: Immutable before/after execution audit trails ensuring zero data leaks and ISO 42001 verification.
4. **Human-in-the-Loop Interdiction**: Seamless live intervention for 2FA, sensitive financial spend, or production deployments.

## CLI Usage

```bash
# Run OpenBot action gateway verification
node tools/openbot-action-gateway.js
node tests/test-openbot-action-gateway.js
```
