# Hermes Mobile — Real-Time Progress HUDs for Gateway Agent Runs

Three concurrent states must be communicated without spamming the user: **Delivering message** (incoming -> gateway ingest), **Tool use** (agent working -- search, code, shell, browser), and **Reply ready** (assistant text produced). Below is the production-ready plan.

---

## 1. Platform Constraints You Are Designing Against

| Surface | Constraint | Source |
|---|---|---|
| iOS Live Activity (Dynamic Island) | Max **8 h** active per activity; up to **4 h** additional "linger" after the user dismisses; max **5** concurrent Live Activities per app | Apple HIG -- Live Activities |
| iOS Live Activity update budget | iOS 18 raised the cadence cap so content can update without throttling for **5-15 s** updates -- do not exceed | [6] |
| Android heads-up | Triggered when `IMPORTANCE_HIGH` (or `IMPORTANCE_DEFAULT` on pre-O) and the channel is not muted | [26] |
| Android ongoing | `setOngoing(true)` keeps the notification in the shade and makes it non-dismissable; required for "still working" affordances | [71] |
| Android 14 foreground-service types | Any long-running service started from background requires `foregroundServiceType` (`dataSync`, `shortService`, etc.) declared in the manifest and at runtime | [67] |

Treat these as hard limits. Hermes Mobile's three states can comfortably live on **two concurrent Live Activities** (one for "Tool use", one for "Reply ready"), well inside Apple's 5 cap.

---

## 2. Library Choice in an Expo / RN App

Hermes Mobile is almost certainly on Expo + React Native, so the decision tree is:

- **`expo-notifications`** -- handles local + remote notifications, channel creation, and Android channels (`setNotificationChannelAsync`), and category/action registration. Use it as the **baseline transport** ([32]).
- **Live Activities** are *not* covered by `expo-notifications`. You need a native bridge. Two viable paths:
  - **`react-native-live-activities`** (npm) -- maintained TypeScript wrapper around `ActivityKit`; requires a Widget Extension target and a shared `ActivityAttributes` struct in Swift. Best DX.
  - **Custom Expo Module** (using `npx create-expo-module` plus `expo-targets`) -- heavier setup but unlocks deep customization. Used by the Fizl Live Activities tutorial and by Callstack's Voltra / Voltra-Live-Activities work.
- **Notifee** ([38]) is the right pick if you also need **Android foreground services**, **custom big-text / big-picture styles**, **progress indicators**, and **ongoing notifications**. Notifee explicitly supports Live Activities on iOS and ongoing foreground services on Android.

**Recommended split:** `expo-notifications` for push receipt + Android channel config, Notifee for *display* on Android (foreground service, ongoing, progress, actions), and a `react-native-live-activities` module for the iOS Dynamic Island. Pick one source of truth per OS.

---

## 3. The Three Lifecycle States -- UX + Implementation

Hermes's gateway runs are inherently **multi-step and long** (tool calls can chain for minutes). The right mental model is the **Uber RAMEN pattern**: a decoupled `trigger` ("when to push") and `payload` ("what to push"), so the same gateway webhook drives foreground banners, Live Activities, and Android ongoing notifications without coupling them ([23]).

### State A -- "Delivering message"
- **Trigger:** gateway receives a message from any of 20+ platforms (Telegram, Discord, Slack, WhatsApp, Signal, SMS, Email, Home Assistant, Matrix, Mattermost, Teams, LINE, BlueBubbles, Weixin, Feishu, DingTalk, ntfy, QQ, Yuanbao, Web) ([44]).
- **User intent:** "Did Hermes get this? Should I wait?"
- **UX:** No system notification. An *in-app banner only* (slim, dismissible) on iOS/Android when the app is foregrounded. Use `expo-notifications` `setNotificationCategoryAsync` to register a silent category so a system-level alert only fires if the user is on another app for >10 s.
- **iOS:** No Live Activity yet -- saving the budget for the longer tool-use state.
- **Android:** No notification at all in this phase.

### State B -- "Tool use"
- **Trigger:** gateway begins a tool call (`search_web`, `read_file`, `shell`, `browser`, `mcp_*`, `voice_tts`, etc.) that is expected to take >2 s.
- **User intent:** "Hermes is working -- what and how long?"
- **iOS (Live Activity):** Start a Live Activity whose `compactLeading` shows the tool icon (search, terminal, file, browser, speaker), `compactTrailing` shows elapsed time (mm:ss), and the expanded view shows the tool name + a determinate progress bar when an estimate exists, indeterminate spinner otherwise. Update at most every 5 s; cap at 60 updates/min. Apple's HIG: "Activity updates must be intentional and meaningful" -- don't update every byte (Apple HIG -- Live Activities).
- **Android (heads-up):** Post a notification on an `IMPORTANCE_HIGH` channel -- that triggers the heads-up peek automatically. Include the tool name, a short title ("Hermes is searching the web"), and `setOngoing(true)` so the user can't swipe it away mid-tool. Use Notifee's `displayNotification({ android: { asForegroundService: true, progress: { max, current, indeterminate } } })` to keep the system from killing the process during long tools.
- **iOS accessibility note:** Live Activities are announced by VoiceOver; never put secrets in them (Apple HIG).

