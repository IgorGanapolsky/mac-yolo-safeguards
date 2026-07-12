# Integrations — Mobile MVP spec (gateway + mobile)

**Status:** Spec only (2026-07-11)  
**Upstream context:** [Tool enablement investigation](75385ce9-e6ac-49f1-b3bf-b2c48e89d0ac)  
**Audience:** `hermes-agent` gateway team (`~/.hermes/hermes-agent`, outside this repo) + `hermes-mobile` UI team

---

## Problem

Hermes Mobile **Settings → Computer gateway ops → Toolsets** (`GatewayOpsSection`) can:

| Today | API |
|-------|-----|
| List toolsets | `GET /v1/toolsets` on Mac `:8642` |
| Toggle on/off (when `features.toolsets_write`) | `PUT /v1/toolsets/{name}` → `platform_toolsets.api_server` in `~/.hermes/config.yaml` |

It **cannot** supply API keys or OAuth. Toggles flip *permission* to call tools; **credentials live on the Mac** in `~/.hermes/.env` and the Hermes auth store. Unconfigured toolsets show `configured: false` and copy like *"requires xAI OAuth or XAI_API_KEY"* (from `hermes_cli/tools_config.py` → `description` field).

The Hermes **dashboard** (`hermes_cli/web_server.py`, local HTTP UI — not `:8642`) already implements allowlisted credential writes. Mobile needs a **thin proxy on `:8642`** plus a small Integrations sheet.

**Do not edit `~/.hermes/hermes-agent` from this repo.** Gateway work happens in that checkout; this doc is the contract.

---

## Canonical storage (Mac)

| Store | Path | Mobile access |
|-------|------|---------------|
| Env API keys | `~/.hermes/.env` | Via gateway `PUT …/env` only (allowlisted keys) |
| OAuth tokens | Hermes auth store (`hermes_cli/auth.py`) | Mac browser / `post-setup` only |
| Toolset enablement (Chat) | `~/.hermes/config.yaml` → `platform_toolsets.api_server` | `PUT /v1/toolsets/{name}` |
| Pair channel (`:8765/pair.json`) | URL + `API_SERVER_KEY` | **Never** integration secrets |

Mobile `secureCredentials.ts` stores **gateway auth** only. Integration secrets remain Mac-canonical even after Phase 1 (phone is a remote control, not the secrets vault).

---

## Phase 0 — Gateway (`api_server` on `:8642`)

**Goal:** Mirror dashboard integration endpoints under `/v1/`, same allowlist, same `save_env_value` validation. Reuse handlers from `hermes_cli/web_server.py` — do not duplicate business logic.

### Capabilities advertisement

Extend `GET /v1/capabilities`:

```json
{
  "features": {
    "toolsets_write": true,
    "integrations_config": true
  },
  "endpoints": {
    "toolsets": { "method": "GET", "path": "/v1/toolsets" },
    "toolset_toggle": { "method": "PUT", "path": "/v1/toolsets/{name}" },
    "toolset_config": { "method": "GET", "path": "/v1/toolsets/{name}/config" },
    "toolset_env": { "method": "PUT", "path": "/v1/toolsets/{name}/env" },
    "toolset_provider": { "method": "PUT", "path": "/v1/toolsets/{name}/provider" },
    "toolset_post_setup": { "method": "POST", "path": "/v1/toolsets/{name}/post-setup" }
  }
}
```

Keep `admin_config_rw: false` globally; `integrations_config` is a **scoped** credential surface (toolset allowlist only), not full config.yaml write access.

**Auth:** `Authorization: Bearer <API_SERVER_KEY>` — same as chat. **Never log request bodies** on env routes.

### Endpoints to expose (mirror dashboard allowlist)

Implement by delegating to existing dashboard handlers (or shared functions extracted from `web_server.py`).

| Mobile path | Dashboard source | Purpose |
|-------------|------------------|---------|
| `GET /v1/toolsets` | *(exists)* | List + `enabled` / `configured` / `tools` |
| `PUT /v1/toolsets/{name}` | `PUT /api/tools/toolsets/{name}` | Toggle for **`api_server`** platform (not `cli`) |
| `GET /v1/toolsets/{name}/config` | `GET /api/tools/toolsets/{name}/config` | Provider matrix; `env_vars[].is_set` only — **never return secret values** |
| `PUT /v1/toolsets/{name}/env` | `PUT /api/tools/toolsets/{name}/env` | Write allowlisted keys → `~/.hermes/.env` |
| `PUT /v1/toolsets/{name}/provider` | `PUT /api/tools/toolsets/{name}/provider` | Select provider (e.g. Edge TTS — no key) |
| `POST /v1/toolsets/{name}/post-setup` | `POST /api/tools/toolsets/{name}/post-setup` | Spawn Mac-side setup (OAuth browser, pip install) |

