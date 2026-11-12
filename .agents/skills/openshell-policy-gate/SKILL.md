---
name: openshell-policy-gate
description: "Refuse an OpenShell install, a self-applied policy widening, and NVIDIA's enforcement claims as local results."
---

# OpenShell policy gate

Use this before an agent installs a sandbox runtime, adds a host, or attaches a credential.

The idea taken from https://github.com/NVIDIA/OpenShell is a declared allow list. A new host or a credential waits for a person. This gate does not install that product, start a sandbox, or attach a credential. Kernel enforcement and a formal proof stay NVIDIA's claims. Local fields stay null.

## What this gate does

- `install`, `sandbox`, their installer, their package commands, or a container image of that product is blocked with `vendor_install`.
- Turning their telemetry on is blocked with `telemetry_enable`. Turning it off is not proof a gateway is running.
- A new host, `widen`, or attaching a credential is blocked with `policy_widening` and `humanReview` true. The gate does not apply the change.
- Writing "kernel-level enforcement", "formally verified", or "anonymous telemetry" as our result is blocked with `vendor_claim_as_local`, unless the note names NVIDIA.
- A note that only cites https://github.com/NVIDIA/OpenShell stays clear. A host already on the current list stays clear.
- `applied`, `sandboxCreated`, and `credentialAttached` stay false. `localKernelEnforced` and `localFormalProof` stay null.

## Commands

```bash
node tools/openshell-policy-gate.js --action note --proposed 127.0.0.1 --current 127.0.0.1
node tools/openshell-policy-gate.js --action install
node tests/test-openshell-policy-gate.js
```

A clear review exits 0. A blocked review exits 2.
