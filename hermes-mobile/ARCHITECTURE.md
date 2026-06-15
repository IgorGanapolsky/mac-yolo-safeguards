# Hermes Mobile Architecture

**Hermes Mobile** replaces Telegram DM and mirrors the operator surfaces of Hermes desktop/CLI — everything the gateway API server (`:8642`) exposes, plus optional AgentLeash for approvals on LTE.

---

## 1. Parity map (desktop / CLI vs mobile)

| Surface | Desktop web dashboard | CLI (`hermes …`) | Gateway `:8642` API | Mobile tab |
| :--- | :---: | :---: | :---: | :--- |
| Chat + sessions | Chat, Sessions | `hermes`, sessions list | `/api/sessions`, `/chat/stream` | **Chat** |
| Streaming + tool progress | Chat | TUI stream | SSE events | **Chat** (stream + tool line) |
| Tool / run approvals | — | interactive | `/v1/runs/…/approval`, WS `/v1/events` | **Leash** |
| Skills list | Skills | `/skills list` | `GET /v1/skills` | **Ops** |
| Toolsets | Tools config | config | `GET /v1/toolsets` | **Ops** |
| Cron jobs | Cron | `hermes cron` | `/api/jobs` | **Ops** (list, pause, run) |
| Gateway health | Sidebar status | `hermes status` | `/health/detailed` | **Ops** + Settings |
| Runs (stop) | Chat | — | `POST /v1/runs/{id}/stop` | Chat (stream path) |
| Config / env / profiles | Config, Env, Profiles | `hermes config` | — (dashboard port) | Future / deep link |
| Files / logs / analytics | Files, Logs, Analytics | CLI | — (dashboard port) | Future |
| MCP / channels / webhooks | MCP, Channels, Webhooks | gateway setup | — (dashboard port) | Future |

**Honest boundary:** The web dashboard runs on a separate HTTP server with session-token auth and hundreds of `/api/*` routes. Mobile targets the **same gateway tunnel** you use for Telegram (`API_SERVER_KEY` on port 8642). Full dashboard parity means either tunneling the dashboard port too or adding a thin mobile admin API later.

---

## 2. App tabs

| Tab | Purpose |
| :--- | :--- |
| **Chat** | Sessions, history, send, **streaming** replies, live tool-call status |
| **Leash** | Approve/reject risky tool calls (AgentLeash relay or gateway WS) |
| **Ops** | Skills, toolsets, cron jobs, capability flags, health pill |
| **Settings** | Tunnel URL + API key (required for Chat); AgentLeash pairing |

---

## 3. Gateway API client layer

| Module | Endpoints |
| :--- | :--- |
| `hermesChatClient.ts` | Session CRUD, messages, sync chat |
| `hermesGatewayClient.ts` | Capabilities, skills, toolsets, jobs, stream chat, run stop/approval, fork/delete session |
| `gatewayClient.ts` | Health probes, WS `/v1/events`, ThumbGate events |

Discover features at runtime: `GET /v1/capabilities`.

---

## 4. Phased roadmap

| Phase | Scope |
| :--- | :--- |
| **v0.1 (current)** | Chat + stream, Leash, Ops (skills/jobs/toolsets), Settings |
| **v0.2** | Push notifications for approvals; session fork/delete in Chat UI |
| **v0.3** | Dashboard tunnel profile (read-only config/status) or native tunnel module |
| **v0.4** | Files viewer, log tail, analytics cards (dashboard APIs) |

---

## 5. Local development

```sh
cd hermes-mobile
npm install
npm run typecheck
npm run test:ci
npx expo start
```

Mac: `API_SERVER_ENABLED=true`, `API_SERVER_KEY` in `~/.hermes/.env`, `hermes gateway start`, tunnel `ngrok http 8642`.
