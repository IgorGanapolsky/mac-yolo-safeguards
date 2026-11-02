# feat(control-plane): restore Continuity store entitlement verify (#169)

<!-- source: Merged PR | id: 2176 | closed: 2026-10-29T14:02:17.964Z -->

## Question

feat(control-plane): restore Continuity store entitlement verify (#169)

## Answer

Summary by CodeRabbit

* **New Features**
  * Added device-authenticated store entitlement verification for Thumbgate Leash.
  * Supports Android and iOS receipt validation, including recognized receipt formats.
  * Successful verification grants an active entitlement and upgrades eligible accounts to Pro.
  * Existing Team plans are preserved while entitlement expiration is recorded.
  * Added production verification through configured Google Play and App Store integrations.

* **Bug Fixes**

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2176)

---
