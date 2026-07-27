# Session continuity handoff (July 2026)

When a Hermes Mobile chat grows into a mega-session (or the user taps **Start fresh chat**), the transcript is intentionally discarded so the model stops drifting. Continuity is preserved via a short, secret-safe handoff — not by forking the huge thread.

## What the user sees

1. Tap **Start fresh chat** (mega banner, empty-stream CTA, or menu).
2. No banner / no **Dismiss** — resume is seamless. Prior context is restored under the hood.
3. The next send injects a system section `Continue from handoff` with last goal, workspace/vault lane, open todos, last assistant clip, prior session id, and Mac name.
4. Saying **pick up where you left off** (or similar) also forces that handoff into context. The session title is **not** auto-retitled to that phrase — it uses the last goal instead.

## Where it is stored

| Location | Role |
|----------|------|
| Phone AsyncStorage | Immediate UX + offline inject |
| Obsidian vault `Handoffs/hermes-mobile-last.md` | Canonical cross-agent continuity |
| `~/.hermes/mobile-session-handoff.md` (+ `.json`) | Gateway-local mirror (MEMORY.md is **not** rewritten) |
| Pair server `:8765/session-handoff` (POST) / `/session-handoff.json` (GET) | Phone ↔ Mac sync |

## Why MEMORY.md is untouched

`~/.hermes/memories/MEMORY.md` is a long-lived operator memory that already states mobile `system_prompt` / active workspace win over remembered "canonical" projects. Continuity is injected via `system_prompt` and the vault/mirror files so a dynamic project-lane refresh cannot wipe the last-session handoff.

## Mac wiring (MBP + mini)

```bash
# Write / refresh from CLI (also used by pair server)
node tools/hermes-mobile-session-handoff.js --write --json '{"lastGoal":"…","lastAssistantSummary":"…"}'

# Restart pair server so POST /session-handoff is live
# (pair --server-only no-ops if :8765 already bound — kill then restart)
pkill -f 'hermes-mobile-pair.js --server-only' 2>/dev/null || true
node tools/hermes-mobile-pair.js --server-only &
```

Deploy the same `tools/hermes-mobile-session-handoff.js` + updated `tools/hermes-mobile-pair.js` on both Macs (repo sync / pull).

## Code map

- `src/utils/sessionContinuityHandoff.ts` — build / redact / phrase detect / system section
- `src/services/sessionContinuityStorage.ts` — AsyncStorage
- `src/services/sessionContinuitySync.ts` — pair-server POST/GET
- `src/components/ContinuingFromSessionChip.tsx` — no-op (banner removed; seamless resume)
- `src/utils/workspacePrompt.ts` — inject into mobile system prompt
- `src/screens/ChatScreen.tsx` — capture on Start fresh; silent handoff; skip pick-up retitle
- `tools/hermes-mobile-session-handoff.js` — vault + `~/.hermes` writer

## Tests

```bash
cd hermes-mobile && npm test -- --watchman=false --testPathPattern='sessionContinuityHandoff|ContinuingFromSessionChip|workspacePrompt'
node tests/test-hermes-mobile-session-handoff.js
```
