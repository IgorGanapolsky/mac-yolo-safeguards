---
name: hosted-authority-split
description: >
  TNS Perplexity harness FORMAT for thumbgate.app: reasoning proposes, deterministic
  code grants authority. If the sandbox is unavailable, disable tools before any call.
  Permission is not asking a model in English. Trigger: Perplexity agent harness,
  reasoning from authority, sandbox unavailable, hosted tool execute, thenewstack
  perplexity-agent-harness-security. Slash: /hosted-authority-split.
  Do not clone Perplexity Computer or dual-edit Codex #2142.
---

# Hosted authority split (not Perplexity Computer)

## Goal

Produce a fail-closed **authority receipt** for whom: hosted Hermes on thumbgate.app —
the model may propose; code decides; tools never run when the sandbox is down.

## Constraints

| NEVER | ALWAYS |
|-------|--------|
| Clone Perplexity Computer / DGX Spark / PPLX 27B | Steal reasoning≠authority + fail-closed disable |
| Dual-edit Codex #2142 `agent-harness-router` / WebMCP kit | New files + hosted runner refuse-tools |
| Ask the model "is this safe?" as a grant | `MODEL_CANNOT_GRANT_AUTHORITY` |
| Execute tools when sandbox is missing | `SANDBOX_UNAVAILABLE` before the call |
| Expand hosted Hermes into a Computer SKU | Keep $10 chat + in-app approvals |
| Net-new ThumbGate governance engine | `/eci-thumbgate-ip-wall` (`counsel_clearance` false) |

HARD fail closed. REFUSE SKU clones.

## Reference

- https://thenewstack.io/perplexity-agent-harness-security/
- `tools/hosted-authority-split.js` · `bin/hosted-authority`
- Runner: `services/hermes-cloud-runner/server.js` (`AUTHORITY_DISABLED`)
- Admission code: `apps/hermes-control-plane/lib/cloud-tool-policy.ts`
- Honesty doctor (we are not them): [[hosted-computer-stack]]
- Codex complement: mac-yolo #2142 (do not dual-edit)

## Examples (show, don't tell)

Weak: Stack another critic model so the agent is smarter about safety.

Gold:

```bash
$ node bin/hosted-authority doctor --json
{ "ok": true, "status": "AUTHORITY_IS_CODE", "weArePerplexityComputer": false }
$ node bin/hosted-authority decide '{"action":"tool_call","modelSaidSafe":true}'
{ "executeTool": false, "code": "MODEL_CANNOT_GRANT_AUTHORITY" }
$ node tests/test-hosted-authority-split.js
test-hosted-authority-split: PASS
```

## Procedures

```bash
node tools/hosted-authority-split.js doctor --json
node tools/hosted-authority-split.js decide '{"action":"text"}'
node --test services/hermes-cloud-runner/test/server.test.js
node tests/test-hosted-authority-split.js
```

1. Treat model output as a **proposal**.
2. Run `decide()` in code. English "this is safe" is not a grant.
3. Hosted VPS has no OS sandbox → disable tools before the call.
4. Do not dump MCP tool schemas into the hosted completion request.

## Rubric

- ok=true when doctor `status=AUTHORITY_IS_CODE` and tests PASS
- tool_call with `modelSaidSafe` → executeTool false
- sandboxReady false → `SANDBOX_UNAVAILABLE`
- weArePerplexityComputer must be false
- doctor_exit=0
- evidence: command output in the same turn
