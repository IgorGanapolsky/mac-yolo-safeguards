See [AGENTS.md](./AGENTS.md) — canonical directive for all AI agents in this repo.

For CEO PR, branch, and system-hygiene sessions, follow `docs/agents/shipping-and-hygiene.md` section “CEO PR and system-hygiene closeout”; do not replace its evidence gates with a canned completion claim.

## Code search

Use `grepai search "<intent in English>" --json --compact` first, and `grepai trace callers|callees|graph "<symbol>" --json` before changing a function. Use Grep/Glob only for exact strings or path patterns, or when grepai is down. Full usage: [docs/agents/code-search.md](./docs/agents/code-search.md).
