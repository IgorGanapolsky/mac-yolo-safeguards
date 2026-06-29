---
title: Used 'security ... -g' flag while verifying a keychain entry — the -g flag PRINTS the password to stderr, leaking the base64-encoded Railway config (containing accessToken + refreshToken) into the chat transcript. Third secret-leak in this session after the Perplexity API key and the GitHub PAT.
date: 2026-05-20
signal: down
category: security-leak
tags: 
  - security-leak
  - credentials
  - thumbs-down
  - keychain
  - macos-security-cli
  - pattern-mistake
actionType: store-mistake
sourceFeedbackId: fb_1779305792713_c6rjdl
---

# Used 'security ... -g' flag while verifying a keychain entry — the -g flag PRINTS the password to stderr, leaking the base64-encoded Railway config (containing accessToken + refreshToken) into the chat transcript. Third secret-leak in this session after the Perplexity API key and the GitHub PAT.

## Context

reach for -g (Get/print) when I only meant to test existence; macOS security CLI uses -g to mean DISPLAY the password, not 'get the entry metadata'

## Corrective Action

(1) NEVER use 'security ... -g' to verify keychain entries — that flag PRINTS the secret. To check existence only, use 'security find-generic-password -s NAME -a USER 1>/dev/null 2>&1 && echo present || echo absent'. (2) Add a pre-Bash hook that flags 'security.*-g' patterns and warns before exec. (3) When persisting any secret to keychain, the verify-step must read the result into a length-only check (e.g., pipe to wc -c), never print the value.

## Tags

[[security-leak]], [[credentials]], [[thumbs-down]], [[keychain]], [[macos-security-cli]], [[pattern-mistake]]
