# Greptile AI code review — ThumbGate Mobile (Hermes)

[Greptile](https://www.greptile.com/) reviews pull requests with full-repo context. This repo configures it via version-controlled `.greptile/` folders (recommended July 2026 format).

**Product identity:** **ThumbGate Mobile** (Hermes app under `IgorGanapolsky/mac-yolo-safeguards`).

**Greptile org (canonical):** display name **ThumbGate Mobile** · dashboard slug currently [`hermes-mobile`](https://app.greptile.com/hermes-mobile) (rename display name in Organization Settings if it still says Hermes Mobile).

**Forbidden:** any Greptile org named or slug `saasgrowthdispatch` / `Saasgrowthdispatch` / SaaS Growth Dispatch. Do not bookmark, review, or document `app.greptile.com/saasgrowthdispatch/*`. That workspace is **not** this product. If Chrome opens it, switch org to **ThumbGate Mobile** / hermes-mobile immediately.

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

| Piece | Status (2026-07-15) |
|-------|---------------------|
| GitHub App **Greptile Apps** (`github.com/apps/greptile-apps`) | Installed on `@IgorGanapolsky` with **All repositories** (installation `92872628`) — this is the app that can review PRs |
| GitHub App **Greptile** (`github.com/apps/greptile`) | Also present (installation `146808081`) but **No repositories / No permissions** — leftover from marketplace install; not sufficient alone |
| Greptile dashboard | **[app.greptile.com/hermes-mobile](https://app.greptile.com/hermes-mobile)** — org **ThumbGate Mobile** (slug `hermes-mobile`) reviewing `IgorGanapolsky/mac-yolo-safeguards`. **Never** use `app.greptile.com/saasgrowthdispatch`. |
| Sample `@greptileai review` | Live reviews appearing on open Hermes Mobile PRs when plan/credits allow; some older PRs may show trial-ended until billing/free plan is confirmed under Organization → Billing |

- Pricing (public FAQ, July 2026): **$30/seat/month**, 50 review credits/seat; free plan up to 50 credits/month for one author; OSS free tier available on request.
- Operator path: [app.greptile.com/hermes-mobile](https://app.greptile.com/hermes-mobile) (ThumbGate Mobile) → Code Providers → GitHub `IgorGanapolsky` → Repositories → enable `mac-yolo-safeguards` → `@greptileai review`. If the UI says **Saasgrowthdispatch**, you are in the **wrong org** — switch away immediately.
- Config in this repo is live on merge regardless; Greptile reads `.greptile/` from the PR source branch once reviews run.

## Review focus (encoded in rules)

- Fresh-user onboarding / jargon ban  
- Tailscale vs USB dogfood  
- No `demo=1` false greens  
- Expo OTA vs native binary  
- Multi-Mac `API_SERVER_KEY` host↔key consistency  

## Related

- Root [AGENTS.md](../../AGENTS.md) — Greptile bullet under Dependency & PR hygiene  
- [hermes-mobile/AGENTS.md](../AGENTS.md) — mobile standing orders  
