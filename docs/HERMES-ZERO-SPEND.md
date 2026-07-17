# Hermes zero-spend mode

Hermes zero-spend mode is a host-level, fail-closed command boundary for the
MacBook Pro and Mac mini. The fleet-wide provider block is active when
`~/.hermes/NO_PAID_SPEND` exists. `grok-yolo` is a narrower permanent exception:
its shim remains local-only through loopback Ollama even when that global marker
is absent, and fails closed when its verified local model is unavailable.
The marker, manifest, and receipts are mode `0600`; no API key or prompt text is
written to them.

While active:

- the guarded `grok-yolo` wrapper remains available, but runs the open-source
  Grok Build harness only against the verified loopback Ollama model;
- remote/provider commands such as `meta-yolo`, `coco-yolo`, `ali-yolo`,
  `ibm-yolo`, direct Grok/Cortex/Qwen/Bob/Amp/Gemini entrypoints,
  Parallel entrypoints, and the Snowflake CLI exit `73` before the preserved
  original can spawn;
- bare `opencode` remains usable, but only through an isolated profile pinned to
  the verified loopback Ollama model; the profile allowlists only the local
  provider, blanks paid credentials, disables session sharing, plugins, model
  catalog fetches, Exa/web tools, and external-directory access, and stores its
  config/data/cache under `~/.hermes/zero-spend/opencode-home`; every installed
  OpenCode executable on `PATH` plus the standard curl, user-local, Homebrew,
  and `/usr/local` locations is shimmed so a higher-precedence installation
  cannot bypass the policy;
- `hermes-yolo` remains available, but its child environment is forced to
  `custom:ollama-local-64k` with an installed local model and an isolated,
  credential-free `HERMES_HOME`;
- known paid-provider credential variables are blanked in a managed environment
  overlay, so the mobile gateway, cron jobs, and child agents cannot reload them
  from the normal `.env` file;
- web and computer-use toolsets are omitted from this local-only route;
- the LiteLLM router and hourly competence probe are unloaded and disabled,
  while their prior launchd state is retained for an explicit `--disable`;
- each decision produces a prompt-free receipt under
  `~/.hermes/receipts/zero-spend/`.

The OpenCode profile also enables automatic context compaction with old tool
output pruning and a 10,000-token reserve. This is the safe high-ROI part of
prompt pruning: OpenCode removes stale tool payloads while preserving the
conversation and its dependency structure. It does not rewrite user prompts,
summarize secrets into tracked files, or install a second pruning service.
When the fleet marker is disabled, the shim passes through to the preserved
authenticated OpenCode binary and its normal provider configuration.

The `grok-yolo` exception is narrow. The gate sets
`GROK_YOLO_LOCAL_ONLY=1`, supplies the already-verified 64K Ollama model, blanks
paid-provider credentials, and gives Grok Build a private isolated home. The
wrapper pins its model alias and loopback endpoint, disables web search and
subagents, and rejects `--model` overrides. Direct `grok` still exits `73`.
Receipts record `backend: grok-build-ollama`, `inferenceScope: local`, and
`providerCostUsd: 0`; that field means no provider invoice, not free electricity
or hardware.

Grok Build external OpenTelemetry stays available for content-free fleet
metrics. It remains off until both the external OTEL master switch and an
exporter are configured. Prompt text and detailed tool parameters are forced
off by the wrapper. A Grafana onboarding page or staged config is not ingestion
proof; require collector/export evidence before claiming the dashboard is live.

The installer also pins the per-user launchd route to the local provider and
retargets the existing `hermes-yolo` permanence guard to the zero-spend gate.
The guard therefore repairs bypasses instead of reintroducing the old remote
wrapper.

The local route never selects the memory-heavy 8B 32k/64k workers. Hermes Agent
requires a real context window of at least 64k because its tool schemas and system
prompt consume a large fixed prefix. During installation the gate therefore
derives `qwen3.5:9b-hermes-64k` from the installed `qwen3.5:9b`
base and sets `num_ctx=65536`. This is a local manifest operation: it downloads
nothing and sends no prompt. The hybrid-attention model keeps the 64k worker below the
10 GiB process class that the 60-second freeze guard reclaims under memory
pressure, while retaining enough context for the observed 12k-token sessions.
The `litellm` command itself is blocked with the other provider entrypoints so
an old shell or scheduled job cannot silently reload an oversized or remote
route.

The installer preserves every existing command behind a private manifest, adds
the managed-policy pointer to the normal Hermes `.env` without printing or
copying its secrets, and is idempotent. For OpenCode, status is healthy only
when the primary path and every additional discovered executable path resolve
to the installed gate. Re-running the main repository installer also restores
this gate when the marker already exists, preventing an install, CLI upgrade,
or CI smoke from silently re-enabling a paid route.

```sh
bash scripts/install-zero-spend-gate.sh --install
bash scripts/install-zero-spend-gate.sh --status
```

`--disable` removes only the policy marker; the shims then pass through to the
preserved originals. It is intentionally an explicit operator action.

Snowflake is a separate billing surface. Zero-spend fleet setup keeps the
dedicated `HERMES_XS` warehouse suspended with `AUTO_RESUME=FALSE`; `coco-yolo`
is still blocked before Cortex can make a metered request.
