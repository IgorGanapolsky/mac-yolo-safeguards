---
name: island-agentic-dlp-governance
description: Enterprise Agentic Control Plane, in-flight browser DLP guard, zero-trust session boundary interdiction, and VDI reduction engine stolen from Island.io.
trigger: ["island", "dlp", "zero-trust", "enterprise browser", "agentic control plane", "data loss prevention", "pii masking", "vdi reduction"]
---

# island-agentic-dlp-governance

Enterprise Agentic Control Plane & In-Flight Browser DLP Engine (stolen from Island.io).

## Core Capabilities
1. **Real-Time DLP Sanitizer**: Automatic masking of PII (SSN, credit cards with Luhn check, emails, phone numbers) and Secrets (OpenAI/Anthropic API keys, GitHub PATs, AWS credentials, JWTs, Slack tokens, private keys) before outbound dispatch to LLMs.
2. **Zero-Trust Fenced Sandboxing**: Ephemeral session boundary validation preventing prompt injection data exfiltration.
3. **Audit Receipts**: Emits ISO 42001 & SOC 2 cryptographic DLP receipts for every agent interaction.
4. **VDI Reduction**: Lightweight micro-sandboxing replacing $50/mo cloud VDI instances.

## Verification & Usage
```bash
node tools/hermes-agentic-dlp-guard.js
node tests/test-hermes-agentic-dlp-guard.js
```
