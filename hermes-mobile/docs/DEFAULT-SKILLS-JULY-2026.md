# Default Skills / Toolsets — July 2026 (Hermes Mobile)

**Status:** Product contract for Settings → Essentials / On your Mac  
**Research run:** `trun_5fb9422f44014c4b9ae1ebae05292450`  
**Raw report:** `parallel-research/hermes-mobile-default-skills-july-2026.md`

## Where the Settings list comes from

| Layer | Path | Role |
|-------|------|------|
| UI | `GatewayOpsSection.tsx` | Renders Essentials + collapsed **On your Mac** |
| Client | `hermesGatewayClient.listToolsets` → `GET {gateway}/v1/toolsets` | Live catalog from the paired Mac Hermes gateway (`:8642`) |
| Policy | `opsToolsets.ts` | Allowlist, auto-enable, partition, Add-key rules |
| Mac config | `~/.hermes/config.yaml` `platform_toolsets.api_server` + `~/.hermes/.env` | Enablement + credentials (Mac-canonical) |

This is **not** a hardcoded Spotify/Discord catalog in the app. The phone dumps whatever the Mac gateway advertises. Before this contract, `configuredToolsetsToAutoEnable` turned **every** `configured: true` toolset ON for Chat — so Igor's personal Mac zoo (Spotify, Discord, …) lit up for strangers pairing to a dogfood gateway, and unconfigured Home Assistant showed **Add key**.

Live probe (2026-07-22, local `:8642`): 25 toolsets including `session_search`, `clarify`, `delegation`, `cronjob`, `homeassistant`, `spotify`, `discord`, `discord_admin`.

## Product decision (real users)

Hermes Mobile value prop: **connect to your Mac → chat → leash approvals → schedule jobs**.  
Consumer hobby integrations (Spotify, Discord, Home Assistant) are **optional** on Hermes Agent mid-2026 and must not clutter primary Settings or auto-enable for phone Chat.

Deep research verdict (July 2026): Spotify / Discord / Home Assistant live under Hermes Agent **optional-skills** and are OFF unless explicitly installed; HA uses a long-lived bearer `HASS_TOKEN` (high blast radius). OpenClaw-style clients prefer explicit allowlists over silent zoo dumps. Citations in the Parallel report.

## Essentials allowlist (default-ON when configured)

Implemented as `ESSENTIAL_MOBILE_TOOLSET_NAMES` in `src/utils/opsToolsets.ts`:

| Name | Why |
|------|-----|
| `session_search` | Search past conversations |
| `clarify` | Clarifying questions in chat |
| `delegation` | Task delegation |
| `cronjob` | Scheduled jobs (paired with Cron jobs section) |
| `memory` | Cross-session continuity |
| `todo` | Task planning |
| `skills` | List/view Mac skills from chat |
| `terminal` | Remote Mac shell (core remote-control) |
| `file` | Read/write/search on Mac |
| `web` | Search / extract |
| `browser` | Browser automation on Mac |
| `computer_use` | Desktop control (gated by Leash) |
| `code_execution` | Run code on Mac |

**Auto-enable:** only essentials with `configured === true` and `enabled !== true` get `PUT /v1/toolsets/{name}`.

## Demote / hide

| Rule | Behavior |
|------|----------|
| Hobby names (`homeassistant`, `spotify`, `discord`, `discord_admin`, `yuanbao`) | Never auto-enable; never show **Add key** on mobile |
| Non-essential + unconfigured + disabled | Hidden from Settings entirely |
| Non-essential + configured or already enabled | **On your Mac** section, collapsed by default |

## Tests

- `opsToolsets.test.ts` — allowlist + partition + auto-enable + no hobby Add key  
- `GatewayOpsSection.test.tsx` — primary list hides hobby; advanced collapsed; essentials auto-enable only
