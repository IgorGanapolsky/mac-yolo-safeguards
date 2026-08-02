---
name: hermes-mobile-connect
description: >
  Facilitates Hermes Mobile ↔ Mac gateway pairing, onboarding, and ThumbGate
  integration. Use when a user needs help connecting their phone to their Mac,
  when the app reports "can't reach your computer", or when the user does not
  have ThumbGate installed and needs to be guided through the upgrade/install
  flow. Teaches the agent how to detect gateway reachability, inspect
  capabilities, check for ThumbGate, and generate pairing deep links. Repo:
  mac-yolo-safeguards / hermes-mobile.
---

# Hermes Mobile Connect

Hermes Mobile is the phone companion for a Mac running the Hermes gateway
(`:8642`). This skill teaches you how to help a user pair their phone to their
Mac, diagnose connection failures, and — critically — detect when the user
does **not** have ThumbGate installed and facilitate that upgrade.

Before issuing any control command, verify that this agent is running **on a
Mac with the Hermes gateway installed and running**:

```bash
curl -sf -m 3 http://127.0.0.1:8642/health
```

If the check fails, say that you are not running on a Mac with Hermes gateway
and stop. Do not attempt to pair or diagnose a gateway you cannot reach.

---

## 1. What is ThumbGate (and why does it matter)

ThumbGate (`https://thumbgate.app`) is a **paid companion web app** for Hermes.
It is **not** an app you install from the Mac App Store — it is a browser-based
dashboard + subscription service. When a user does **not** have ThumbGate:

- The Leash tab on their phone cannot receive approval requests (Thumbs up /
  down memory capture, pre-action safety guardrails).
- They have no web dashboard to manage chats, skills, or cron jobs from a
  browser.
- Paid Continuity (keep eligible work moving when the Mac is offline) is
  unavailable.

Hermes Mobile facilitates this by surfacing a `ThumbGatePromoCard` in two
places when ThumbGate is not active:

1. Inside `ConnectMacGate` (first-run gate) — `surface="connection_unreachable"`
2. Inside `ChatConnectionPanel` (disconnected state) — `surface="connection_unreachable"`

The promo card links to `https://thumbgate.app/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=paid_companion#pricing`.

---

## 2. Detect: is the gateway reachable?

```bash
curl -sf -m 3 http://127.0.0.1:8642/health | jq .
```

A healthy gateway returns JSON like:

```json
{
  "status": "ok",
  "platform": "macos",
  "hostname": "Igors-Mac-mini",
  "local_ip": "192.168.1.42",
  "port": 8642,
  "uptime_seconds": 3600,
  "git_commit": "a1b2c3d",
  "version": "1.2.3"
}
```

If `/health` 401s, the gateway is running but the API key on the phone is
stale — guide the user to re-pair (not re-install). If `/health` times out,
the gateway is not running on this Mac — start it.

---

## 3. Detect: does the Mac have ThumbGate?

### 3a. Check gateway capabilities for ThumbGate features

```bash
curl -sf -m 3 http://127.0.0.1:8642/v1/capabilities | jq .
```

Inspect the `features` object for Leash / ThumbGate-related flags. The catalog
(`hermes-mobile/src/utils/gatewayFeatureCatalog.ts`) defines human-readable
entries for known keys — unknown keys fall through to a generic humanized
description, so still grep raw JSON for these:

| Feature key | In catalog? | Meaning |
|---|---|---|
| `approvals` | yes | Leash approval queue exposed for mobile |
| `skills` | yes | Mac-installed agent skills catalog is available |
| `toolsets_write` | yes | Phone can toggle Mac toolsets |
| `leash_available` | no (check raw) | Leash approval queue is active on this gateway |
| `thumbgate_leash` | no (check raw) | ThumbGate Pro Leash relay is installed on this Mac |
| `thumbgate_pro_active` | no (check raw) | ThumbGate Pro subscription is active |

**When ThumbGate is NOT installed** — the `features` record will lack
`thumbgate_leash` and/or `thumbgate_pro_active`, and `pair.json` will not
contain a `thumbgateApiKey`. The phone app detects this indirectly: it checks
`settings.thumbgateProActive` (phone-side preference, defaults `false`) and
shows `ThumbGatePromoCard` when `shouldShowThumbGatePromoOnConnectionPanel`
returns `true` — which fires on any unreachable/disconnected state with no
saved profiles or after heal exhaustion.

That function returns `true` when:
- Connection is `disconnected` or `connecting` (not `connected`/`demo`)
- AND either no saved profiles exist (`profileCount === 0`) — i.e. fresh user
  or fully unreachable — OR silent heal is exhausted (`healExhausted === true`)
  AND the active profile is unreachable (`activeProfileReachable === false`)

```bash
# Check the phone-side promo logic by simulating the inputs:
# shouldShowThumbGatePromoOnConnectionPanel({
#   connectionState: 'disconnected',
#   profileCount: 0,
#   healExhausted: false,   # fresh user — profileCount === 0 is enough
#   activeProfileReachable: false
# })  → true  (promo shows)
```

### 3b. Check the pair server for ThumbGate key