**Platform scoping:** Dashboard toggles `platform_toolsets.cli`. Mobile Chat uses `platform_toolsets.api_server`. Proxy handlers must read/write **`api_server`** for toggle endpoints mobile already calls.

### `GET /v1/toolsets/{name}/config` — response shape

Same as dashboard (reference: `web_server.py` `get_toolset_config`):

```json
{
  "name": "x_search",
  "has_category": true,
  "active_provider": null,
  "providers": [
    {
      "name": "xAI Grok OAuth (SuperGrok / Premium+)",
      "badge": "subscription",
      "tag": "Browser login at accounts.x.ai — no API key required",
      "env_vars": [],
      "post_setup": "xai_grok",
      "requires_nous_auth": false,
      "is_active": false
    },
    {
      "name": "xAI API key",
      "badge": "paid",
      "tag": "Direct xAI API billing via XAI_API_KEY",
      "env_vars": [
        {
          "key": "XAI_API_KEY",
          "prompt": "xAI API key",
          "url": "https://console.x.ai/",
          "is_set": false
        }
      ],
      "post_setup": null,
      "is_active": false
    }
  ]
}
```

### `PUT /v1/toolsets/{name}/env` — request / response

**Request:**

```json
{
  "env": {
    "XAI_API_KEY": "xai-…"
  }
}
```

**Validation (existing dashboard rules):**

- Toolset must be in `_get_effective_configurable_toolsets()`
- Each key must appear in the union of `env_vars` for visible providers in `TOOL_CATEGORIES[name]`
- Blank values = skip (leave unchanged)
- `save_env_value` denylist / managed-scope guards apply

**Response:**

```json
{
  "ok": true,
  "name": "x_search",
  "saved": ["XAI_API_KEY"],
  "skipped": [],
  "is_set": { "XAI_API_KEY": true }
}
```

**Side effect:** When `XAI_API_KEY` is set, `_toolset_has_keys("x_search")` becomes true → `GET /v1/toolsets` returns `configured: true`. Hermes may auto-enable `x_search` when creds appear (see `tools_config.py`).

### Security requirements

1. No secret values in any `GET` response — only `is_set` booleans.
2. Env writes restricted to per-toolset allowlist (same as dashboard).
3. Structured access logs: toolset name + key names saved — **not** values.
4. `post-setup` spawns Mac processes only; mobile polls status (optional Phase 0.5: expose `GET /v1/actions/{id}` or reuse dashboard action tail URL on LAN only).

### Phase 0 acceptance tests

```bash
KEY="<API_SERVER_KEY from ~/.hermes/.env>"

# Config panel (no secrets)
curl -sS -H "Authorization: Bearer $KEY" \
  http://127.0.0.1:8642/v1/toolsets/x_search/config | jq .

# Save key
curl -sS -X PUT -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"env":{"XAI_API_KEY":"test-key-redacted"}}' \
  http://127.0.0.1:8642/v1/toolsets/x_search/env | jq .

# Refresh list — configured should flip
curl -sS -H "Authorization: Bearer $KEY" \
  http://127.0.0.1:8642/v1/toolsets | jq '.data[] | select(.name=="x_search")'
```

---

## Phase 1 — Mobile (`hermes-mobile`)

**Goal:** Settings → **Integrations** sheet (modal from Toolsets row) so users can configure keys from the phone without `adb` or manual Mac SSH.

**Blocked (2026-07-11):** `GatewayOpsSection.tsx` locked (T-149), `SettingsScreen.tsx` locked (T-142). Ship Phase 0 gateway first; mobile PR follows when locks release.

### UX — Integrations sheet

**Entry:** Tap a toolset row in `GatewayOpsSection` when `enabled && !configured` **or** always show a **Configure** affordance on rows with `has_category` from config API.

**Flow:**

1. `GET /v1/toolsets/{name}/config` (gate on `features.integrations_config`).
2. Show provider list (chips). Highlight `is_active`.
3. **Key-based provider** (e.g. xAI API key): secure `TextInput` per `env_vars[]` (`secureTextEntry`, no Sentry breadcrumbs).
4. **Save** → `PUT /v1/toolsets/{name}/env` → refresh `GET /v1/toolsets`.
5. Optional: auto `PUT /v1/toolsets/{name}` `enabled: true` after successful save.
6. **OAuth / post-setup provider:** Alert — *"Finish on your Mac"* + CTA to run `hermes tools` (honest; no fake in-app OAuth).

