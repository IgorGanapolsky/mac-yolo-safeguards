# SwiftData and Android data guidance: high-ROI Hermes Mobile changes

Date: 2026-07-21

## Decision

Keep Hermes Mobile's cross-platform React Native storage layer. Do not add SwiftData on iOS or Jetpack DataStore on Android for the same small datasets. That would create two native implementations and migration paths without fixing the current JavaScript read-modify-write races.

Apply the shared principles instead:

1. Serialize mutations to each persisted dataset.
2. Make an awaited read observe all earlier awaited writes.
3. Preserve the existing bounded, validated records and fail-safe corrupt-data behavior.
4. Add regression tests that reproduce concurrent writers before accepting the fix.

## Evidence

- Apple's 2026 SwiftData update adds `ResultsObserver` for observing matching store results outside SwiftUI and `HistoryObserver` for persistent history and sync. These are useful patterns, but SwiftData remains an Apple-platform persistence framework: <https://developer.apple.com/videos/play/wwdc2026/274/>
- Apple's `DataStore` protocol is an escape hatch for custom SwiftData persistence, not a reason to duplicate an existing React Native store: <https://developer.apple.com/documentation/swiftdata/datastore>
- Android DataStore provides asynchronous, consistent, transactional storage; its writes are serialized and reads after a completed write observe the persisted result: <https://developer.android.com/topic/libraries/architecture/datastore>
- Android's offline-first guidance recommends a local source of truth with queued writes and reconciliation: <https://developer.android.com/topic/architecture/data-layer/offline-first>

## Reproduced defects

- Twenty concurrent `recordLeashDecision` calls persisted one decision before the fix.
- Three concurrent `tailnetProbeStorage.merge` calls persisted one host before the fix.

Both defects are classic unprotected read-modify-write races over AsyncStorage. A per-store mutation queue fixes the real cross-platform failure while retaining the current schema and public API.

## Deliberately deferred

- No unused observer API: there is no currently unclaimed UI consumer, and speculative subscriptions would be dead code.
- No Room database: these are small bounded collections without relational queries or referential integrity requirements.
- No native migrations: the data shape and storage keys remain unchanged.
