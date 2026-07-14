# Hermes zero-spend mode

Hermes zero-spend mode is a host-level, fail-closed command boundary for the
MacBook Pro and Mac mini. It is active when `~/.hermes/NO_PAID_SPEND` exists.
The marker, manifest, and receipts are mode `0600`; no API key or prompt text is
written to them.

While active:

- remote/provider commands such as `grok-yolo`, `meta-yolo`, `coco-yolo`,
  `ali-yolo`, `ibm-yolo`, direct Grok/Cortex/Qwen/Bob/Amp/Gemini entrypoints,
  Parallel entrypoints, and the Snowflake CLI exit `73` before the preserved
  original can spawn;
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

The installer also pins the per-user launchd route to the local provider and
retargets the existing `hermes-yolo` permanence guard to the zero-spend gate.
The guard therefore repairs bypasses instead of reintroducing the old remote
wrapper.

The local route never selects a 32k/64k worker directly. During installation it
derives `qwen3:8b-hermes-20k` from an already-installed `qwen3:8b` model (or a
compact 3B fallback) and sets `num_ctx=20480`. This is a local manifest operation:
it downloads nothing and sends no prompt. The bounded context leaves room for
the observed 12k-token Hermes sessions without crossing the 10 GiB worker class
that the 60-second freeze guard reclaims under memory pressure.
The `litellm` command itself is blocked with the other provider entrypoints so
an old shell or scheduled job cannot silently reload an oversized or remote
route.

The installer preserves every existing command behind a private manifest, adds
the managed-policy pointer to the normal Hermes `.env` without printing or
copying its secrets, and is idempotent. Re-running the main repository installer also restores this gate
when the marker already exists, preventing an install or CI smoke from silently
re-enabling a paid route.

```sh
bash scripts/install-zero-spend-gate.sh --install
bash scripts/install-zero-spend-gate.sh --status
```

`--disable` removes only the policy marker; the shims then pass through to the
preserved originals. It is intentionally an explicit operator action.

Snowflake is a separate billing surface. Zero-spend fleet setup keeps the
dedicated `HERMES_XS` warehouse suspended with `AUTO_RESUME=FALSE`; `coco-yolo`
is still blocked before Cortex can make a metered request.
