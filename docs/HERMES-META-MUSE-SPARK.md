# Meta Muse Spark 1.1 for Hermes and `meta-yolo`

Meta Muse Spark 1.1 is a hosted model, not downloadable weights. This integration
adds the official Meta Model API route to Hermes and installs a separate
`meta-yolo` command on both managed Macs.

## What is installed

- Model: `muse-spark-1.1`
- Base URL: `https://api.meta.ai/v1`
- Official credential name: `MODEL_API_KEY`
- Dedicated CLI engine: OpenCode 1.17.19 from the official Anomaly Homebrew tap
- Dedicated CLI model: `meta/muse-spark-1.1`
- Hermes provider: `custom:meta-muse-spark`
- Default agent mode: isolated OpenCode with only the Meta provider enabled
- Explicit Hermes mode: Chat Completions transport with `shell,file` tools
- Direct API mode: Responses API with `store=false`
- Credential storage: macOS Keychain service
  `com.igor.hermes.meta-model-api`
- Receipt directory: `~/.hermes/receipts/meta-yolo/` (directory mode 0700,
  receipt mode 0600, no prompt or output text)

Bare `meta-yolo` never launches Hermes. It launches OpenCode with the exact
model `meta/muse-spark-1.1`, pins OpenCode's `small_model` to the same model,
allowlists only provider `meta`, whitelists only `muse-spark-1.1`, disables
sharing and external plugins, and uses isolated config/data/cache/state roots
under `~/.hermes/meta-muse/`. Existing OpenCode, GLM, Qwen, or provider auth
state is not consulted.

The main `~/.hermes/config.yaml` also receives the Meta provider entry but keeps
its existing default and fallback settings. Explicit `meta-yolo --hermes` uses
the separate `~/.hermes/meta-muse-profile/config.yaml`, where both
`fallback_providers` and legacy `fallback_model` are empty. A Meta outage or
authentication failure therefore fails closed in both `meta-yolo` execution
paths.

## Commands

```bash
# Secret-safe readiness and routing proof
meta-yolo --doctor --json

# Dedicated OpenCode TUI (not Hermes)
meta-yolo

# Dedicated one-shot OpenCode coding-agent run
meta-yolo "Inspect the failing focused test, fix it, and rerun that test"

# Explicit bounded Hermes integration
meta-yolo --hermes "Review the current diff and run the focused tests"

# One direct, tool-free Responses API call
meta-yolo --raw "Explain this stack trace and give the smallest likely fix"

# Show the route and cost ceiling without sending a provider request
meta-yolo --dry-run "Inspect this repository" --json

# Use the provider from ordinary Hermes. This preserves the global Hermes
# fallback chain; use meta-yolo --hermes when strict no-fallback behavior matters.
hermes chat --provider custom:meta-muse-spark --model muse-spark-1.1 \
  --query "Review the current diff" --max-turns 4 --yolo
```

`meta-yolo` rejects provider and model overrides. The standalone OpenCode lane
is deliberately distinct from Hermes, but OpenCode does not expose a hard
per-run dollar or turn cap. It is therefore suitable for interactive and
agentic coding work where Meta usage can be monitored, while `--raw` is the
right lane for a strictly bounded question.

Explicit Hermes mode defaults to one model turn, a 65,536-token operational
context (Hermes 0.18.2 rejects smaller windows), and 1,024 output tokens. The
resulting pessimistic default ceiling is:

```text
1 × ((65,536 × $1.25/M input) + (1,024 × $4.25/M output))
= $0.086272
```

The default Hermes `--max-cost-usd` is `$0.10`; a request whose ceiling exceeds
the cap does not start. Up to four turns can be requested only with an explicit
higher dollar cap. Direct mode calculates a prompt-specific ceiling before the
call and records actual usage/cost afterward. OpenCode mode rejects
`--max-cost-usd` instead of pretending it can enforce a limit that OpenCode does
not provide.

## Why this improves the Hermes harness

The July 13 How I AI episode, “Local AI models explained: How to run a fleet of
Mac Studios and GPUs at home,” recommends four relevant patterns:

