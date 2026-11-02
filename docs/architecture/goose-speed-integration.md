# MacYolo Safeguards & Agent Harness Integration Plan
## Inspired by Goose AI (https://goose-docs.ai/) & West Monroe "Why Speed Matters"

This document outlines the architectural enhancements integrated from Goose AI and West Monroe into the `mac-yolo-safeguards` and Poolside agent harness ecosystem.

---

## 1. Architectural Takeaways from Goose AI

### A. Agent Client Protocol (ACP) Integration
- **Concept**: Standardized JSON-RPC/ndjson streaming protocol connecting an application interface (or desktop UI) to an isolated agent backend (`goose acp` or custom harness servers).
- **Implementation in `mac-yolo-safeguards`**:
  - Expose harness capabilities and session management over structured ndjson pipes (`tools/acp-bridge.js` or WebSocket endpoints).
  - Enable external UIs (such as HUDs and agent mesh dashboards) to stream agent thinking chunks, tool calls, and permission requests without tight coupling.

### B. Recipe-Based Task Execution
- **Concept**: YAML/JSON-based packaging of instructions, prompts, extensions, parameters, and validation retry hooks (`recipe.yaml`).
- **Implementation in `mac-yolo-safeguards`**:
  - Added recipe schema support in `tools/recipes/` to define self-contained workflows with success validation checks (`type: shell`, `command: ...`).
  - Enable reproducible, one-click execution of maintenance routines, security audits, and deployment guardrails.

### C. Extension & Session Management
- **Concept**: Modular extensions (MCP servers, tool bundles) dynamically loaded per session, keeping core runtimes lightweight and secure.

---

## 2. Velocity Insights from West Monroe ("Why Speed Matters")

- **Cycle Time Reduction**: Minimizing feedback loops via continuous agent monitoring, pre-action validation gates (`ThumbGate`), and automated verification.
- **Throughput Maximization**: Utilizing local model optimization (`Laguna-XS-2.1` with PagedAttention and DFlash speculative decoding) to double inference throughput while maintaining context fidelity.