### State C -- "Reply ready"
- **Trigger:** gateway finishes streaming, before the user opens the chat.
- **iOS:** End the Live Activity (`Activity.end(...)`) with a `dismissalPolicy` of `.after(now + 60 s)` so the result lingers on the lock screen briefly, then auto-clears. Optionally show a one-shot heads-up notification via APNs (rich notification) so the user hears the *ding* even if their phone is locked.
- **Android:** Replace the ongoing tool-use notification with a normal notification (`setAutoCancel(true)`, deep-link back into the chat with the reply fragment). The `IMPORTANCE_HIGH` channel will not show heads-up for this one -- move it to `IMPORTANCE_DEFAULT` to avoid over-notifying.
- **Both:** Notification action buttons -- "Open reply" (default tap) and "Mute this chat" (per-chat channel routing) ([68]).

---

## 4. Concrete Module Layout

```
hermes-mobile/
  ios/HermesWidget/         # Widget Extension target (Live Activity)
    HermesActivityAttributes.swift   # shared between app + widget
    HermesLiveActivityView.swift     # SwiftUI lock-screen + Dynamic Island UI
  modules/hermes-hud/
    src/HudProvider.tsx              # React context: current HUD state
    src/useHudChannel.ts             # subscribes to gateway websocket/SSE
    src/ios/liveActivity.ts          # react-native-live-activities wrapper
    src/android/notification.ts      # notifee.displayNotification wrapper
    src/states.ts                    # DELIVERING | TOOL_USE | REPLY_READY FSM
```

State machine (pseudo):

```
IDLE
  -> on "message_received"  -> DELIVERING
       -> on "tool_started" -> TOOL_USE
            -> on "tool_finished" (more tools pending) -> TOOL_USE (update)
            -> on "reply_ready"   -> REPLY_READY -> IDLE (after tap/dismiss)
```

Keep state *server-authoritative*: the gateway emits `delivering | tool | ready` events; the client never infers state from local timers. This mirrors Uber's "trigger + payload" separation so the same payload can drive Live Activity, heads-up, and in-app toast ([23]).

---

## 5. Anti-Patterns To Reject

1. **Don't ship raw tool output to the lock screen.** PII, file paths, and credentials must stay in-app; the Live Activity copy should be at most ~12 words (Apple HIG -- Live Activities).
2. **Don't use Live Activities for >8 h.** Hermes replies are minutes, not days -- if a tool call exceeds 6 h, switch to a push-notification-only fallback and surface a status row in-app.
3. **Don't put Live Activity creation behind a paywall / sign-in gate** without a system-wide setting; users opt in once per app in Settings -> (app) -> Allow Live Activities (Apple HIG).
4. **Don't spam heads-up for `IMPORTANCE_HIGH` on every tool.** Reserve high-importance channels for **state transitions** (tool started, reply ready). Use `IMPORTANCE_LOW` or silent for in-progress sub-step updates.
5. **Don't keep the foreground service alive past the tool.** Use Notifee's `stopForegroundService()` on `reply_ready`; otherwise Android will start flagging the app for background abuse ([59]).
6. **Don't run more than 5 Live Activities concurrently.** Hermes already covers this with the FSM above (max 1 tool-use + 1 reply-ready at any moment).

---

## 6. Ship Checklist

- [ ] iOS: Widget Extension target with `HermesActivityAttributes` shared between app and widget; Live Activity enabled in `Info.plist` (`NSSupportsLiveActivities = YES`).
- [ ] iOS: Dynamic Island layouts in `compactLeading/compactTrailing/minimal/expanded` per Apple HIG; never use the camera cutout region for content (Apple HIG).
- [ ] Android: Two channels -- `hermes.tool_use` (`IMPORTANCE_HIGH`, heads-up + ongoing) and `hermes.reply` (`IMPORTANCE_DEFAULT`, auto-cancel). Created once at app start via `setNotificationChannelAsync`.
- [ ] Android: Foreground service declared with `foregroundServiceType="dataSync"` (or `shortService` for sub-3-min tools) and matching `FOREGROUND_SERVICE_DATA_SYNC` permission in the manifest.
- [ ] Both: Action buttons -- "Open", "Stop", "Mute chat" -- registered through `setNotificationCategoryAsync` / Notifee categories.
- [ ] Both: Respect per-chat muting; never heads-up a muted thread.
- [ ] Both: Honor Reduce Motion / DND -- fall back to silent in-app banner when `Notification.permissionStatus !== 'granted'` or `UIAccessibility.isReduceMotionEnabled`.

