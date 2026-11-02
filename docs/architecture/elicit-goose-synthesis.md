# Architectural Synthesis: Elicit & Goose AI Integration for Mac-Yolo Safeguards

This document synthesizes key architectural patterns from **Elicit** (academic/clinical research agent workflows, MCP server transport, session lifecycle management with incremental polling, systematic reviews, and artifact generation) and **Goose AI** (ACP support, session state persistence, extension management, and recipe-based task execution) into the `mac-yolo-safeguards` agent harness.

---

## 1. Elicit-Inspired Research Agent & MCP Patterns

### A. HTTP Transport MCP Integration
Elicit provides a production MCP server accessible over HTTP transport (`https://elicit.com/api/mcp`) with OAuth 2.0 authentication. 
- **Integration into Mac-Yolo**: Standardize remote domain tool invocation using SSE/HTTP transport definitions in our MCP client configurations (`~/.config/poolside/settings.yaml` and Claude/Cursor settings).
- **Incremental Event Polling**: For long-running asynchronous agent tasks (such as code audits or multi-file refactoring runs), adopt Elicit's cursor-based event polling model (`get_agent_session_events` with opaque `cursor`, checkpointing, and deduplication by `eventId`).

### B. Systematic Review & Research Workflows
- **Multi-stage Pipelines**: Mimic Elicit's structured separation of Search → Screening → Extraction → Reporting in our automated code and security audit pipelines (e.g., CodeQL / security scan ingestion, filtering false positives, extracting metrics, and generating executive reports).

---

## 2. Goose AI Architectural Patterns

### A. Recipe-Based Task Execution
- Define repeatable, declarative JSON/YAML workflow "recipes" for common multi-step engineering tasks (e.g., bug fix loop, security audit, dependency upgrade).
- Execute recipes deterministically through an orchestrator loop with strict pre- and post-condition gates.

### B. Extension Management & Session State Persistence
- Modularize agent tools and integrations into pluggable extensions with explicit capability manifests.
- Maintain durable session state in local SQLite stores (`~/.dayglass/dayglass.sqlite` or `.thumbgate/state.json`) enabling seamless resume and audit trail reconstruction.

---

## 3. Implementation Status in Mac-Yolo Safeguards
- **Disposable Agent Lifecycle**: Implemented (`tools/disposable-agent.js`, `docs/architecture/disposable-agents.md`).
- **Goose Speed & Architecture Integration**: Documented (`docs/architecture/goose-speed-integration.md`).
- **MCP & HTTP Transport Readiness**: Configured across harness settings.
