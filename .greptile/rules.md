# Greptile review rules — mac-yolo-safeguards / Hermes Mobile

Hermes Mobile ships to **real users**. Reviews must catch connect/onboarding false greens that only work on Igor's USB-cabled MacBook.

## Product bar

- Every change is judged as a **brand-new user**: fresh install, no saved profiles, no `adb reverse`, no `developerLeashUnlock`, release APK, cellular or home Wi‑Fi only.
- Prefer logic bugs in connect, pairing, auth, Tailscale discovery, and onboarding copy over style nitpicks.

## Fresh-user onboarding

- Cold start without profiles → `ConnectMacGate` + numbered steps + single primary CTA (**Find computers**).
- Returning users with saved Mac → silent heal (~30s) before human recovery UI.
- Primary UI copy: **Your Mac**, **Home Wi‑Fi**, **Find computers**.
- Ban in primary onboarding/disconnected UI: "gateway", "LAN", "Pair relay".

## Tailscale / USB

- Off-Wi‑Fi / cellular → Tailscale-first paths and copy.
- USB + `adb reverse` is operator dogfood, not a real-user requirement.
- Do not hijack a healthy Wi‑Fi/Tailscale primary when USB appears.
- **Connected** requires authenticated probe success — HTTP `/health` 200 alone is insufficient (wrong-key trap).

## No `demo=1` false greens

- `hermes://setup?demo=1` is App Store / review bootstrap only.
- Never accept demo deep links, ASC notes shortcuts, or pre-paired Igor fixtures as stranger cold-start proof.
- Maestro/unit paths that hide the gate via demo must not claim onboarding is verified.

## Expo OTA vs native

- JS/asset fixes → EAS OTA (`production` channel).
- Native changes (permissions, plugins, `runtimeVersion` / app version bumps, native modules) → new binary.
- Never `expo run:android` on a physical phone — use release install scripts only.

## Multi-Mac API keys

- Mac mini and MacBook Pro may use different `API_SERVER_KEY` values.
- Pairing/heal must keep host↔key consistency; never reuse the laptop `.env` key on a mini Tailscale URL.
- Prefer `node tools/hermes-mobile-pair.js --mini-tailscale` semantics over key paste.
- Flag Connected ⊕ Wrong-key contradictory UI.

## Secrets / public safety

- Never suggest committing secrets, gateway URLs, or API keys into docs, ASC notes, or public Issues.
- Public Issues stay product-safe; agent coordination stays in `plan.md`.
