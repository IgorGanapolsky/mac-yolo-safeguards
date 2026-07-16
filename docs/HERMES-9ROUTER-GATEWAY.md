# Hermes 9Router gateway

## Decision

Adopt 9Router as an **explicit, local-only compatibility gateway**, not as the
default Hermes brain and not as a credential aggregator.

The high-ROI capabilities are:

- one OpenAI-compatible localhost endpoint;
- request/usage telemetry;
- format translation that can later be evaluated against Hermes receipts;
- an isolated local Ollama rescue route that does not consume cloud credits.

The upstream project also offers subscription interception, browser-cookie
providers, cloud tunnels, MITM bridges, token compression, and automatic
provider fallback. Those features are intentionally disabled here. They add
credential, policy, quality-drift, or network-exposure risk before we have an
evaluation proving they improve Hermes.

## Safety boundary

The upstream CLI currently defaults to `0.0.0.0`. The repository wrapper does
not launch that CLI. It starts the bundled official server directly with:

- `HOSTNAME=127.0.0.1` and port `20128`;
- a 768 MB V8 old-space cap;
- isolated data under `~/.hermes/9router/data`;
- only `ollama-local/qwen2.5:3b`, available on both Macs;
- cloud, tunnel, Tailscale tunnel, outbound proxy, Headroom, Caveman, Ponytail,
  PxPipe, and RTK disabled;
- observability enabled with a 500-record cap;
- no browser, tray, LaunchAgent, autostart, npm lifecycle script, API-key copy,
  OAuth import, cookie import, or default `hermes-yolo` rewrite.

The npm package is pinned to `9router@0.5.30`. The installer downloads the
tarball once, verifies its pinned SHA-512 integrity, installs with
`--ignore-scripts`, and transfers the same bytes to the Mac mini.

## Commands

Standalone:

```bash
9router-yolo --doctor --json
9router-yolo start
9router-yolo models
9router-yolo "Reply with exactly: NINE_ROUTER_LOCAL_OK"
9router-yolo stop
```

Explicit Hermes route:

```bash
hermes-9router --doctor --json
hermes-9router "Review this change and return the three highest-risk findings"
```

`hermes-9router` writes a mode-`0600` route receipt under
`~/.hermes/receipts/hermes-9router/`. The receipt records route, model, timing,
integrity, listener, and fallback truth, but stores neither prompt nor response.

## Why it does not replace Hermes routing

Hermes already has risk-aware provider selection, paid-route alarms, and route
receipts. Replacing that with an opaque three-tier combo would create silent
quality changes and make Grok/Meta/Snowflake regressions harder to diagnose.
This adapter is explicit and fail-closed: an empty response, route drift,
non-local provider, tunnel, missing model, integrity mismatch, or non-loopback
listener makes the doctor fail.

Promotion into automatic fallback requires all of the following evidence:

1. the same task corpus run directly and through 9Router;
2. no tool-call/schema regressions;
3. lower cost or higher completion reliability;
4. latency and token overhead recorded;
5. no silent model switch;
6. provider terms reviewed for the exact authentication method.

## Cost

9Router itself is MIT-licensed and the local route uses the existing Ollama
models, so this deployment adds no API charge. Adding a paid provider later
would still incur that provider's charges and is outside this installer.

## Verification

```bash
node tests/test-9router-yolo.js
node tests/test-hermes-9router-harness.js
bash scripts/install-9router-yolo.sh
```

The installer must finish with both doctors ready, both exact-marker smokes
passing, matching wrapper hashes across Macs, and `lsof` showing only
`127.0.0.1:20128` listeners.

## Sources

- [9Router website](https://9router.com/)
- [Official source repository](https://github.com/decolua/9router)
- [npm package](https://www.npmjs.com/package/9router)
