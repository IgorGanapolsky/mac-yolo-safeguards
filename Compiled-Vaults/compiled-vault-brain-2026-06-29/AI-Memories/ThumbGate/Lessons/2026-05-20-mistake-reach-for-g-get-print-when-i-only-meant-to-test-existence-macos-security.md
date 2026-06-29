---
title: "MISTAKE: reach for -g (Get/print) when I only meant to test existence; macOS security CLI uses -g to mean DISPLAY the password,..."
date: 2026-05-20
category: error
promoted: true
linkedRules: []
linkedGates: []
---

# MISTAKE: reach for -g (Get/print) when I only meant to test existence; macOS security CLI uses -g to mean DISPLAY the password,...

## Corrective Action

What went wrong: reach for -g (Get/print) when I only meant to test existence; macOS security CLI uses -g to mean DISPLAY the password, not 'get the entry metadata'
How to avoid: (1) NEVER use 'security ... -g' to verify keychain entries — that flag PRINTS the secret. To check existence only, use 'security find-generic-password -s NAME -a USER 1>/dev/null 2>&1 && echo present || echo absent'. (2) Add a pre-Bash hook that flags 'security.*-g' patterns and warns before exec. (3) When persisting any secret to keychain, the verify-step must read the result into a length-only check (e.g., pipe to wc -c), never print the value.

## Tags

[[feedback]], [[negative]], [[security-leak]], [[credentials]], [[thumbs-down]], [[keychain]], [[macos-security-cli]], [[pattern-mistake]]

## Source

Backlink: [[Feedback/fb_1779305792713_c6rjdl]]
