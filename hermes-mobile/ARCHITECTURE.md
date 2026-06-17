# Hermes Mobile — architecture

**Hermes Mobile** replaces Telegram DM and mirrors Hermes desktop/CLI (`:8642`).

| Field | Value |
|---|---|
| Android package / iOS bundle | `com.iganapolsky.hermesmobile` |
| Cloud relay | `https://hermes-mobile-cloud.fly.dev` |
| Firebase app | `1:587028054730:android:00258f23e47d56f6772a33` on `openclaw-console-mobile-8d53d` |

## Tabs

| Tab | Role |
|---|---|
| **Chat** | Sessions, streaming replies |
| **Leash** | ThumbGate approve/reject |
| **Ops** | Cron jobs, skills, health |
| **Settings** | Gateway tunnel + Mac pairing |