---

## 7. What To Ship For Hermes Mobile (v1)

1. **In-app toast + banner** for `delivering` (sub-second state).
2. **Live Activity + ongoing notification** for `tool_use`, updated at most every 5 s with current tool name + elapsed time.
3. **One-shot rich notification** for `reply_ready`, with deep-link to the chat and "Mute" / "Reply" actions.
4. **Per-chat notification routing** so heads-up only fires on threads the user has marked "Notify".
5. **Telemetry**: log every state transition with a `run_id` to correlate gateway logs with client HUD logs (essential for the agent-progress measurement push from the gateway blog: "real-time participant state synchronization" -- Uber RAMEN).

This gives Hermes Mobile an Uber-grade real-time HUD without violating either platform's notification contract, and stays inside Hermes Agent's gateway "deliver + cron + sessions" mental model ([44]).

---

**References**

- Apple HIG -- Live Activities: https://developer.apple.com/design/human-interface-guidelines/live-activities
- Pushwoosh -- iOS Live Activities (duration, refresh limits, iOS 18 cadence): https://www.pushwoosh.com/blog/ios-live-activities
- OneSignal -- Best Practices for Using Live Activities: https://onesignal.com/blog/best-practices-for-using-live-activities-in-your-ios-app
- Android -- Heads-up notifications: https://source.android.com/docs/automotive/hmi/notifications/hun
- Android -- Build a notification (ongoing, importance): https://developer.android.com/develop/ui/views/notifications/build-notification
- Android 14 -- Foreground service types required: https://developer.android.com/about/versions/14/changes/fgs-types-required
- Notifee -- Foreground service docs: https://notifee.app/react-native/docs/android/foreground-service
- Notifee -- Overview & features: https://notifee.app/react-native/docs
- expo-notifications -- SDK reference: https://docs.expo.dev/versions/latest/sdk/notifications/
- expo-notifications -- Sending notifications (channel priority, `sound`, `categoryId`): https://docs.expo.dev/push-notifications/sending-notifications/
- Uber Engineering -- Real-Time Push Platform (RAMEN trigger/payload model): https://www.uber.com/us/en/blog/real-time-push-platform
- Hermes Agent -- Messaging Gateway & platforms: https://hermes-agent.nousresearch.com/docs/user-guide/messaging
- React Native Live Activities npm: https://www.npmjs.com/package/react-native-live-activities
- Fizl -- Live Activities in React Native with Expo (custom-module pattern): https://fizl.io/blog/posts/live-activities

## References

