# Uber-style progress HUD — Hermes Mobile design note (2026-07-17)

**Status:** research ingested; ranked next PRs (no Live Activities / Notifee / cloud EAS in v1)  
**Research:** [research/hermes-uber-style-progress-hud.md](./research/hermes-uber-style-progress-hud.md)  
**Parallel run:** `trun_fcde9c3bf38d4cdfa17fc6308c6c5ea1` (`pro-fast`)  
**User constraint:** hate notification spam; want Uber-like *live* progress, not alert storms.

---

## Already shipped (do not re-litigate)

| Surface | Current owner | Behavior |
|---------|---------------|----------|
| In-app HUD | `RunProgressBanner` + `runProgressDisplay` | Delivering → tool/working → Reply ready + snippet; stall CTAs |
| Anti-spam policy | `smartNotificationPolicy` | Foreground: no intrusive banners; `run_progress` / `run_stall` / `run_completed` never heads-up |
| Android channels | `hermesNotifications` | `CHANNEL_STATUS_V2` **LOW** (shade-only); `CHANNEL_RESULTS_V2` for completion; 15s status throttle |
| Reply snippet notifs | `#482` / T-NOTIF-SNIPPET / `runNotificationCopy` | Background completion prefers reply text; no leading elapsed |
| Transcript spam | T-TOOL-STATUS-SPAM | Tool progress only in banner, not chat bubbles |

---

## Research → Hermes mapping (top 5)

Research mental model (Uber RAMEN): decouple **trigger** (when) from **payload** (what), drive one FSM across surfaces. Hermes already has the FSM in `RunProgressState`; harden it rather than adding a second stack.

### 1. Explicit three-phase FSM (highest ROI)

| Phase | User intent | Foreground | Background |
|-------|-------------|------------|------------|
| **Delivering** | Did Mac get it? | Banner only — “Delivering your message…” | No system notif (or silent shade after >10s away) |
| **Tool use** | What is Hermes doing? | Banner: tool name + elapsed (+ optional terminal preview) | **One** sticky shade update on `CHANNEL_STATUS_V2` (LOW), ≤ every 15s; never heads-up |
| **Reply ready** | Tap to read | Banner snippet / suppress if bubble visible | One-shot `CHANNEL_RESULTS_V2` with snippet + deep-link |

**Adapt vs research:** Do **not** put tool-use on `IMPORTANCE_HIGH`. Research’s heads-up-for-every-tool pattern conflicts with Igor’s spam constraint and with `CHANNEL_STATUS_V2` / `SILENT_STATUS_NOTIFICATION_TYPES`. Reserve interruptive alerts for **approvals** and (optionally) **reply ready when backgrounded**.

**Next PR:** Document + enforce phase labels in `runProgressDisplay` / banner chrome (chip: Delivering | Working | Reply ready). JS/OTA only.

### 2. Foreground = banner is the Uber HUD

Uber keeps trip status on a persistent in-app sheet; Hermes already suppresses foreground `expo-notifications` alerts. Double down:

- Keep `RunProgressBanner` as the single live HUD (composer-adjacent).
- Never schedule shade updates while `AppState === 'active'` (already true via `shouldScheduleRunProgressNotification`).
- Polish: phase chip, human tool name, elapsed; collapse details when keyboard open (T-344 pattern).

**Next PR:** Banner visual hierarchy pass only — no new native modules.

### 3. Background = one sticky status ID, replace on complete

Research’s “ongoing notification” maps to existing `RUN_STATUS_NOTIFICATION_ID` + LOW channel:

- Keep updating the **same** notification id (no stack of alerts).
- On reply ready: **clear** status id, post **one** results notification (snippet path from `#482`).
- Cap copy ~12 words; never put paths/secrets/tool stdout on the lock screen.

**Next PR:** Audit `hermesNotifications` replace/clear path so completion never leaves a zombie “Delivering…” shade entry.

### 4. Stay on `expo-notifications` for v1 (defer Notifee / Live Activities)

| Option | When | Cost |
|--------|------|------|
| `expo-notifications` (current) | Channels, categories, local status + results | Already wired |
| Notifee | Android FGS + determinate progress bars | New native dep + store binary |
| iOS Live Activities / Dynamic Island | Lock-screen Uber trip card | Widget extension + store binary + ActivityKit budget |

**Decision:** No Live Activities / Notifee until banner + shade FSM feels Uber-grade on device. Research’s module tree (`modules/hermes-hud`, Widget Extension) is **v2+**.

### 5. Telemetry on phase transitions

Log `run_id` + phase (`delivering` | `tool` | `reply_ready`) client-side (and correlate with gateway) so spam regressions are measurable. Aligns with research §7 telemetry and Agent Conf TTM tooling — lightweight PostHog/analytics events only, no PII in payloads.

**Next PR:** 3 analytics events; unit-test that reply_ready fires once per run.

---

## Ranked next PRs (ROI)

| Rank | PR | Files (expected) | Ship path | Why first |
|------|----|------------------|-----------|-----------|
| **P0** | Phase-chip HUD polish on `RunProgressBanner` | `RunProgressBanner.tsx`, `runProgressDisplay.ts`, tests | OTA | Biggest “Uber feel” with zero native risk |
| **P1** | Shade lifecycle: single sticky status → clear → one reply-ready | `hermesNotifications.ts`, `smartNotificationPolicy.ts`, tests | OTA | Fixes zombie Delivering + spam edge cases |
| **P2** | Tool-name payload on sticky status (humanized, ≤12 words) | `runNotificationCopy.ts`, banner terminal props | OTA | Background parity with in-app tool line |
| **P3** | Per-session “Notify for this chat” mute | storage + Settings + schedule guards | OTA | Research §7.4; stops future spam |
| **P4** | iOS Live Activities spike (dev-client only) | Widget Extension / `expo-targets` | **Store binary** later | Only after P0–P2 feel right on phone |

**Out of scope for these PRs:** cloud EAS builds, Notifee, raising status channel importance, heads-up on every tool tick.

---

## Acceptance bar (product)

A stranger on cellular, app backgrounded for a long tool run, then reply ready:

1. At most **one** quiet shade row while working (no peeks/sounds).
2. Exactly **one** interruptive-capable result when done (if results channel allows), with reply snippet.
3. Foreground: only `RunProgressBanner` moves; no system banners.
4. No tool stdout / file paths on lock screen.

---

## Citations (primary)

Full list in [research/hermes-uber-style-progress-hud.md](./research/hermes-uber-style-progress-hud.md). Anchors used here:

- Uber RAMEN trigger/payload — https://www.uber.com/us/en/blog/real-time-push-platform
- Apple Live Activities HIG — https://developer.apple.com/design/human-interface-guidelines/live-activities
- Android notification importance / ongoing — https://developer.android.com/develop/ui/views/notifications/build-notification
- expo-notifications — https://docs.expo.dev/versions/latest/sdk/notifications/
- Notifee (deferred) — https://notifee.app/react-native/docs
