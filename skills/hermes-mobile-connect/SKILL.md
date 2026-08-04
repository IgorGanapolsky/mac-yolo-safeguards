---
name: hermes-mobile-connect
description: >
  Facilitates Hermes Mobile ↔ Mac gateway pairing, onboarding, and ThumbGate
  install when the user does not have ThumbGate.app. Use when a user needs help
  connecting their phone to their Mac, when the app reports "can't reach your
  computer", or when ThumbGate is missing and needs a Herdr-style one-line
  install + web signup path. Repo: mac-yolo-safeguards / hermes-mobile.
---

# Hermes Mobile Connect

Hermes Mobile is the phone companion for a Mac running the Hermes gateway
(`:8642`). This skill teaches you how to pair, diagnose connection failures,
and **facilitate ThumbGate when it is not installed** — the same pattern Herdr
uses for agent skills + one-line install ([herdr.dev/docs/agent-skill](https://herdr.dev/docs/agent-skill/)).

## Safety gate

Before controlling a gateway, verify this agent is on a Mac where Hermes is local:

```bash
curl -sf -m 3 http://127.0.0.1:8642/health
```

If that fails, say you are not on a Mac with a running Hermes gateway and stop.

---

## What ThumbGate is (and is not)

| | Hermes Mobile + Mac gateway | ThumbGate.app |
|--|--|--|
| Chat from phone | Yes | Optional web UI |
| Leash approvals on phone | Yes (paid app includes Leash) | Optional cloud push / web |
| Browser dashboard | No | Yes |
| Continuity when Mac offline | No | Yes (paid) |
| Install shape | App Store / Play + Hermes on Mac | **Web account** + **one-line Mac connector** |

**ThumbGate is not a Mac App Store binary.** It is:

1. A browser app at `https://thumbgate.app`
2. An always-on **connector** installed once via Terminal (same as the web dashboard)

Local phone↔Mac chat does **not** require ThumbGate. Facilitate ThumbGate when the
user wants web Continuity, a browser workspace, or the connector for web routing.

Canonical pricing URL (UTMs required):

```
https://thumbgate.app/dashboard?utm_source=hermes-mobile&utm_medium=app&utm_campaign=paid_companion
```

Source of truth in app code: `hermes-mobile/src/utils/thumbgatePromoCopy.ts` → `THUMBGATE_WEB_URL`.

---

## Herdr-style facilitation when ThumbGate is absent

### 1. Detect

```bash
# Gateway up?
curl -sf -m 3 http://127.0.0.1:8642/health | jq .

# Companion flags (if advertised)
curl -sf -m 3 http://127.0.0.1:8642/v1/capabilities | jq '.features | {thumbgate_leash, thumbgate_pro_active, approvals}'

# Pair deep link — ThumbGate key present only after provisioned
# Note: secretless pairCode deep links may omit thumbgate= even when provisioned;
# the key is in the one-time exchange payload. Prefer phone secure store / agent
# re-pair after signup, or check local ThumbGate license — not deepLink alone.
curl -sf -m 3 http://127.0.0.1:8765/pair.json | jq -r '.deepLink' | grep -q 'thumbgate=' && echo DEEPLINK_HAS_KEY || echo DEEPLINK_NO_KEY_MAY_STILL_BE_PROVISIONED
```

Helpers (unit-tested):

- `resolveThumbGatePresenceFromFeatures(features)` → `present | absent | unknown`
- `pairDeepLinkIncludesThumbGate(deepLink)` → boolean (never log the key)
- `shouldFacilitateThumbGateInstall(presence)` → true when absent/unknown

### 2. Facilitate (three steps — same as the phone promo card)

| Step | Action | Command / URL |
|------|--------|----------------|
| **Open web** | User creates/signs in on ThumbGate.app | `THUMBGATE_WEB_URL` |
| **Mac installer** | One-time connector (Herdr-style one-liner) | See below |
| **Agent skill** | Optional: teach coding agents this flow | `npx skills add …` |

**One-line Mac connector** (must match control-plane dashboard):

```bash
curl -fsSL https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/saas/install-connector.sh | bash
```

Constant: `THUMBGATE_CONNECTOR_INSTALL_COMMAND` in
`hermes-mobile/src/utils/thumbgateFacilitation.ts`.

**Install this skill** (Herdr `npx skills add` pattern):

```bash
npx skills add IgorGanapolsky/mac-yolo-safeguards --skill hermes-mobile-connect -g
```

Fallback: copy this file into the agent’s project/user skills directory:

`hermes-mobile/.cursor/skills/hermes-mobile-connect/SKILL.md`

### 3. What the phone does without ThumbGate

Hermes Mobile still works: Connect Mac → Chat → Leash against the gateway.

When ThumbGate is not set up, the app shows `ThumbGatePromoCard` with:

1. Open ThumbGate.app  
2. Share Mac installer command (`Share` sheet / selectable one-liner)  
3. Share agent skill install command  

Surfaces: `ConnectMacGate`, `ChatConnectionPanel` (disconnected), Leash empty/disconnected.

Promo visibility: `shouldShowThumbGatePromoOnConnectionPanel` — fresh user or after ~30s silent heal exhaustion. Never when `connected` / `demo`.

---

## Pairing deep links

Pair server `:8765` → `pair.json` → `hermes://setup?...`. Optional `thumbgate=` query only when provisioned. **Never paste API keys or ThumbGate keys into chat.**

Phone persists via Keychain/Keystore (`applySetupDeepLinkWithThumbgate`, `exchangePairingCode`).

---

## Connection self-heal (short)

- Wi‑Fi probe order: loopback → LAN → Tailscale → other  
- Cellular: Tailscale first; private LAN IPs will not work  
- Silent heal ~6 attempts (~30s) before human steps / promo  

Do not claim “Connected” from `/health` alone — chat needs authenticated session reachability.

---

## Safety

- No secrets in chat or screenshots  
- No production OTA without `e2e=pass` or fresh-user OTA gate  
- No desktop Chrome hijack unless explicitly requested  
- Brand-new user mindset for every test  
- Never claim ThumbGate “installed” without re-check of capabilities or `thumbgate=` in pair deep link  

---

## Related

- Facilitation utils: `hermes-mobile/src/utils/thumbgateFacilitation.ts`  
- Promo UI: `hermes-mobile/src/components/ThumbGatePromoCard.tsx`  
- Web installer parity: `apps/hermes-control-plane` `connectorInstallCommand`  
- Inspiration (not affiliation): [Herdr agent skill](https://herdr.dev/docs/agent-skill/)  
