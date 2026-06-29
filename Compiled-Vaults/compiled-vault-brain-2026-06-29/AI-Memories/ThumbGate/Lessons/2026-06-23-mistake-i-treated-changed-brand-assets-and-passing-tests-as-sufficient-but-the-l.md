---
title: "MISTAKE: I treated changed brand assets and passing tests as sufficient, but the live landing nav still rendered..."
date: 2026-06-23
category: error
promoted: true
linkedRules: []
linkedGates: []
---

# MISTAKE: I treated changed brand assets and passing tests as sufficient, but the live landing nav still rendered...

## Corrective Action

What went wrong: I treated changed brand assets and passing tests as sufficient, but the live landing nav still rendered /thumbgate-icon.png at 36x36 and the test asserted that bad state.
How to avoid: For visual brand fixes, verify the production-served HTML and screenshot/pixel-visible result. Tests must assert the desired visible asset and dimensions, not merely that some logo asset exists.

## Tags

[[feedback]], [[negative]], [[brand]], [[logo]], [[verification]], [[production]], [[entity:Customer]]

## Source

Backlink: [[Feedback/fb_1782238678422_ka2wvp]]
