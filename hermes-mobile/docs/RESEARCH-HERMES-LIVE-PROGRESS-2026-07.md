# Hermes live progress and notification decision — July 2026

Date: 2026-07-17  
Owner: `codex-live-progress` / T-353  
Decision boundary: improve the installed Expo app without starting a paid EAS build.

## Evidence

### Android

- Android 16 promoted Live Updates can appear prominently in the notification drawer, lock screen,
  and status-bar chip. Google limits them to ongoing, user-initiated, time-sensitive journeys. They
  require an ongoing notification, the promoted-ongoing request, a supported template, a title, and
  the `POST_PROMOTED_NOTIFICATIONS` manifest permission. A normal chat message is not eligible; a
  user-started long Hermes run may be eligible if its lifecycle is represented truthfully.
  Source: [Android Live Updates](https://developer.android.com/develop/ui/compose/notifications/live-update).
- Android's progress-centric notification API is `Notification.ProgressStyle`. It supports progress
  points, segments, actions, and concise state text. It is a native Android API and is not exposed by
  `expo-notifications` in Expo SDK 55.
  Source: [Android progress-centric notifications](https://developer.android.com/about/versions/16/features/progress-centric-notifications).
- Expo SDK 55 supports local notifications, stable identifiers, Android channels, sticky status,
  categories, visibility, and response actions. Build-time plugin changes require a new binary.
  Source: [Expo Notifications SDK 55](https://docs.expo.dev/versions/v55.0.0/sdk/notifications/).

### iOS

- ActivityKit Live Activities are rendered by a WidgetKit extension on the Lock Screen and Dynamic
  Island. They can be updated by the app or by ActivityKit push updates, and their combined static
  and dynamic state is limited to 4 KB. Hermes does not currently contain the required widget
  extension, so ActivityKit is a new-native-binary feature rather than an OTA change.
  Source: [Apple ActivityKit](https://developer.apple.com/documentation/ActivityKit/).

### Provided `android.pdf`

The three-page PDF is a Google marketing email for Cloud Storage for Firebase: storage buckets,
media upload/download, pause/resume transfers, security rules, and introductory credits. It does not
describe Android notifications, foreground services, Live Updates, Tailscale, or message delivery.

Decision: do not add Firebase Storage. Hermes run state is small structured event data, not blob or
user-generated media. Storage would add billing, authentication, and synchronization failure modes
without fixing the reported UI or delivery defects.

### Kimi Code comparison

Kimi Code is a capable repository coding agent with CLI/IDE integration, tool execution, MCP,
skills, hooks, and optional sub-agents. Hermes already has these engineering lanes, so adding Kimi as
another writer would increase subscription, secret, and file-ownership risk without fixing runtime
mobile state. It is useful as competitive product evidence: Kimi's June 29, 2026 release separated
completion sound, completion notifications, and issue notifications into individual settings, with
issue notifications off by default.

Sources: [Kimi Code overview](https://www.kimi.com/code/docs/en/) and
[Kimi Code release notes](https://www.kimi.com/code/docs/en/kimi-code/whats-new.html).

Decision: do not install or subscribe during this incident. Adopt the product pattern—separate
purpose toggles, quiet defaults, and terminal-event alerts—inside Hermes.

## Product decision

### P0 — safe for the current Expo runtime

1. Use one stable notification identifier for the complete run lifecycle.
2. Update immediately on meaningful phase changes: sending, working/tools, responding, approval,
   completed, failed.
3. Deduplicate identical relay-poll events and throttle body/token churn within a phase.
4. Prefer a reply snippet over elapsed time and generic “computer/tools” boilerplate.
5. Keep Android status/results LOW priority and lock-screen visibility PRIVATE. Only approvals remain
   interruptive.
6. Replace the ongoing card in place at completion; do not cancel then create a second card.
7. Preserve the semantic dedupe signature when Chat returns to the foreground. Foreground cleanup
   may hide the card, but backgrounding the same unchanged run must not post it again.

This is implemented by T-353. It improves the existing local notification path and does not claim to
be Android's promoted Live Update or iOS ActivityKit.

### P1 — next deliberate native store binary

1. Android 16+: add a minimal native module for `Notification.ProgressStyle`, promoted-ongoing
   permission/request, eligibility checks, and a standard template. Fall back to the P0 card on older
   Android versions or when promotion is unavailable.
2. iOS: add a WidgetKit/ActivityKit extension with a compact run state and approval deep link.
3. Measure notification-to-chat open rate, duplicate update count, time-to-first-meaningful-state,
   and stale-card cleanup. Do not use elapsed time as the primary product signal.

These items require native projects and store binaries. They must be batched into one release train,
not used to trigger repeated EAS builds.

### P0 release blockers outside T-353

The screenshots expose separate state-machine defects, not one notification bug:

- A transient gateway reachability/bootstrap change mounts `ConnectMacGate` over Chat. The gate must
  be first-run-only or require a sustained disconnected state; reconnect/background transitions must
  stay on Chat with an inline status. This surface is already owned by T-65 and was not edited here.
- The computer picker mutates scan/results while its variable-height content changes, which explains
  the visible jump/jitter. `MacScanProgressCard` and scan truth are owned by T-352.
- “Wrong key” means the network endpoint answered but Hermes application authentication failed.
  Tailscale discovers/routs a machine; it cannot safely derive the Hermes API key. Re-pairing must be
  secure and automatic where an already trusted identity exists. Auth/header files are already owned.
- A USB label while off-home is cached-profile truth leaking into live transport truth. The label must
  come from the authenticated endpoint used for the current request, never from a saved route name.
- Prompt durability, persistent banner-collapse preference, and connection-gate navigation remain
  independent acceptance gates. Unit-test success on notification copy does not prove them fixed.
- Settings already exposes separate Approval alerts, Live run status, and Completion/failure toggles.
  The remaining quiet-default migration touches settings/storage files held by active tasks; it must
  be coordinated rather than overwritten. Until then, live status remains LOW/no-sound and the
  same-run background repost is suppressed by T-353.

## Release gate

No “Uber-like” claim is allowed from copy alone. Minimum proof is:

- focused and full Jest green;
- TypeScript green;
- release-device background run shows exactly one status card, semantic phase changes, private
  lock-screen content, reply snippet on completion, and no duplicate card;
- background/reconnect never replaces Chat with onboarding;
- no paid EAS build until all native changes for the next binary are batched and the release candidate
  passes the stranger cold-start and authenticated off-home Tailscale flows.
