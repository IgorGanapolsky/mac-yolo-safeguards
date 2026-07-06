# Hermes Mobile — Notification UX (July 2026)

Actionable principles for run, approval, and result notifications. Grounded in Android 16 Live Updates / `Notification.ProgressStyle`, iOS Live Activities patterns, and agentic-app UX research.

## Core rules

1. **Title = WHAT** — project name + first prompt snippet or active tool/step. Never generic "Hermes is working".
2. **Body = PROGRESS** — elapsed time · current step · computer name. One glance should answer "which task, how far, where".
3. **Separate channels** — `hermes-runs` (live, low priority), `hermes-results` (done/stall), `hermes-approvals` (high, actionable). Connectivity/relay-pairing copy never belongs in the runs channel.
4. **Foreground suppress** — while app is active or Chat is foreground, dismiss sticky run notifications and hide duplicate in-app run banners; progress lives in the chat transcript.
5. **Actionable completion** — done notifications get "View output"; in-progress keeps "Stop Run" + "Open chat".

## Platform alignment (2026)

| Platform | Pattern | Hermes mapping |
|----------|---------|----------------|
| Android 16 | Progress-centric / Live Updates (`Notification.ProgressStyle`) | Sticky low-priority run channel; title/body update every ~8s with step + elapsed |
| Android 15+ | Typed foreground services, user-initiated work only | Runs start from explicit Send; notification is the user-visible surface |
| iOS 17.2+ | Live Activities (GitHub Mobile agent sessions) | Passive run updates; active interruption on completion/stall |
| Agentic UX | Execution progress view, dynamic checklist | Show concrete step ("Running web search") not spinner copy |

## Reference apps

- **GitHub Mobile (Feb 2026):** Live agent notifications show PR title + state (In progress / Completed / Failed). Tap-through to the artifact.
- **Linear / Slack:** Rich unfurls with entity name + status; batch summaries only when count ≥ 2.
- **ChatGPT / Cursor:** Long runs surface step labels; completion includes one-line outcome, not "Task complete".

## Copy templates

| State | Title | Body |
|-------|-------|------|
| Running | `{project} · {prompt≤36}` | `{elapsed} · {step} · {computer}` |
| Streaming | `{project} · {prompt≤36}` | `{elapsed} · Writing reply · {computer}` |
| Approval | `{project} · Needs approval` | `{elapsed} · Waiting for approval · {computer}` |
| Done | `Done · {project}` | `{outcome one-liner} · {computer}` |
| Stalled | `{project} · No updates` | `No updates from {computer} for 45s…` |

## Do not

- Put relay-pairing or connectivity errors in the live-run notification (suppress or route to connection UI).
- Repeat "on your computer" when the computer name is already in the body.
- Use raw SSE event names (`tool.started`, `provider.waiting`) in user-visible notification text.

## Implementation map

- Builders: `src/utils/runNotificationContent.ts`
- Context (project/prompt/computer): `src/services/runNotificationContext.ts` — set on Send from `ChatScreen`
- Scheduler + channels: `src/services/hermesNotifications.ts`
- Foreground policy: `src/utils/smartNotificationPolicy.ts`

## Verification

```bash
cd hermes-mobile
npm test -- --testPathPattern='runNotificationContent|hermesNotifications' --watchman=false
```

Background a run with app minimized; notification title should name the vault project and prompt, body should show elapsed + step + computer — not relay-pairing noise.
