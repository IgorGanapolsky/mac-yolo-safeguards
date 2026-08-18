---
name: tauri-capability-engine
description: Tauri 2.0-Style Capability-Based Security, Least-Privilege ACL & IPC Isolation Engine for AI coding agents. Enforces path scopes, command denylists, and fail-closed capability verification.
---

# Tauri 2.0 Capability Security Skill

Implements the capability-based security & IPC isolation model from Tauri 2.0 (v2.tauri.app):
1. **Capability-Based Permissions**: Restricts agent file operations, shell execution, and network egress to explicitly declared capability sets (`~/.hermes/tauri/capabilities.json`).
2. **IPC Isolation Gate**: Intercepts and sanitizes all agent tool payloads before native OS execution.
3. **Scoped Path Boundaries**: Denies sensitive resources (`business_os/**`, `.git/hooks/**`, `.env`) with zero-trust defaults.

## Global System Commands

- **`bin/tauri-capability --doctor`**: Probes capability configuration and active permission grants.
- **`bin/tauri-capability --check '<json>'`**: Evaluates an agent action against the capability manifest.

## Verification

```bash
# Doctor Status Check
bin/tauri-capability --doctor

# Run Automated Test Suite
node tests/test-tauri-capability-engine.js

# Check capability on safe action
bin/tauri-capability --check '{"action":"fs:write","path":"tools/test.js"}'
```
