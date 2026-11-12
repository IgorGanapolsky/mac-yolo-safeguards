---
name: task-checkout-gate
description: "Refuse a coding task that writes the shared checkout or another task's tree, and refuse a remote cloud dev machine."
---

# Task checkout gate

Use this before a coding task picks a checkout, or before an agent installs or starts a remote dev machine.

The idea taken from https://depthfirst.com/post/secure-agent-first-cloud-dev-environment is that each task gets its own git worktree, so one task cannot reset another's database or services. This gate keeps that local rule. It does not install their product, start a private machine, or open a demo booking. Their week and supply-chain sentences stay theirs. Local fields stay null.

A note that only cites that page stays clear. `git worktree add` for a path outside the shared checkout stays clear. `git checkout -b` in the shared checkout does not.

## What this gate does

- `install`, or install / enable next to their firewall product, their CLI, or a private devbox, is blocked with `vendor_install`.
- `devbox`, or provision / launch / tailscale up onto a private machine, is blocked with `remote_devbox` and `humanReview` true. The gate does not start the machine.
- `share`, `task` with no path, a path inside the shared checkout, the same path as another task, or `git checkout -b`, is blocked with `shared_checkout`.
- "operational in less than a week", "prevents supply chain attacks", "security-engineering load by roughly 70%", or "hundreds of CVEs" as our result is blocked with `vendor_claim_as_local`, unless the note names depthfirst.
- `applied`, `devboxStarted`, `firewallInstalled`, and `sharedWrite` stay false. `localSupplyChainPrevented` and `localTimeToOperational` stay null.

## Commands

```bash
node tools/task-checkout-gate.js --action task --task-path /Users/iganapolsky/workspace/wt-task-checkout-20261112
node tools/task-checkout-gate.js --action devbox
node tests/test-task-checkout-gate.js
```

A clear review exits 0. A blocked review exits 2.
