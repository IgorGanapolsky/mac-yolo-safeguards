# Leash Pro monetization research (2026-07-05)

## Free tier (must never paywall)

- In-chat approve/deny when Hermes blocks a tool or asks to proceed
- ThumbGate 👍/👎 on assistant chat output (memory capture)

## Leash Pro (paid)

- View all standing allow/block gate rules synced from the Hermes gateway
- Toggle allow ↔ block and delete rules
- Future: OpenClaw workflow hooks (scaffold only until gateway exposes `/v1/openclaw` or hooks config)

## Gateway API contract (mobile client)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/gates` | List standing gate rules |
| PATCH | `/v1/gates/:id` | Update decision (`allow` \| `block`) |
| DELETE | `/v1/gates/:id` | Remove a standing rule |

When the gateway has not shipped this endpoint yet, the mobile app shows an honest empty state and does not invent rules.

## Entitlement

- Store: `thumbgate_leash_monthly` via `expo-iap` → `settings.thumbgateProActive`
- Dev: `developerLeashUnlock` gesture / deep link / `unlock-thumbgate-leash` in dev builds
- Helper: `isLeashProEnabled()` in `src/utils/leashPro.ts`
