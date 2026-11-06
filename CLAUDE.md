See [AGENTS.md](./AGENTS.md) — canonical directive for all AI agents in this repo.

For CEO PR, branch, and system-hygiene sessions, follow `docs/agents/shipping-and-hygiene.md` section “CEO PR and system-hygiene closeout”; do not replace its evidence gates with a canned completion claim.

## Code search

Use `grepai search "<intent in English>" --json --compact` first. Before changing a function, run `grepai trace callers "<symbol>" --json` (also `trace callees` and `trace graph`). Use Grep/Glob for exact strings or path patterns, and whenever grepai fails (not running, index unavailable, or a search error). Full usage: [docs/agents/code-search.md](./docs/agents/code-search.md).