The pair server (`:8765`) returns a `deepLink` field that is the full
`hermes://setup?...` URL. When the Mac has ThumbGate provisioned, that deep link
includes a `?thumbgate=<key>` query parameter. Check the pair server:

```bash
# Full pair.json
curl -sf -m 3 http://127.0.0.1:8765/pair.json | jq .

# Just the deep link — look for "thumbgate=" in the query string
curl -sf -m 3 http://127.0.0.1:8765/pair.json | jq -r '.deepLink'
```

If the `deepLink` does **not** contain `thumbgate=`, ThumbGate is not
provisioned on this Mac for this pairing. The phone's
`applySetupDeepLinkWithThumbgate()` will skip persisting a ThumbGate key, and
`thumbgateProActive` stays `false`. The `ThumbGatePromoCard` will show on the
phone when the connection is unreachable.

---

## 4. Facilitate: user does NOT have ThumbGate — what to do

### Decision tree

```
Is the Hermes gateway running on this Mac?
├─ NO → Start it:  hermes serve  (or:  npx hermes serve)
│       Then re-check /health.
└─ YES → Is the phone reachable on the same network (or Tailscale)?
        ├─ NO → Guide user to check Wi-Fi / Tailscale / USB cable.
        │       (See §6 — connection self-heal fallback URLs.)
        └─ YES → Check ThumbGate features via /v1/capabilities.
                ├─ thumbgate_leash or thumbgate_pro_active present?
                │   → ThumbGate IS installed. Nothing to do.
                └─ Absent?
                    → ThumbGate is NOT installed. Facilitate install (§4a).
```

### 4a. Facilitate ThumbGate installation

When ThumbGate is not detected, the agent should:

1. **Confirm the gateway is healthy** (§2) so the user is not being sent to
   install ThumbGate when the real problem is the gateway being down.

2. **Explain what ThumbGate is** (§1) — it is a paid web dashboard + subscription,
   not a Mac app from the App Store.

3. **Provide the canonical URL** — send the user to:
   ```
   https://thumbgate.app/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=paid_companion#pricing
   ```
   (This is `THUMBGATE_WEB_URL` from `hermes-mobile/src/utils/thumbgatePromoCopy.ts`.)

4. **Explain the phone-side behavior** — after the user subscribes on
   thumbgate.app, the Mac gateway will embed a ThumbGate API key in the next
   pairing deep link (`hermes://setup?thumbgate=<key>`). The phone app
   persists it via `secureCredentials.saveThumbgateApiKey()` and sets
   `thumbgateProActive: true`. The `ThumbGatePromoCard` disappears and the
   Leash tab activates.

5. **Generate a fresh pairing deep link** so the user can re-scan with the
   ThumbGate key included:
   ```bash
   # Extract the deep link — check for thumbgate= param:
   curl -sf -m 3 http://127.0.0.1:8765/pair.json | jq -r '.deepLink'
   # After the user subscribes, re-fetch — thumbgate= should now be present.
   ```
   > **Safety:** never paste the API key or ThumbGate key into chat. Only
   > read them from `pair.json` programmatically. The deep link embeds the
   > gateway URL, API key, and optional ThumbGate key as query params; the phone
   > parses them server-side via `exchangePairingCode()` and stores them in
   > Keychain/Keystore — never as a deep-link screenshot.

### 4b. Verify after install

After the user subscribes on thumbgate.app:

```bash
# Re-check capabilities — ThumbGate features should now appear:
curl -sf -m 3 http://127.0.0.1:8642/v1/capabilities | jq '.features'

# Re-fetch pair.json — the deepLink should now include thumbgate=:
curl -sf -m 3 http://127.0.0.1:8765/pair.json | jq -r '.deepLink' | grep -o 'thumbgate=[^&]*'
```

If the deep link still lacks `thumbgate=` or the features still lack ThumbGate
flags, the subscription did not propagate to this gateway. Have the
user refresh the thumbgate.app dashboard and confirm the Mac's machine key is
linked, then re-pair from the phone.

---

## 5. Pairing deep link reference

The Hermes Mac gateway serves a pairing page at `:8765/pair.json` (the pair
server, `PAIR_SERVER_PORT = 8765`). The phone scans a QR code or receives a
`hermes://setup` deep link. Key parameters (`hermes-mobile/src/utils/setupDeepLink.ts`):

| Query param | Source field in pair.json | Purpose |
|---|---|---|
| `url` | in `deepLink` | Gateway HTTP base (e.g. `http://192.168.1.42:8642`) |
| `key` | in `deepLink` | Gateway API key (authenticated chat) |
| `name` | `hostname` / `deepLink` | Friendly Mac label |
| `relay` | `relayCode` / `deepLink` | MOON-DUST relay pairing code |
| `tailnet` | `tailnetProbeHosts[]` / `deepLink` | Tailscale hosts to probe |
| `thumbgate` | in `deepLink` (absent if not installed) | ThumbGate API key for Leash feedback |
| `pairCode` | in `deepLink` | Secretless one-time code (T-330) |
| `pairServer` | — (set by phone from local probe) | Local pair server base URL |

