# Ship browser-verified ThumbGate WebMCP tools without authority bypass

<!-- source: GitHub Issue | id: 2146 | closed: 2026-10-28T22:22:07Z -->

## Question

PR #2142 registers a high-ROI WebMCP surface, but independent Chrome Stable 151 verification discovers the tools and then fails every execution because handlers assume a second execution-options argum

## Answer

- Exact tested head: `07a691be89b5c12082e0aa9a2950a2040b968cbc`
- Browser: Chrome `151.0.7922.174`
- Capability: secure context, origin-agent-cluster, registration, and discovery pass
- Runtime: checkout preview and workspace-status execution fail with `TypeError: Cannot destructure property signal of undefined`
- Review evidence: #2142 open P1/P2 threads

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/2146)

---
