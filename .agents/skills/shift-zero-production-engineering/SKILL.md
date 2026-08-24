---
name: shift-zero-production-engineering
description: Production AI engineering disciplines (intentional multi-tenant DynamoDB/vector retrieval, shift-zero in-prompt threat modeling, and AI tech debt lifecycle governance) for autonomous coding agents.
trigger: ["shift-zero", "ai-tech-debt", "intentional-retrieval", "vector-provenance", "threat-modeling", "approval-ladder"]
---

# Shift-Zero Production Engineering & Intentional Retrieval Governance

Implements the three core pillars of production AI systems:

1. **Intentional Multi-Tenant Retrieval Layer**:
   - DynamoDB-style vector document schemas (`tenantId`, `documentId`, `chunkId`, `embedding`, `sourcePath`, `contentVersion`, `accessControl`).
   - Tenant boundary isolation with role-based metadata filtering.
   - Built-in evaluation benchmark suite computing Recall@k, Precision@k, and MRR.
   - Transparent provenance tracking and source citations.

2. **Shift-Zero Security & In-Prompt Threat Modeling**:
   - Treats all retrieved text, web scrapes, and external input as untrusted.
   - In-prompt threat scanner: detects prompt injection, instruction overrides, and jailbreak tags.
   - Data exfiltration firewall: prevents untrusted documents from triggering external network calls.
   - Secret leak scanner: validates context and tool arguments for API keys, AWS credentials, and JWT tokens before dispatch.

3. **AI Tech Debt Register & Lifecycle Governance**:
   - Comprehensive workflow inventory of coding agents, RAG apps, automations, tool integrations, and credentials accessed.
   - AI Tech Debt Register: tracks generated artifacts with owners, business purpose, prompt version, test coverage %, risk level, and review-by dates.
   - Automated debt audit: detects unowned prototypes, overdue reviews, and unverified generated code.

4. **Internal Engineering Knowledge Agent with Gated Approval Ladder**:
   - Grounded read-only retrieval across internal runbooks.
   - Cryptographic approval ladder holding side-effecting write actions in `pending_approval` until verified by human operators.

## Verification & Usage

```bash
# Run all shift-zero production tests
node tests/test-shift-zero-production-engineering.js

# Run standalone tools
node tools/shift-zero-security-guard.js
node tools/intentional-retrieval-engine.js
node tools/ai-tech-debt-register.js
node tools/engineering-knowledge-agent.js
```
