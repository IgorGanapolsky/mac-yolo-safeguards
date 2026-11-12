---
name: task-checkout-gate
description: "Refuse a coding task that writes the shared checkout or another task's tree, and refuse a remote cloud dev machine."
---

# Task checkout gate

Use this before a coding task picks a checkout, or before an agent installs or starts a remote dev machine.

The idea taken from https://depthfirst.com/post/secure-agent-first-cloud-dev-environment is that each task gets its own git worktree, so one task cannot change another's files. A worktree isolates files only: tasks that need a database or a service must each get their own instance, because a shared one can still be reset by another task. This gate keeps that local rule. It does not install their product, start a private machine, or open a demo booking. Their week and supply-chain sentences stay theirs. Local fields stay null.

A note that only cites that page stays clear. `git worktree add` for a path outside the shared checkout stays clear. `git checkout -b` in the shared checkout does not.

## What this gate does

- `install`, or install / enable next to their firewall product, their CLI, or a private devbox, is blocked with `vendor_install`.
- `devbox`, provision / launch / tailscale up onto a private machine, or a cloud CLI that starts one (`aws ec2 run-instances`, `gcloud compute instances create`, `az vm create`, `doctl compute droplet create`, `hcloud server create`), is blocked with `remote_devbox` and `humanReview` true. The gate does not start the machine.
- `share`, `task` with no path, a path inside the shared checkout, a path that is, contains, or sits inside another task's tree, or `git checkout -b`, is blocked with `shared_checkout`. Paths are resolved against the current directory and through symlinks first, so `.`, `./`, `../` and aliases do not slip past. With no `--shared-root`, the CLI uses this repository's main worktree as the shared checkout. `git checkout -b` and `git switch -c` are caught after git global options such as `-C <dir>`. The gate only knows the paths it is given: pass the task's real directory and every other active worktree with repeated `--other-task-path` flags.
- "operational in less than a week", "prevents supply chain attacks", "security-engineering load by roughly 70%", or "hundreds of CVEs" as our result is blocked with `vendor_claim_as_local`, unless the note names depthfirst.
- `applied`, `devboxStarted`, `firewallInstalled`, and `sharedWrite` stay false. `localSupplyChainPrevented` and `localTimeToOperational` stay null.

## Commands

```bash
# Run from the task's own worktree. Pass every other active worktree so an overlap is caught.
# Stop if the worktree list cannot be read, so an empty list never reports clear.
# Pass the command the task is about to run with --command.
set -o pipefail
wt=$(git worktree list --porcelain) || { echo "git worktree list failed; not running the gate" >&2; exit 2; }
others=$(printf '%s\n' "$wt" | awk '/^worktree /{print $2}' | grep -vx "$PWD" | sed 's/^/--other-task-path /')
node tools/task-checkout-gate.js --action task --task-path "$PWD" --command "$proposed_command" $others
node tools/task-checkout-gate.js --action devbox
node tests/test-task-checkout-gate.js
```

A clear review exits 0. A blocked review exits 2.