1. Assign work by model and machine strength.
2. Let cheap local models scout continuously, then use frontier intelligence to
   verify the smaller candidate set.
3. Separate the build loop from an independent review loop.
4. Keep a stable lifeguard responsible for fleet health rather than letting each
   agent invent another watcher.

This repo already had the build/independent-critic loop in
`tools/multi-agent-pipeline.js`, fleet inventory in
`tools/hermes-all-macs-setup.js`, and the gateway watchdog. The high-ROI change
is therefore not another scheduler or dashboard. Muse Spark becomes an explicit,
metered frontier-review lane with these gates:

- local or subscription-backed agents do broad discovery and implementation;
- `meta-yolo` runs the independent Meta/OpenCode review, while
  `meta-yolo --hermes` exercises the Hermes integration;
- the independent route emits a prompt-free receipt with exact provider/model;
- a Meta failure stops the lane instead of falling back and invalidating the
  claimed independent review;
- installation verifies the same wrapper hash and doctor state on both Macs.

This preserves the podcast's cost insight: do not burn a metered frontier model
24/7. Use local capacity for repetitive scanning, and spend Meta credits only on
the narrowed verification work that benefits from stronger reasoning.

## Authentication and billing

Meta's official authentication header is `Authorization: Bearer $MODEL_API_KEY`.
The repository and Hermes YAML contain only the variable name
`MODEL_API_KEY`; the key itself is never written to a tracked file or
`~/.hermes/.env`.

Hermes must receive this through `key_env: MODEL_API_KEY` only. Do not also set
`api_key: env:MODEL_API_KEY`: Hermes 0.18.2 seeds that text into its credential
pool and sends the literal header `Bearer env:MODEL_API_KEY`, which Meta
correctly rejects with 401. The installer removes that obsolete field and its
stale isolated pool entry.

On the Mac mini, the login Keychain can be writable/readable only from the
logged-in GUI audit session and return macOS status 36 over plain SSH. The
installer therefore runs its remote doctor in that console session when
passwordless `sudo launchctl asuser` is available. It does not weaken storage
to make SSH reads work.

Meta states that new Model API accounts begin with `$20` in free credits. Current
pricing is `$1.25/M` uncached input tokens, `$0.15/M` cached input tokens, and
`$4.25/M` output tokens. Reasoning tokens count as output. Web search grounding,
which `meta-yolo` does not enable by default, costs an additional `$2.50/1,000`
queries.

## Verification contract

An installation is fully ready only when all of the following are true on each
host:

- `meta-yolo --doctor --json` has `ready=true`;
- `key.usable=true` without printing the credential;
- `openCode.version` is present and `standaloneReady=true`;
- `openCode.config.model` and `openCode.config.small_model` both equal
  `meta/muse-spark-1.1`;
- `openCode.config.enabled_providers` equals `["meta"]`;
- `mainConfig.providerConfigured=true`;
- `isolatedConfig.isolatedReady=true`;
- `fallbackPolicy.qwenFallbackPossibleInMetaYolo=false`;
- the deployed wrapper SHA-256 values match;
- a live OpenCode marker, direct marker, and Hermes marker all return through
  Muse Spark and produce mode-0600 receipts.

If the key has not been created yet, installation may truthfully show only
`meta_model_api_key_missing`. That means the binary and configs are installed,
not that a provider call has been proven.

## Sources

- [Meta announcement and Muse Spark quickstart](https://developer.meta.com/ai/resources/blog/build-with-muse-spark/)
- [Responses API](https://dev.meta.ai/docs/features/responses)
- [Chat Completions API](https://dev.meta.ai/docs/features/chat-completion)
- [Authentication](https://dev.meta.ai/docs/getting-started/authentication)
- [Pricing and rate limits](https://dev.meta.ai/docs/getting-started/pricing-rate-limits)
- [OpenCode install and introduction](https://opencode.ai/docs/)
- [OpenCode CLI](https://opencode.ai/docs/cli/)
- [OpenCode config precedence and provider allowlists](https://opencode.ai/docs/config/)
- [How I AI episode](https://www.youtube.com/watch?v=dAQsmhAiews)
