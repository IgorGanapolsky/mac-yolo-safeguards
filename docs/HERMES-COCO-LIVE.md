# Hermes + Snowflake CoCo

This integration provides three separate, verifiable surfaces:

1. `coco-yolo` is a dedicated Snowflake Cortex Code command. It never opens
   Hermes and never selects GLM, Qwen, or Grok.
2. `hermes-yolo` automatically routes Snowflake and SQL prompts to CoCo. Other
   ordinary prompts continue to Grok 4.5; Hermes administrative commands stay
   on the legacy Hermes command path.
3. `snowflake-hermes-readonly` is the separate Snowflake Labs MCP registration
   for bounded `SELECT` and `DESCRIBE` operations from Codex.

None of these surfaces silently falls back to another model or provider.

## Install on both Macs

From this repository, the fleet installer stages executable copies on the
current Mac and `hermes-mini`:

```sh
bash scripts/install-coco-yolo.sh
```

It does not copy credentials. Each Mac keeps its own mode-0600 Snowflake
credential and reuses connection `hermes-coco-readonly` without opening a
browser. The installer verifies the connection and compares the three deployed
executable hashes.

## Standalone use

Open the native Cortex Code terminal interface:

```sh
coco-yolo
```

Run one prompt through Cortex Code's official Agent Client Protocol (ACP):

```sh
coco-yolo "Snowflake: summarize HERMES warehouse usage"
```

Prompt mode is not an alias to `hermes`. It starts `cortex acp serve` with the
Snowflake connection, creates one ACP session, selects the reported `plan`
configuration, sends one prompt, prints the streamed CoCo response, and exits.

Inspect readiness without a model call:

```sh
coco-yolo --doctor --json
```

`cortex exec`, `--print`, model overrides, connection overrides, and bypass
mode are refused. This Snowflake subscription rejects Cortex Code's ordinary
print/exec path; ACP is the supported non-interactive integration transport.

## Automatic Hermes route

These prompts select Snowflake CoCo:

```sh
hermes-yolo "Snowflake: list tables related to revenue"
hermes-yolo "SQL: SELECT CURRENT_ROLE()"
hermes-yolo "Show the Snowsight warehouse usage"
```

The classifier uses high-signal Snowflake, Snowsight, Cortex Analyst, explicit
`SQL:`, and SQL statement patterns. A phrase such as "select the best model"
does not match merely because it contains the word `select`.

Overrides are explicit:

```sh
HERMES_YOLO_BACKEND=coco hermes-yolo "inspect analytics"
HERMES_YOLO_BACKEND=grok hermes-yolo "Snowflake documentation review"
HERMES_YOLO_BACKEND=hermes hermes-yolo chat
```

`HERMES_YOLO_BACKEND=auto` is the default. If the selected CoCo or Grok
launcher is unavailable, the command fails and records the blocker; it never
falls through to Qwen.

Inspect both routes:

```sh
hermes-yolo --route-status
hermes-coco --task "Snowflake: verify the automatic Hermes route" --json
```

The second command is dry by default. A bounded live SQL marker requires both
`--execute` and `--paid-ok` because Snowflake warehouse work can consume
credits.

## Safety boundaries

The terminal and ACP paths enforce overlapping controls:

- connection: `hermes-coco-readonly`
- terminal SQL: `--sql-read-only`
- ACP SQL: `CORTEX_CLIENT_READ_ONLY=1`
- ACP operating mode: `plan`
- ACP client capabilities: no client filesystem or terminal capabilities
- ACP permission requests: always rejected
- terminal MCP loading: disabled
- prompt text: never written to Hermes or CoCo receipts
- receipts: private, mode 0600
- fallback: disabled

The current machine-local programmatic token is server-side restricted to
`ACCOUNTADMIN`. Therefore this is read-only at the client/MCP policy layers,
not yet a least-privilege Snowflake principal. `HERMES_CORTEX_ROLE` exists and
has the narrow grants, but it needs a separately authorized role-restricted
credential before the principal can honestly be called least-privilege.

## Cost boundary

The integration does not buy credits, enable auto top-up, or change billing.
ACP prompt calls and live SQL queries can consume existing Snowflake credits.
The `HERMES_XS` warehouse is X-Small with 60-second auto-suspend. Readiness
doctors and route-classification tests do not call a model or resume the
warehouse.

## Proof surfaces

Treat these independently:

- CLI installed: `cortex --version`, `snow --version`
- cached authentication: `snow connection test -c hermes-coco-readonly`
- standalone CoCo: exact marker from `coco-yolo PROMPT`
- automatic route: exact marker plus `hermes-yolo` route receipt
- Snowflake query MCP: initialize, list tools, return a `SELECT` marker, block
  an `ALTER` probe
- cross-Mac deployment: matching executable hashes and exact markers per host
- account safety: warehouse returns to `SUSPENDED`
- CI: the pull request checks pass after deployment code is merged

Configuration files alone are not runtime proof.
