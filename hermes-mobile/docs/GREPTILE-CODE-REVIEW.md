# Greptile AI code review — Hermes Mobile

[Greptile](https://www.greptile.com/) reviews pull requests with full-repo context. This repo configures it via version-controlled `.greptile/` folders (recommended July 2026 format).

## Config locations

| Path | Role |
|------|------|
| [`.greptile/`](../../.greptile/) | Repo-wide strictness, ignore patterns, Hermes connect/onboarding rules |
| [`hermes-mobile/.greptile/`](../.greptile/) | Cascading overrides for app code (single-CTA, auth-Connected, Maestro composer) |

Docs Greptile is pointed at: `files.json` in those folders (AGENTS.md, REAL-USER-READINESS, PREVENT-RECURRENCE, OTA, Tailscale).

## What agents must do

1. **Treat Greptile comments as required context** on connect/onboarding/auth/OTA PRs — read them before claiming fixed/shipped (same honesty bar as Jest + `latest.json`).
2. **Do not dismiss** findings that match recurrence classes in [PREVENT-RECURRENCE-JULY-2026.md](./PREVENT-RECURRENCE-JULY-2026.md) without evidence.
3. **Force a review** after the GitHub App is installed: comment `@greptileai review` on the PR (or add a label if dashboard labels are configured).
4. **Skip noise** with label `greptile-skip` or `docs-only` when a PR is intentionally out of Greptile scope.

## Install status (operators)

GitHub App: [github.com/apps/greptile](https://github.com/apps/greptile)

- Pricing (public FAQ, July 2026): **$30/seat/month**, 50 review credits/seat; free tier for qualified open-source — contact Greptile for OSS eligibility on this public repo.
- Install cannot be completed via `gh` API alone; it requires a logged-in GitHub **Install** + occasional **sudo/passkey** confirmation.
- After install: enable `IgorGanapolsky/mac-yolo-safeguards` (or all public repos), wait for indexing, then `@greptileai review` on an open PR.

## Review focus (encoded in rules)

- Fresh-user onboarding / jargon ban  
- Tailscale vs USB dogfood  
- No `demo=1` false greens  
- Expo OTA vs native binary  
- Multi-Mac `API_SERVER_KEY` host↔key consistency  

## Related

- Root [AGENTS.md](../../AGENTS.md) — Greptile bullet under Dependency & PR hygiene  
- [hermes-mobile/AGENTS.md](../AGENTS.md) — mobile standing orders  
