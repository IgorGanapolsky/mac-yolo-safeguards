---
name: vellum-hybrid-engine
description: Vellum AI Assistant & Hybrid Hosting Engine (Local Apple Silicon $0 data privacy vs Cloud VPS 24/7 always-on, 8-tier persistent memory bank, sandboxed credential vaulting) as a drop-in alternative to Grok Bot.
---

# Vellum Hybrid Assistant & Memory Engine Skill

Implements Vellum's dual-mode hosting architecture and 8-tier memory model across ThumbGate and Hermes multi-agent fleets.

## Global System Commands

- **`bin/vellum --doctor`**: Probes hosting environment, active models, and memory health.
- **`bin/vellum --mode local`**: Routes all assistant workloads locally to Apple Silicon ($0 spend, maximum privacy).
- **`bin/vellum --mode cloud`**: Routes to Cloud VPS / Cloudflare D1 for 24/7 background operations.

## Key Capabilities

1. **Hybrid Hosting Switcher**:
   - Seamlessly toggle between Local Machine (MacBook/Mac mini) and Cloud VPS (24/7 continuous cron).

2. **8-Tier Memory Architecture**:
   - `episodic`, `semantic`, `procedural`, `invariant`, `persona`, `working`, `user_pref`, `relational`.

3. **Sandboxed Credential Isolation**:
   - Sensitive keys are isolated in background keychain processes and never exposed to model prompts.

## Verification

```bash
# Doctor Status Check
bin/vellum --doctor

# Run Automated Test Suite
node tests/test-vellum-hybrid-engine.js

# Switch to Cloud Mode
bin/vellum --mode cloud

# Switch to Local Mode
bin/vellum --mode local
```
