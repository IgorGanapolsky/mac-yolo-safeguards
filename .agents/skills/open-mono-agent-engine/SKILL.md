---
name: open-mono-agent-engine
description: OpenMonoAgent.ai Zero-Meter Local Agent Architecture, Hardware-Aware Quantization Selector, Sensitive File Shield, Dual-Box Mobile Companion Relay, and Roslyn-Inspired Local AST Code Intelligence.
---

# OpenMonoAgent.ai High-ROI Skill

Implements the core ideas stolen from **StartupHakk/OpenMonoAgent.ai**: *"AI shouldn't have a meter. Unlimited tokens. Forever."*

## 5 High-ROI Pillars

1. **Zero-Meter Hardware-Aware Inference**:
   - Detects Apple Silicon Metal unified RAM (48GB), Linux CUDA, and CPU core topology.
   - Automatically selects optimal model quantization (Q4_K_M, Q8_0, FP16) and parameter scale (7B, 14B, 27B-32B, 70B).
   - Enforces $0.00 marginal cost forever.
2. **Sensitive File & Secret Shield (Container-Grade Process Isolation)**:
   - Fail-closed path isolation blocking agent access to `~/.ssh/`, `~/.aws/`, `~/.gnupg/`, `.env*`, `*.pem`, `*.key`, and credentials.
3. **Dual-Box Mobile Companion Relay**:
   - Remotely control your local Mac / GPU inference workstation directly from Hermes Mobile on iOS/Android.
   - Cryptographic pairing, biometric leash gating, and zero-cloud direct tunneling.
4. **Deep AST Code Intelligence & Symbol Graph (Roslyn-Inspired)**:
   - High-throughput local AST analysis extracting functions, classes, imports, and exports without cloud tokens.
5. **Deterministic Typed Playbooks & Autonomy Gates**:
   - Composable multi-step task execution with rollback barriers.

## CLI Usage

```bash
# Health check OpenMono zero-meter agent architecture
bin/mono-agent doctor

# Verify sensitive file shield interdiction
bin/mono-agent shield --check-path ~/.ssh/id_rsa

# Check Dual-Box mobile companion relay status
bin/mono-agent dual-box

# Extract local AST symbol graph with zero cloud token cost
bin/mono-agent ast --file tools/system-wide-harness.js

# Run deterministic typed playbook
bin/mono-agent playbook --run code_audit
```

## Programmatic Interface

```javascript
const {
  detectHardwareProfile,
  evaluatePathSecurity,
  getDualBoxRelayStatus,
  extractCodeIntelligence,
  runPlaybook,
  runDoctor,
} = require('./tools/open-mono-agent-engine');
```
