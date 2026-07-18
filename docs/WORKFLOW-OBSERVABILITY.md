# Workflow observability

`tools/workflow-observability.js` turns each autonomous execution into one private,
machine-readable receipt and uses those receipts to catch the failure modes described by
AI-automation operators: an unexplained API bill, retry storms, executions that fail without an
operator signal, and nominally successful workflows whose business outcome never arrived.

The implementation is local-first and dependency-free. It does not record prompts, command
arguments, stdout, response bodies, credentials, or customer content. The default state is mode
`0700`/`0600` under:

```text
~/Library/Application Support/mac-yolo-safeguards/workflow-observability/
  executions.jsonl
  notification-state.json
  reports/YYYY-MM-CLIENT.json
  reports/YYYY-MM-CLIENT.md
```

## What one receipt proves

Each `workflow-observability/run-v1` line can attribute:

- workflow id/version, pseudonymous client id, run id, start/end/duration, and terminal status;
- exit code and retry count;
- provider/model plus measured input/output tokens;
- measured or provider-reported cost;
- measured/contracted time saved;
- downstream outcome signals such as `lead_created=true` or `invoices=4`.

Unknown cost, tokens, and time saved remain `null` with `attribution: unknown`. Reports never turn
missing evidence into `$0` cost or invented savings.

## Record existing workflows

An adapter that already owns execution can append a bounded result:

```bash
node tools/workflow-observability.js record \
  --workflow lead-delivery \
  --version workflow-v7 \
  --client client-17 \
  --status success \
  --retry-count 0 \
  --provider openai \
  --model gpt-5 \
  --input-tokens 1250 \
  --output-tokens 220 \
  --cost-usd 0.0124 \
  --outcome lead_created=true \
  --outcome records=1
```

For n8n, put this in a final Execute Command node on both the success and error branches, mapping
only execution metadata and explicit outcome counters. Do not pass node payloads or credentials.
The same CLI works for LaunchAgents, cron, GitHub Actions, and local agent wrappers.

## Prevent duplicate side effects

The `run` adapter executes once and hashes the supplied idempotency key before storage. If that
workflow already completed successfully under the same key, the command is not spawned and a
`deduped` receipt links to the original run:

```bash
node tools/workflow-observability.js run \
  --workflow invoice-send \
  --client client-17 \
  --idempotency-key invoice-42/customer-17 \
  --outcome invoice_sent=true \
  -- ./scripts/send-invoice.sh
```

This wrapper never retries a command. The workflow owner chooses its retry policy and records the
retries already consumed with `--retry-count`. It can also fail closed before spawning a command
when a retry or estimated-cost budget is exhausted:

```bash
node tools/workflow-observability.js run \
  --workflow ai-enrichment \
  --retry-count 2 \
  --max-retries 2 \
  --estimated-cost-usd 0.25 \
  --max-cost-usd 0.10 \
  -- ./scripts/enrich-leads.sh
```

A blocked command exits `78` and records `guard_blocked=true`; neither the command nor another API
attempt runs. An estimate is never reported as actual spend: reports sum only `--cost-usd`.

## Detect silent failure and cost burn

Expectations live in `config/workflow-observability.json`. A workflow can declare:

- `expectedEveryMinutes`: heartbeat/cadence SLO;
- `maxRetries`: per-run retry ceiling;
- `maxCostUsd`: per-run cost cap when measured cost exists;
- `requireCostAttribution`: alert when a paid/AI execution succeeds without cost evidence;
- `requiredOutcomes`: proof that execution success produced the intended result;
- `failureWindowMinutes` and `failureBurstThreshold`: repeated-failure storm guard.

Scan without side effects:

```bash
node tools/workflow-observability.js scan --json
```

`--notify` sends a local macOS notification for high-severity findings. Notifications are keyed by
finding fingerprint and suppressed for six hours so an hourly monitor does not become an alert
storm. The hourly `smart-ops` controller records its revenue, reply-monitor, market-signal, and
controller executions; scans after every cycle; and refreshes the current monthly report.

## Produce a client/account report

```bash
node tools/workflow-observability.js report \
  --month 2026-07 \
  --client client-17 \
  --write \
  --json
```

The report includes attempts, success rate, failures/timeouts, retries, deduplicated side effects,
attributed cost, unpriced attempts, attributed tokens, attributed time saved, downstream outcome
totals, and bounded exception receipts. It is evidence for a retainer review, not a marketing
estimate.

## Verification

```bash
node tests/test-workflow-observability.js
node tests/test-smart-ops-controller.js
node --check tools/workflow-observability.js
node --check tools/smart-ops-controller.js
```

`test-smart-ops-controller.js` invokes the observability suite so the existing CI entrypoint covers
the new tool without editing the currently owned central CI script.
