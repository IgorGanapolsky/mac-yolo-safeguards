# P0: repair unreadable mobile landing footer and shorten homepage

<!-- source: GitHub Issue | id: 2115 | closed: 2026-10-28T22:21:45Z -->

## Question

At a phone viewport, the public `thumbgate.app` footer collapses its brand, offer copy, navigation links, and the oversized primary CTA into narrow adjacent columns. The result is unreadable and visib

## Answer

Acceptance criteria
- At 390×844, footer brand, offer text, navigation, and CTA do not overlap or collapse below readable widths; no horizontal overflow.
- The primary CTA is full-width or naturally stacked below navigation on mobile.
- The homepage no longer renders the long interactive approval demo and four-step explanatory sequence inline.
- Navigation/deep links keep the moved explanatory content accessible.
- A focused regression test fails on current `origin/main` and passes on the fix.
-

[View source](https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/2115)

---
