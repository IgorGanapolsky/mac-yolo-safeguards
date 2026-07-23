# ASC rename evidence — Hermes Mobile: AI Agent (2026-07-23)

Agent: `cursor-asc-rename-ship` · App `6786778037` / `com.iganapolsky.hermesmobile`

## Attempt: live name PATCH

PATCH `/v1/appInfoLocalizations/{READY_FOR_SALE en-US}` with:

- name: `Hermes Mobile: AI Agent`
- subtitle: `Chat & approve Mac tools`

**Result:** HTTP **409** `ENTITY_ERROR.ATTRIBUTE.INVALID.INVALID_STATE`

- “The field 'name' can not be modified in the current state.”
- “The field 'subtitle' can not be modified in the current state.”

## ASC appInfo states (API read)

| appStoreState | name | subtitle |
|---------------|------|----------|
| READY_FOR_SALE (live v1.3) | Hermes AI Agent Leash | Hermes AI agent for your Mac |
| WAITING_FOR_REVIEW (v1.4) | Hermes Mobile: AI Agent | Chat & approve Mac tools |

v1.4 keywords (en-US): `remote,coding,devtools,leash,operator,safety,pair,tailscale,desktop,usb,wifi,phone,block,qr,command`  
v1.4: `WAITING_FOR_REVIEW`, `releaseType: AFTER_APPROVAL`, review submission submitted ~2026-07-23T13:02Z.

## Public iTunes (same session)

- lookup `id=6786778037`: trackName **Hermes AI Agent Leash**, version **1.3**
- search exact `Hermes Mobile: AI Agent`: our app still listed under old trackName (#3)
- search `hermes ai`: our bundle **absent** from top 8 (competitors)

## Honesty

Public App Store display name changes when **1.4 is Approved and auto-released** — not via live metadata-only edit, not via Expo OTA, and not by burning a new binary for this rename (1.4 already carries it).

Repo `fastlane/metadata/ios/en-US/{name,subtitle,keywords}.txt` already match the staged 1.4 copy.
