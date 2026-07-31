---
name: secure-keychain-secrets
description: Manage and retrieve developer credentials via macOS Keychain (hermes-agent-secrets) without asking the user or logging secrets into chat/transcripts.
---

# Secure Keychain Secrets Skill

## Purpose
Enforce zero-leak credential storage using `tools/secret-store.js`. Credentials stored here are injected directly into child execution environments via `node tools/secret-store.js exec SECRET_NAME -- <command>` without exposing passwords or keys on CLI arguments or in chat transcripts.

## Workflows

### 1. Store a Credential
```bash
echo -n "SECRET_VALUE" | node tools/secret-store.js set SECRET_NAME --stdin
```

### 2. List Available Secret Keys
```bash
node tools/secret-store.js list
```

### 3. Execute a Command with Secret Injected into Process Env
```bash
node tools/secret-store.js exec LINKEDIN_PASSWORD -- node tools/social-publish.js --platform linkedin
```

## Rules
- Never output secret values to chat or stdout.
- Never write secrets to tracked files in git.
- Always use Keychain wrapper `tools/secret-store.js`.
