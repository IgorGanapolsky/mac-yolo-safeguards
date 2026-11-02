# ci: main push workflow stopped producing required-check receipts

<!-- source: GitHub Issue | id: 2068 | closed: 2026-10-28T22:20:54Z -->

## Question

`main` currently points to `2a85e164d45c18ffb34f16fb26305f5602c43a88` (2026-08-25 11:30 UTC), but the `CI` workflow has no push run for that commit. The latest `CI` push run returned by GitHub is `327

## Answer

The exact-main check-run read contains CodeQL/automation receipts but not the branch-protection contexts such as `macOS guard kit`, `unit-and-coverage`, `verify`, or mobile gates. Therefore a PR-hygiene closeout cannot honestly claim CI passing on the current `main` SHA.

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/2068)

---
