# agent-device (Callstack) — Hermes Mobile

Upstream: [callstack/agent-device](https://github.com/callstack/agent-device) · [Agent setup](https://oss.callstack.com/agent-device/docs/agent-setup) · [Installation](https://oss.callstack.com/agent-device/docs/installation)

`agent-device` is the AI-agent device CLI (snapshots, refs, screenshots, Maestro-compatible replay). Hermes already pins it as a **devDependency** (`agent-device@^0.19.3`) with npm scripts `device`, `e2e:fast*`, and `e2e:accelerated` (`scripts/run-agent-device-e2e.sh`). This doc is the **when / how** for agents — not a second install path.

## Install on Igor's Mac

```bash
# From repo root — pins CLI to package.json, links Cursor skills, runs doctor
bash scripts/install-agent-device.sh
```

Also refreshes Callstack RN skills:

```bash
bash scripts/install-callstack-agent-skills.sh
```

Verify:

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
agent-device --version   # expect 0.19.3 (or hermes-mobile lockfile pin)
agent-device doctor
agent-device help workflow
```

Binary locations agents should try (in order):

1. `agent-device` on PATH (`~/.npm-global/bin` after install)
2. `hermes-mobile/node_modules/.bin/agent-device` (project-local)

Do **not** have agents run `npx -y agent-device@latest` (mutable package; Callstack guidance).

Optional MCP (Cursor): after install, `.cursor/mcp.json` may include:

```json
"agent-device": { "command": "/Users/…/.npm-global/bin/agent-device", "args": ["mcp"] }
```

Skills land under `.cursor/skills/agent-device` and `.cursor/skills/dogfood` (copied from the installed npm package).

## When to use agent-device vs Maestro vs adb

| Need | Tool | Why |
|------|------|-----|
| Connection crisis / Tailscale / fresh-user UI **inspection** | **agent-device** | Semantic snapshot + screenshot; agent chooses next tap |
| “Is chat Connected / which Mac·transport?” proof | **agent-device** (`scripts/agent-device-connection-proof.sh`) | Fast exploratory evidence under `docs/proofs/agent-device/` (gitignored) |
| Ship / CI / continuous LaunchAgent gate | **Maestro** (`npm run e2e:*`, `latest.json`) | Deterministic YAML; `e2e=pass` is the only ship language for device UX |
| Accelerated Maestro replay locally | **agent-device** `npm run e2e:accelerated` | Same flows via `agent-device test --maestro` (T-25 owns scroll-compat on nav/ship-guard) |
| Pair, install release APK, `adb reverse` | **adb** + `node tools/hermes-mobile-pair.js` | Infrastructure — not UI truth |
| RN perf / FPS / lists | Callstack **react-native-best-practices** skill + measure | Different problem than connection UI |

**Rule:** `agent-device` proves what the screen shows **now**. Maestro continuous `latest.json` proves the **regression suite**. Never claim “device verified” from agent-device alone when `e2e≠pass`.

## How agents invoke it

### Connection / Tailscale proof (preferred)

```bash
export PATH="$HOME/.npm-global/bin:$PATH"
ANDROID_SERIAL=R3CY90QPM7E bash hermes-mobile/scripts/agent-device-connection-proof.sh
# → hermes-mobile/docs/proofs/agent-device/connection-latest/summary.json
```

### Manual loop (Chat tab)

```bash
agent-device open com.iganapolsky.hermesmobile --platform android --serial R3CY90QPM7E --session hermes --relaunch
agent-device press 'label="Hermes"' --session hermes --settle
agent-device snapshot --session hermes
agent-device screenshot ./artifacts/hermes-chat.png --session hermes
agent-device close --session hermes
```

### Tailscale app

```bash
agent-device open com.tailscale.ipn --platform android --serial R3CY90QPM7E --session ts --relaunch
agent-device snapshot --session ts
agent-device close --session ts
```

### iOS Simulator

Supported when a simulator is booted (`agent-device doctor` lists Apple devices). Use `--platform ios` and the Hermes bundle id `com.iganapolsky.hermesmobile`. Prefer Android USB phone for real-user Tailscale proofs.

### Accelerated Maestro (existing)

```bash
cd hermes-mobile
npm run e2e:accelerated          # scripts/run-agent-device-e2e.sh
# or
npm run e2e:fast:android
```

Release preflight already calls accelerated E2E when an adb device is present (`SKIP_ACCELERATED_E2E=1` to skip).

## Live proof (2026-07-15, phone `R3CY90QPM7E`)

Ran after `npm install -g agent-device@0.19.3` + `agent-device doctor` (pass).

| Surface | Evidence |
|---------|----------|
| Leash tab | `Gateway unknown` / `Hermes relay not paired` |
| Chat tab | Header **`Igors-MacBook-Pro · Tailscale`** + **`Reconnecting…`**; empty state “Trying to reach Igors-MacBook-Pro automatically…” |
| System UI | Status accessibility: **`VPN on.`** + Tailscale notification |
| Tailscale app | Opened `com.tailscale.ipn`; account `iganapolsky@gmail.com` visible |

Artifacts (local, gitignored): `hermes-mobile/docs/proofs/agent-device/connection-20260715/`.

Honest read: transport label is Tailscale; link was **reconnecting**, not green Connected. That is still valid connection-crisis evidence for agent-device.

## Related

- [AGENTS.md](../AGENTS.md) — standing mobile obligations
- [TESTING.md](./TESTING.md) — Maestro / continuous ladder
- [PREVENT-RECURRENCE-JULY-2026.md](./PREVENT-RECURRENCE-JULY-2026.md) — session gates
- Repo Callstack skills installer: `scripts/install-callstack-agent-skills.sh`
