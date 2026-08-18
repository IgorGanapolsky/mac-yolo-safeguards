---
name: aspire-fleet-apphost
description: .NET Aspire-Style Code-First AppHost & Service Discovery Engine. Orchestrates distributed fleet services (ControlPlane, CloudRunner, LiteLLM, OTel, Zoekt) with topological startup DAGs, automated health discovery, and standardized resilience defaults.
---

# Aspire Fleet AppHost Skill

Implements the code-first AppHost & service discovery model from .NET Aspire (aspire.dev):
1. **Code-First Fleet Orchestration**: Declares all backend services, runners, proxies, and collectors in a unified AppHost.
2. **Topological Dependency DAG**: Computes dependency graphs (`litellm_proxy` $\rightarrow$ `cloud_runner` $\rightarrow$ `control_plane`) to ensure zero circular dependencies and proper startup ordering.
3. **Parallel Fleet Health Probing**: Real-time status, latency, and circuit breaker health telemetry across all services.

## Global System Commands

- **`bin/aspire-apphost --doctor`**: Diagnostic overview and computed startup DAG.
- **`bin/aspire-apphost --status`**: Probes real-time health across all fleet services.
- **`bin/aspire-apphost --json`**: Outputs structured health JSON for automated monitoring.

## Verification

```bash
# Doctor Status Check
bin/aspire-apphost --doctor

# Run Automated Test Suite
node tests/test-aspire-fleet-apphost.js

# Probe Live Fleet Status
bin/aspire-apphost --status
```
