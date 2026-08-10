# Three-Way Integration: GitHub Issues + Linear + Obsidian Vault

> Canonical, evidence-grounded protocol. August 2026. Mirrored to Linear
> `AGENT-353` (https://linear.app/igorganapolsky/issue/AGENT-353/...).
> Source of truth for *agent-owned* work state is Linear, not GitHub or Obsidian.

## Current local fact (verified, not invented)

Active Obsidian community plugins (committed in `AI-Agent-Sync/.obsidian/community-plugins.json`):
`ai-agent`, `obsidian-git`, `obsidian-local-rest-api`, `linear`.

**No GitHub-Issues-to-Obsidian sync plugin is active.** GitHub Issues are
surfaced only via Linear + manual vault linking. The three surfaces therefore
need a *layered* contract, not a fused one.

- GitHub = code/dev surface (issues tied to files/PRs, bisect correlation, external contributor drive-by).
- Linear (team IGO+AGENT, workspace `igorganapolsky/agent`, bridged by
  `tools/linear-agent-bridge.js`) = agent + product source of truth.
- Obsidian `AI-Agent-Sync` vault (git-canonical) = memory + brain.

## Research basis (Aug 2026)

- Linear official GitHub integration: commit linking + PR lifecycle automation + GitHub Issues sync (Linear Office Hours, ~41:22). Real value: every PR auto-links to its Linear issue and `Closes #N` resolves GitHub.
- `synclinear.com` (Cal.com / Neat.run): bidirectional Linear↔GitHub issue sync. Use only if the team needs GitHub-side issue state to mirror Linear; otherwise skip to avoid sync drift.
- `casals/obsidian-linear-integration-plugin`: create/sync/manage Linear issues from Obsidian (autocomplete, conflict resolution, auto label creation). Read+embed only for us; never authoritative.
- `ampersarnie/linear-obsidian-plugin`: embed Linear issues / sync to-dos into notes.
- `obsidian-github-issues-pr-integration` community pattern: surface GitHub issues/PRs into Obsidian as linked references — does NOT require GitHub to be the sync source. Exactly our model.

## Layered contract

1. **Code/dev surface — GitHub.** File a GitHub Issue for: bugs needing code correlation, dependency/drive-by external PRs, anything a `git blame`/`bisect` should reach. Use Linear's GitHub integration (commit linking) so commits/PRs auto-connect; in PR bodies use `Closes #<github>` to resolve GitHub Issues.
2. **Agent + product surface — Linear.** `linear-agent-bridge.js` owns issue assignment + state. Vault `Handoffs/linear-claims/<date>_AGENT-NNNN_<agent>.md` mirrors each Linear change. Linear owns **issue** assignment; vault `Agent-State/<agent>.md` owns in-flight **file** claims. One-way claim contract.
3. **Memory + brain surface — Obsidian vault.** `git` is canonical (`github.com/IgorGanapolsky/AI-Agent-Sync`, private). Humans edit via `obsidian-git` / `obsidian-local-rest-api` heading-scoped PATCH; agents commit via terminal + PR (`scripts/verify_central_vault.sh` passes). The Obsidian `linear` plugin embeds Linear issues into notes but does NOT lock — the bridge is authoritative.

## Rules (non-negotiable)

- **R1 — No GitHub lock authority.** GitHub↔Linear is a one-way mirror for agents: `github → linear` via commit linking; `linear → github` via PR body `Closes #N`. Never let a sync plugin mutate Linear state that `linear-agent-bridge.js` owns.
- **R2 — Lease before edit.** `Agent-Jobs/running/` file-claim lease precedes any edit a code file another agent has claimed. Prevents races that GitHub/Linear sync cannot see. (Worktrees isolate edits only — the lease model is the real guard.)
- **R3 — Obsidian Linear plugin is read+embed.** Do not rely on it for authoritative state; embed issues into notes for cross-reference only.
- **R4 — No GitHub-Issues tracker plugin.** GitHub Issues surface into the vault as linked references (inline `[[GH-#N]]` / Dataview query), never as a synced table. Keep `community-plugins.json` as the install list; do not add a GH-issues plugin.
- **R5 — Commit discipline (VAULT_SETUP.md §3).** Branch `agent/<project>-<task>-<date>` → edit → `git add <specific-files>` → commit → PR → `verify_central_vault.sh` → merge. No `git add -A`. Direct `main` pushes are not the operating model.

## New-machine onboarding (concise)

1. `git clone https://github.com/IgorGanapolsky/AI-Agent-Sync.git ~/Documents/AI-Agent-Sync`
2. Set `OBSIDIAN_VAULT_PATH` in `~/.hermes/.env` or shell profile.
3. Open in Obsidian → Settings → Community plugins → install from `community-plugins.json`.
4. `obsidian-git`: auto-pull on startup ON, interval 5 min, push after commit ON (desktop only).
5. `git config user.name "Hermes Agent"` for an auditable trail.
6. Pre-flight each agent session: `python3 scripts/agent_session_sync.py preflight --project <Name>`.

## See also

- `VAULT_SETUP.md` — full sync + commit discipline.
- `AGENTS.md` — agency operating model + real-money integrity mandate (cash only on non-owner Stripe subscription).
- `linear-agent-bridge.js --help` — `--claim`/`--done`/`--create`/`--update` usage.
- `scripts/verify_central_vault.sh` — vault health + plugin enablement checks.
