---
name: thumbgate-dashboard-latest-at-bottom
description: >
  thumbgate.app thread console must read like a chat: oldest first, newest
  bubble next to the composer. Duplicate oldest-first task cards between the
  460px history pane and the textarea are the "all over the place" bug.
  Slash: /thumbgate-dashboard-latest-at-bottom.
---

# Dashboard latest message sits on the composer

## Symptom

https://thumbgate.app/dashboard with a thread open (e.g. Real Estate): today's
USER SENT bubble is in the middle of the pane, an old COMPLETED card sits
under it, and the composer is at the bottom. Sidebar "Newest first" is fine
for the chat *list*. The *thread* must be chronological.

## Root class (2026-08-25)

1. `.conversation-history` desktop `max-height:460px` shows a slice of synced
   snapshot messages.
2. `#task-activity` then dumps the same thread's tasks **oldest-first**
   between that slice and the composer.
3. Snapshot array is rendered unsorted (newest-first payloads put today at the
   top of the 460px window).

## Required fix

- `orderSnapshotChronologically` + `orderTasksChronologically` (oldest first)
- `hideDuplicateTaskList` when a thread is selected and filter is `all`
- Desktop CSS: `.task-panel .conversation-history { max-height: none }`
- Running notice uses `latestChronologicalTask`, not `visibleTasks[0]`
- `scrollConversationHistoryToLatest` after send/load

```bash
node --test apps/hermes-control-plane/tests/dashboard-conversation-latest-at-bottom.test.mjs
npx vitest run lib/dashboard-task-order.test.ts
```

Live: merge is not enough until the Worker deploy. Do not type LIVE VERIFY
into the product chat.

Complementary to OPEN PRs that also touch `DashboardClient.tsx` (#2041 CLOUD
PENDING, #1989 composer honesty) — this PR only changes timeline order +
hides the duplicate card dump.
