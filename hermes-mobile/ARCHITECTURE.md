# Hermes Mobile — architecture

**Hermes Mobile** replaces Telegram DM and mirrors the operator surfaces of Hermes desktop/CLI — everything the gateway API server (`:8642`) exposes, plus optional **Hermes Mobile Agent** cloud relay for approvals on LTE.

## Naming

| Surface | Name |
|---|---|
| App Store / icon | **Hermes Mobile** |
| Product positioning | **Hermes Mobile Agent** — mobile operator client for Hermes on your Mac |
| Cloud relay | `https://hermes-mobile-cloud.fly.dev` |

## Gateway parity map

Hermes desktop/CLI talks to the same API server Hermes Mobile uses for Chat and Ops. Approvals can arrive via gateway WebSocket (tunnel) or cloud relay (LTE).

| Desktop / CLI | Hermes Mobile tab | API |
|---|---|---|
| Telegram DM threads | **Chat** | `/api/sessions`, `/api/sessions/:id/chat/stream` |
| Per-repo project lanes (mobile) | **Chat** project chips | local `chatProjects` store + `system_prompt` / `system_message` cwd pin |
| ThumbGate / gate approvals | **Leash** | WS `/v1/events` or relay `/v1/queue` |
| Skills, jobs, health | **Ops** | `/v1/skills`, `/api/jobs`, `/v1/health` |
| Tunnel + keys | **Settings** | stored locally (SecureStore + AsyncStorage) |

## Tabs

| Tab | Purpose |
|---|---|
| **Chat** | Telegram replacement — sessions, history, streaming; **project lanes** keep workspaces separate |
| **Leash** | Approve/reject risky tool calls (cloud relay or gateway WS) |
| **Ops** | Skills, cron jobs, toolsets via gateway API |
| **Settings** | Tunnel URL + API key (required for Chat); Hermes Mobile Agent pairing |

## Connection modes (Leash)

- **gateway** — WebSocket to tunnel URL; needs reachable `:8642` gateway
- **relay** — polls Hermes Mobile cloud relay; works on LTE after Mac pairing

## Local state

- `GatewayContext` — health, WS, relay poll, demo approvals
- `secureCredentials` — `API_SERVER_KEY`, relay mobile token
- `storage` — gateway settings (migrates legacy `agentleash` mode → `relay`)
