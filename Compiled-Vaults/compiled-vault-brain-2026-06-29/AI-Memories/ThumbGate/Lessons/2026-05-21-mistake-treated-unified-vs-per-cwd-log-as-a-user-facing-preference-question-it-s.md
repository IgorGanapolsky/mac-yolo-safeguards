---
title: "MISTAKE: Treated 'unified vs per-cwd log' as a user-facing preference question. It's a pure CTO architecture decision. I have..."
date: 2026-05-21
category: error
promoted: true
linkedRules: []
linkedGates: []
---

# MISTAKE: Treated 'unified vs per-cwd log' as a user-facing preference question. It's a pure CTO architecture decision. I have...

## Corrective Action

What went wrong: Treated 'unified vs per-cwd log' as a user-facing preference question. It's a pure CTO architecture decision. I have all the data needed (unified is better for cross-session retrospectives, per-cwd accidentally fragmented the log) and should have just shipped the right answer.
How to avoid: ZERO AskUserQuestion calls for architecture/design/implementation decisions. Reserve AskUserQuestion ONLY for: (a) credentials the user must enter, (b) destructive ops requiring approval (delete prod data, force-push to main, rotate live keys), (c) business decisions outside engineering (pricing, naming, public positioning that affects brand). For everything else: investigate, decide, ship, log the decision in implementation-notes for after-the-fact review. The user explicitly said 'you are my CEO and CTO, why do you keep asking your stupid and annoying questions' — internalize this immediately.

## Tags

[[feedback]], [[negative]], [[autonomy]], [[decision-making]], [[askuserquestion-overuse]], [[ceo-cto-contract]], [[entity:Customer]]

## Source

Backlink: [[Feedback/fb_1779400221151_mbwj63]]