**Copy rules (fresh-user):** Say **Your Mac**, not "gateway". No jargon in primary CTA.

### Phase 1 interim UX (minimal — implement when unblocked)

Until the full sheet ships, tap unconfigured toolset → `Alert`:

```
Configure on your Mac

Run: hermes tools
→ X (Twitter) Search → paste API key or sign in with xAI

Or add to ~/.hermes/.env:
XAI_API_KEY=your-key-here
```

Optional: copy button for the `XAI_API_KEY=` line template (no value).

### Client modules (planned)

| File | Change |
|------|--------|
| `src/services/hermesGatewayClient.ts` | `getToolsetConfig`, `saveToolsetEnv`, `setToolsetProvider` |
| `src/types/gatewayApi.ts` | `HermesToolsetConfig`, provider/env_var types |
| `src/components/IntegrationsSheet.tsx` | Modal UI (new) |
| `src/components/GatewayOpsSection.tsx` | Open sheet / interim Alert on tap |
| `src/__tests__/IntegrationsSheet.test.tsx` | Provider render, save calls mocked |

Reuse `secureCredentials.ts` patterns; do **not** persist integration keys in mobile SecureStore unless offline UX requires cache — Mac `.env` stays canonical.

---

## First slice — `XAI_API_KEY` / X Search

| Step | Owner | Work |
|------|-------|------|
| 0a | Gateway | Merge `PUT /v1/toolsets/{name}` for `api_server` if not in running build |
| 0b | Gateway | Proxy `GET/PUT …/config` and `…/env` for `x_search` only (narrow first PR) |
| 1a | Mobile | Integrations sheet: single provider "xAI API key" + save |
| 1b | Mobile | Interim Alert (above) if sheet blocked |

**Mac-only today (no mobile code):**

```bash
hermes tools    # → X (Twitter) Search → API key or OAuth
# or append to ~/.hermes/.env:
# XAI_API_KEY=xai-...
```

Then toggle X Search on in mobile Toolsets (or let auto-enable apply).

---

## Later slices (ordered)

| Toolset | Keys / path | Mobile complexity |
|---------|-------------|-------------------|
| `tts` | Provider pick → Edge TTS (no key) | Low — `PUT …/provider` only |
| `homeassistant` | `HASS_URL`, `HASS_TOKEN` | Low — two secure fields |
| `image_gen` / `video_gen` | `FAL_KEY`, provider matrix | Medium |
| `x_search` OAuth | `post-setup: xai_grok` | Mac browser required |
| `spotify` / `discord` | OAuth / bot wizard | Mac-only; mobile shows honest CTA |

---

## Out of scope (MVP)

- Syncing secrets over `pair.json` (`:8765`)
- Phone-local OAuth WebViews for xAI / Spotify / Discord
- Writing arbitrary `config.yaml` from mobile (`admin_config_rw`)
- Editing `~/.hermes/hermes-agent` from this repo

---

## References

| Artifact | Location |
|----------|----------|
| Dashboard toolset APIs | `~/.hermes/hermes-agent/hermes_cli/web_server.py` (`/api/tools/toolsets/…`) |
| Toolset registry + allowlist | `~/.hermes/hermes-agent/hermes_cli/tools_config.py` |
| `:8642` api_server | `~/.hermes/hermes-agent/gateway/platforms/api_server.py` |
| Mobile toolset client | `hermes-mobile/src/services/hermesGatewayClient.ts` |
| Mobile toolset UI | `hermes-mobile/src/components/GatewayOpsSection.tsx` |
| Status line (`needs API keys`) | `hermes-mobile/src/utils/opsToolsets.ts` |

---

## PR checklist

**Gateway PR** (`hermes-agent`):

- [ ] Shared handler extraction (dashboard + api_server)
- [ ] `integrations_config` + endpoint entries in capabilities
- [ ] Unit tests for allowlist rejection + no-secret GET
- [ ] Manual curl proof (above)

**Mobile PR** (`hermes-mobile`):

- [ ] `INTEGRATIONS-MOBILE-MVP.md` (this file)
- [ ] Integrations sheet or interim Alert (when `GatewayOpsSection` free)
- [ ] Jest for client + sheet
- [ ] Demo mode: mock config API in `GatewayOpsSection` demo branch
