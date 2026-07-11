# Hermes All-Macs Setup

Source-backed verifier:

```bash
node tools/hermes-all-macs-setup.js --json
```

Optional private artifact:

```bash
node tools/hermes-all-macs-setup.js --write --json
```

The write target defaults to `~/.hermes/all-macs-setup-latest.json` with mode
`0600`.

## What Changed

`tools/hermes-all-macs-setup.js` turns the current Hermes multi-Mac setup into a
single read-only readiness matrix:

- local Mac identity, LAN IPs, and tailnet IPs
- Tailscale/Hermes gateway discovery through the existing
  `tools/hermes-discover-tailscale-macs.js` probe
- AI vault and sync artifact presence
- Sakana/Fugu and NVIDIA Nemotron provider candidate readiness
- Darwin Godel Machine style adoption actions: propose, smoke, evaluate, record,
  then promote only after evidence

## Provider Mapping

Sakana Fugu is treated as an optional multi-agent model route, not an automatic
default. The verifier currently models:

- `openrouter-fugu-ultra`: `sakana/fugu-ultra` through OpenRouter, smoke-ready
  only when `OPENROUTER_API_KEY` exists
- `sakana-direct-fugu`: direct Fugu candidate, blocked until `SAKANA_API_KEY`,
  `SAKANA_BASE_URL`, region, endpoint, and smoke evidence are confirmed
- `sakana-direct-fugu-ultra`: direct Fugu Ultra candidate, same direct API gates

The official Fugu page says Fugu and Fugu Ultra are available through one
OpenAI-compatible API, with Fugu aimed at everyday coding/interactive work and
Fugu Ultra aimed at harder multi-step reasoning. It also links OpenRouter and
Vercel availability for Fugu Ultra. Those are candidate signals only; they are
not live Hermes routing proof.

NVIDIA Nemotron is also treated as a candidate route, not an automatic default.
The verifier models:

- `openrouter-nemotron3-ultra`: `nvidia/nemotron-3-ultra-550b-a55b` through
  OpenRouter, smoke-ready only when `OPENROUTER_API_KEY` exists
- `openrouter-nemotron3-super-free`:
  `nvidia/nemotron-3-super-120b-a12b:free` through OpenRouter, useful as a
  low/no-cost candidate before promoting heavier Nemotron routing
- `nvidia-nim-nemotron3-ultra`: direct NVIDIA NIM-style candidate, blocked
  until `NVIDIA_API_KEY`, `NVIDIA_NIM_BASE_URL`, region, endpoint, cost, and
  smoke evidence are confirmed

The NVIDIA Nemotron page positions Nemotron 3 Ultra for complex agentic tasks:
planning, code generation, deep research, tool use, synthesis, verification,
and recovery with long context. That makes it relevant to Hermes harness
evaluation, but still only after catalog, smoke, cost, and quality receipts.

## Adoption Gate

Do not promote a Sakana/Fugu/Nemotron route to Hermes default until all of these are true:

1. At least one Hermes gateway is reachable over tailnet `:8642/health`.
2. The installed Hermes AI vault validates locally.
3. The provider key is present in the runtime that launches the gateway.
4. A capped smoke test records latency, output quality, and cost.
5. A second task class passes, so the route is not overfit to one prompt.
6. The recursive experiment ledger records evaluator, reward-hack, and variance
   checks.

## Boundaries

- This verifier does not edit `~/.hermes/config.yaml`.
- It never prints API key values; it reports env-var presence only.
- All-Macs setup is not the same as Hermes Mobile E2E readiness.
- AI vault/sync artifacts are context proof, not proof of revenue, sends, merges,
  or customer delivery.
