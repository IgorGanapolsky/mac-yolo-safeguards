# fix(mcp,security,revenue): repair MCP config, burn down 7 CodeQL alerts, remove dangling business_os symlink, and add 24/7 promotion engine

<!-- source: Merged PR | id: 2206 | closed: 2026-10-29T14:02:17.964Z -->

## Question

fix(mcp,security,revenue): repair MCP config, burn down 7 CodeQL alerts, remove dangling business_os symlink, and add 24/7 promotion engine

## Answer

Summary

- **MCP (`.mcp.json`)**: Route `github` through `github-mcp-stdio` (reads `gh auth token` from Keychain instead of sending empty `Bearer ${GITHUB_MCP_PAT}` -> HTTP 400), point `grepai` at `/Users/iganapolsky/.hermes/semantic-index/mac-yolo-safeguards`, route `gurobi` through `gurobi-mcp` in `$PATH`, and remove unauthenticated `semrush` (HTTP 401).
- **Repo Hygiene**: Remove tracked dangling symlink `business_os -> /Users/igorganapolsky/...` and add automatic `~/.hermes/business_os/reven

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2206)

---
