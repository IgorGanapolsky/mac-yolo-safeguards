# Hermes ZCode Harness

`tools/hermes-zcode-harness.js` turns the July 2, 2026 Z.ai/ZCode announcement into a bounded Hermes harness receipt. The source PDF advertises ZCode as an official GLM-5.2 harness with goal mode, independent verification, custom subagents, remote QR session control, and Coding Plan quota metadata.

This repo does not treat that email as an API spec. The adapter only creates Hermes-native gates and receipts:

- goal receipts must use an independent verifier before completion language is allowed
- subagents must declare model, escalation model, allowed permissions, denied permissions, and verifier
- remote control receipts are QR-safe status/pause/resume/approval payloads with no keys or destructive grants
- Coding Plan quota is routing metadata only; the local/free default route is unchanged unless paid, cost, and approval gates explicitly allow GLM 5.2

## Commands

```bash
node tools/hermes-zcode-harness.js --pdf /Users/igorganapolsky/Downloads/zai.pdf --json
node tools/hermes-zcode-harness.js --pdf /Users/igorganapolsky/Downloads/zai.pdf --write --markdown
node tests/test-hermes-zcode-harness.js
```

Artifacts written with `--write` go to `artifacts/hermes-zcode-harness/latest.json` and `.md`.

## Surfaces Covered

The harness maps the ZCode ideas across Hermes surfaces without touching mobile WIP files:

- `desktop_cli`: `hermes-yolo` keeps local defaults; GLM escalation stays gated.
- `gateway_8642`: health and completion proof remain separate.
- `mobile`: QR payloads request approval and carry no secrets.
- `multi_agent`: planner, implementer, verifier, and remote operator have separate models and permissions.
- `ci_and_plan`: `plan.md`, tests, CI, and latest E2E proof remain external verifier gates.
- `all_macs`: host, branch, gateway, and key-presence truth are reported separately.

## Non-Goals

- No provider calls.
- No default provider switch.
- No key persistence.
- No merge, delete, publish, or force-push action through a QR receipt.
- No claim that Hermes is using ZCode itself. This is a Hermes-native harness inspired by the announcement.