1. *Designing for AI Agents: 10 UX Patterns (2026) — Mantlr*. https://mantlr.com/blog/designing-for-ai-agents-ux-patterns-2026
2. [[Feature] Show progress indicator during tool execution ...](https://github.com/anthropics/claude-code/issues/60320)
3. *Claude Code 2026 — Statusline Update and the Multi ...*. https://ice-ice-bear.github.io/posts/2026-03-06-claude-code-statusline-2026
4. *UX/UI Design and AI Agents*. https://medium.com/design-bootcamp/ux-ui-design-and-ai-agents-a9122a370a38
5. *UX Design Agent Skills | AI UX Playground*. http://aiuxplayground.com/skills/category/ui-design
6. *iOS Live Activities: How they work, examples & best practices*. https://www.pushwoosh.com/blog/ios-live-activities
7. *Best Practices for Using Live Activities in Your iOS App*. https://onesignal.com/blog/best-practices-for-using-live-activities-in-your-ios-app
8. *Live Activities iPhone design guidelines and best practices*. https://secture.com/en/guia-y-buenas-practicas-de-diseno-de-live-activities-para-iphone-caso-practico-con-wikiloc
9. *iOS Live Activities: ActivityKit, Dynamic Island & Lock ...*. http://newly.app/articles/ios-live-activities
10. *Mastering Live Activities in iOS: The Complete Developer’s ...*. https://medium.com/%40gauravharkhani01/mastering-live-activities-in-ios-the-complete-developers-guide-5357eb35d520
11. *iOS Live Activities in Expo React Native with Dynamic Data - Medium*. https://medium.com/%40kiyo07/ios-live-activities-in-expo-react-native-with-dynamic-data-041b2fce45ce
12. *Implementing Live Activities in React-Native with Expo - Fizl*. https://fizl.io/blog/posts/live-activities
13. *Building iOS Live Activities With React: Inside Voltra - Callstack*. https://www.callstack.com/events/building-ios-live-activities-with-react
14. *Dynamic Island & Live Activities in a React Native Expo App! - Reddit*. https://www.reddit.com/r/reactnative/comments/1m18dy9/dynamic_island_live_activities_in_a_react_native
15. *Creating Dynamic Island widget using React Native - Medium*. https://medium.com/%40ankit.ad.dhawan/first-step-towards-creating-a-dynamic-island-widget-using-react-native-e6877a3fad52
16. *Notifications - Expo Documentation*. https://docs.expo.dev/versions/latest/sdk/notifications
17. *Implementing Modern Push Notifications in React Native ...*. https://medium.com/%40santosh.pk/implementing-modern-push-notifications-in-react-native-android-notifee-72de60ee2712
18. *Creating Push Notifications Rapidly With Notifee in React ...*. https://semaphore.io/blog/notifee
19. *Send notifications with the Expo Push Service*. https://docs.expo.dev/push-notifications/sending-notifications
20. *Notifee*. https://docs.page/invertase/notifee/react-native/reference/TypeAlias.IOSNotificationInterruptionLevel
21. *Uber built a great ridesharing experience with SMS & Voice | Twilio*. http://customers.twilio.com/en-us/uber
22. *Ride-Hailing MVP Platform - Exore LTD*. https://exore.pro/cases/ride-hailing-mvp-platform
23. *Uber's Real-Time Push Platform*. https://www.uber.com/us/en/blog/real-time-push-platform
24. *Hey riders Did you know that you can receive Transit app ...*. https://www.facebook.com/ridegcrta/posts/hey-riders-did-you-know-that-you-can-receive-transit-app-notifications-straight-/1331120392380849
25. *Zum Bus Tracker App*. http://rcps.info/departments/transportation/zum-bus-tracker-app
26. *Heads-up notifications*. https://source.android.com/docs/automotive/hmi/notifications/hun
27. *Some Best Practices in Using Android Notification | by Kayvan Kaseb*. https://medium.com/kayvan-kaseb/some-best-practices-in-using-android-notification-a957f9245278
28. *📲 Designing the Android Notification System — A Deep Dive*. https://medium.com/%40YodgorbekKomilo/designing-the-android-notification-system-a-deep-dive-a161c43bd823
29. *Understanding Notifications in Android: A Developer’s Guide*. https://itnext.io/understanding-notifications-in-android-a-developers-guide-fce100810f1c
30. *Newest 'android-notifications' Questions - Stack Overflow*. https://stackoverflow.com/questions/tagged/android-notifications?tab=Newest
31. *Agent UX: UI Design for AI Agents in 2026 - fuselabcreative.com*. https://fuselabcreative.com/ui-design-for-ai-agents
32. [title: Notifications description: A library that provides an API to fetch push notification tokens and to present, schedule, receive and respond to notifications. sourceCodeUrl: 'https://github.com/expo/expo/tree/sdk-57/packages/expo-notifications' packageName: 'expo-notifications' iconUrl: '/static/images/packages/expo-notifications.png' platforms: ['android', 'ios']](https://docs.expo.dev/versions/latest/sdk/notifications/)
33. *Cursor Agent Skill Usage Example — UI UX Pro ... - changyou*. https://changyou.medium.com/cursor-agent-skill-usage-example-ui-ux-pro-max-technology-unveiled-and-practical-application-a13f36e70a6d
34. *Cursor Background Agents: Complete Guide (2026) - ameany.io*. https://ameany.io/cursor-background-agents
35. *Background Cursor agent using the Cursor CLI*. https://trigger.dev/docs/guides/example-projects/cursor-background-agent
36. *Cursor: AI coding agent*. http://cursor.so/
37. *Cursor Background Agent: Async AI Coding Tasks Explained*. https://buildfastwith.ai/cursor-background-agent-guide
38. *Overview | Notifee*. https://notifee.app/react-native/docs
39. *Stream responses in real-time - Claude Code Docs*. https://code.claude.com/docs/en/agent-sdk/streaming-output
40. *claude_code/docs/guides/streaming-output.md at main - GitHub*. https://github.com/guess/claude_code/blob/main/docs/guides/streaming-output.md
41. *Claude Code | tmux-agent-sidebar*. https://hiroppy.github.io/tmux-agent-sidebar/agents/claude-code
42. *Progressive Disclosure UI - Claude Code Skill for UX - MCP Market*. https://mcpmarket.com/tools/skills/progressive-disclosure-ui-designer
43. *Using Claude Design for prototypes and UX*. https://claude.com/resources/tutorials/using-claude-design-for-prototypes-and-ux
44. *Messaging Gateway | Hermes Agent*. https://hermes-agent.nousresearch.com/docs/user-guide/messaging
45. *hermes-agent/website/docs/user-guide/messaging/index.md at ...*. https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/messaging/index.md
46. *Messaging Gateway and Platforms | NousResearch/hermes-agent ...*. https://zread.ai/NousResearch/hermes-agent/17-messaging-gateway-and-platforms
47. *Messaging Gateway | NousResearch/hermes-agent | DeepWiki*. https://deepwiki.com/NousResearch/hermes-agent/7-messaging-gateway
48. *hermes-agent/AGENTS.md at main*. http://github.com/NousResearch/hermes-agent/blob/main/AGENTS.md
49. *Introducing GitHub Copilot agent mode (preview)*. https://code.visualstudio.com/blogs/2025/02/24/introducing-copilot-agent-mode
50. *Devin AI Progress Report: The Autonomous Coder One Year Later*. https://thedailyclaws.com/blog/2026-03-14-bots-devin-ai-progress-report
51. *GitHub - github/app: The GitHub Copilot app is an agent ...*. https://github.com/github/app
52. *In-Depth Product Analysis of Devin, the Hottest AI Developer*. https://ppaolo.substack.com/p/in-depth-product-analysis-devin-cognition-labs
53. *Devin | The AI Software Engineer*. http://devin.ai/
54. *react-native-widget-extension - npm*. https://www.npmjs.com/package/react-native-widget-extension
55. *react-native - npm*. https://www.npmjs.com/package/react-native?activeTab=versions
56. *React-native-widget-extension NPM | npm.io*. https://npm.io/package/react-native-widget-extension
57. *Compatibility - expo-ui.thunderdevelops.in*. https://expo-ui.thunderdevelops.in/docs/compatibility
58. *Issue with React Native version mismatch : r/expo - Reddit*. https://www.reddit.com/r/expo/comments/1ng54gx/issue_with_react_native_version_mismatch
59. *Foreground Service | Notifee*. https://notifee.app/react-native/docs/android/foreground-service
60. *Styles | Notifee*. https://notifee.app/react-native/docs/android/styles
61. *modificationDate: June 09, 2026 title: Send notifications with the Expo Push Service description: Learn how to call Expo Push Service API to send push notifications from your server.*. https://docs.expo.dev/push-notifications/sending-notifications/
62. *iOS Live Activities in React Native - bndkt*. https://bndkt.com/blog/2023/ios-live-activities
63. *React Native's New Architecture - Expo Documentation*. https://docs.expo.dev/guides/new-architecture
64. *react-native-ios-alarmkit/docs/LIVE_ACTIVITY_SETUP.md at ...*. https://github.com/sauravhiremath/react-native-ios-alarmkit/blob/master/docs/LIVE_ACTIVITY_SETUP.md
65. *IOS Live Activities with Expo & React Native - kutay.boo*. https://kutay.boo/blog/expo-live-activity
66. *Create and manage notification channels  |  Jetpack Compose  |  Android Developers*. https://developer.android.com/develop/ui/views/notifications/channels
67. *Foreground service types are required  |  Android Developers*. https://developer.android.com/about/versions/14/changes/fgs-types-required
68. [title: Notifications description: A library that provides an API to fetch push notification tokens and to present, schedule, receive and respond to notifications. sourceCodeUrl: 'https://github.com/expo/expo/tree/sdk-57/packages/expo-notifications' packageName: 'expo-notifications' iconUrl: '/static/images/packages/expo-notifications.png' platforms: ['android', 'ios']](https://docs.expo.dev/versions/latest/sdk/notifications/#settings)
69. *hermes-agent/AGENTS.md at main · NousResearch/hermes-agent · GitHub*. https://github.com/NousResearch/hermes-agent/blob/main/AGENTS.md
70. *Create a notification  |  Jetpack Compose  |  Android Developers*. https://developer.android.com/develop/ui/views/notifications/build-notification#importance
71. *Create a notification  |  Jetpack Compose  |  Android Developers*. https://developer.android.com/develop/ui/views/notifications/build-notification
72. *modificationDate: June 09, 2026 title: Send notifications with the Expo Push Service description: Learn how to call Expo Push Service API to send push notifications from your server.*. https://docs.expo.dev/push-notifications/sending-notifications/#notification-channels