**Never** embed the raw API key in a URL string that an agent prints. The phone
exchanges `pairCode` for credentials server-side via
`exchangePairingCode()` and stores them in Keychain/Keystore.

---

## 6. Connection self-heal fallback URLs

When the phone reports "can't reach your computer", the agent should check the
fallback probe order that Hermes Mobile uses internally
(`hermes-mobile/src/utils/connectionSelfHeal.ts`):

```
buildSelfHealProbeUrls({
  primaryUrl: <saved gateway URL>,
  wifiConnected: <true if phone on Wi-Fi>,
  profiles: [...saved profiles...],
  tailnetProbeHosts: [...Tailscale peers...],
})
```

The probe order (when Wi-Fi): `loopback → LAN → Tailscale → other`
The probe order (when cellular): `Tailscale → loopback → LAN → other`

Key constants:
- `CONNECTION_SELF_HEAL_INTERVAL_MS = 5_000`
- `CONNECTION_HEAL_EXHAUSTED_AFTER = 6` (≈30s of silent retry before showing
  onboarding copy)
- `CONNECTION_ERROR_DEBOUNCE_MS = 12_000`

If the phone is on cellular and the gateway URL is a private LAN address
(`10.x` / `192.168.x`), the connection will **never** succeed — the user needs
Tailscale. This is not a bug.

---

## 7. Command reference

```bash
# Safety gate — verify gateway is running on this Mac
curl -sf -m 3 http://127.0.0.1:8642/health

# Inspect what the gateway advertises (features, models, endpoints)
curl -sf -m 3 http://127.0.0.1:8642/v1/capabilities | jq .

# Extract just the ThumbGate-relevant feature flags
curl -sf -m 3 http://127.0.0.1:8642/v1/capabilities | jq '.features | {thumbgate_leash, thumbgate_pro_active, leash_available, approvals}'

# Check the pair server for ThumbGate key
curl -sf -m 3 http://127.0.0.1:8765/pair.json | jq .

# List installed Hermes skills on this Mac (Ops tab source of truth)
curl -sf -m 3 http://127.0.0.1:8642/v1/skills | jq .

# List available toolsets
curl -sf -m 3 http://127.0.0.1:8642/v1/toolsets | jq .

# Check Tailscale host (from Mac)
curl -sf -m 3 "https://api.tailscale.com/api/v2/tailnet/<tailnet>/files"  # requires API key
tailscale ip -4  # simpler local check

# Phone network check (run on phone via adb or ask user)
adb shell ping -c 1 "$(adb shell ip route | awk '{print $3}' | head -1)"
```

---

## 8. Safety and coordination rules

- **Never paste API keys or ThumbGate keys into chat.** Read them from
  `pair.json` programmatically only. The phone persists them via
  `secureCredentials` (Keystore/Keychain) — never as deep-link query strings
  in screenshots.
- **Phone network matters.** A `10.x` / `192.168.x` gateway URL will fail on
  cellular. Do not claim the connection is broken on the phone — explain the
  Wi-Fi / Tailscale requirement.
- **USB loopback is Android-only.** `adb reverse tcp:8642 tcp:8642` works only
  on Android. iOS has no `adb reverse` — the user must use Tailscale or LAN.
- **Never claim "installed"** without evidence. After facilitating ThumbGate
  signup, re-check `/v1/capabilities` for the feature flag or re-fetch
  `pair.json` and confirm the `deepLink` now contains a `thumbgate=` parameter.
- **Do not auto-publish production OTA** (`eas update --channel production`)
  without `docs/proofs/continuous/latest.json` showing `e2e=pass` or a fresh
  `npm run e2e:fresh-user` proof. `e2e=skipped` is **not** pass.
- **No desktop hijack.** Do not drive Igor's interactive Chrome, steal macOS
  focus, or use Computer Use unless explicitly requested. Use `gh`, Play/ASC
  APIs, Stripe CLI, `adb`, SSH.
- **Fresh-user mindset.** Every test and pairing flow must assume a brand-new
  user: fresh install, no saved profiles, release APK, no `developerLeashUnlock`.

---

## 9. Phone-side promo detection (source of truth)

The phone decides to show the ThumbGate promo via
`hermes-mobile/src/utils/thumbgatePromoCopy.ts`:

```typescript
shouldShowThumbGatePromoOnConnectionPanel({
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'demo',
  profileCount: number,
  healExhausted: boolean,
  activeProfileReachable: boolean,
}): boolean
```

Returns `true` when:
- `connectionState` is `disconnected` or `connecting` (never `connected`/`demo`)
- AND (`profileCount === 0` — fresh user — OR `healExhausted && !activeProfileReachable`)

When `true`, `ChatConnectionPanel` and `ConnectMacGate` render
`<ThumbGatePromoCard surface="connection_unreachable" />` which links to:

```
https://thumbgate.app/?utm_source=hermes-mobile&utm_medium=app&utm_campaign=paid_companion#pricing
```

The promo is **not** shown when the user is already connected (`connected`
or `demo`). It is also gated by the silent-heal budget (§6): the promo only
appears after the 30-second self-heal window expires, so it does not flash
during transient network blips.
