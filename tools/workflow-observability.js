#!/usr/bin/env node
'use strict';

/**
 * workflow-observability.js
 *
 * Local-first execution accounting for autonomous workflows. The ledger stores
 * bounded metadata only: no prompts, command arguments, stdout, or response bodies.
 *
 * Commands:
 *   record  append a completed run supplied by another process
 *   run     execute one command once and append its result
 *   scan    detect terminal failures, missed cadence, retry storms, cost overruns,
 *           and successful executions that missed their required outcome
 *   report  aggregate a UTC calendar month into JSON or an evidence-only Markdown report
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_STATE_DIR =
  process.env.WORKFLOW_OBSERVABILITY_DIR ||
  path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'mac-yolo-safeguards',
    'workflow-observability',
  );
const DEFAULT_CONFIG_PATH = path.join(REPO, 'config', 'workflow-observability.json');
const RUN_SCHEMA = 'workflow-observability/run-v1';
const REPORT_SCHEMA = 'workflow-observability/report-v1';
const ALLOWED_STATUSES = new Set(['success', 'failed', 'timeout', 'skipped', 'deduped']);
const ATTEMPT_STATUSES = new Set(['success', 'failed', 'timeout']);
const FAILED_STATUSES = new Set(['failed', 'timeout']);

const usage = `Usage:
  node tools/workflow-observability.js record --workflow ID --status STATUS [options]
  node tools/workflow-observability.js run --workflow ID [options] -- <command> [args...]
  node tools/workflow-observability.js scan [--config PATH] [--notify] [--json]
  node tools/workflow-observability.js report [--month YYYY-MM] [--client ID] [--write] [--json]

Run metadata options:
  --client ID                 Pseudonymous client/account id (default: internal)
  --version VERSION           Workflow version or source revision
  --retry-count N             Retries already consumed; this tool never retries commands
  --provider NAME             AI/API provider name
  --model NAME                Model name
  --input-tokens N            Measured input tokens
  --output-tokens N           Measured output tokens
  --cost-usd N                Measured or provider-reported run cost
  --estimated-cost-usd N      Pre-run estimate for the command wrapper
  --max-cost-usd N            Refuse run when its estimate exceeds this cap
  --max-retries N             Refuse run when retry-count exceeds this ceiling
  --time-saved-minutes N      Measured/contracted avoided handling time
  --outcome key=value         Repeatable downstream outcome signal
  --idempotency-key VALUE     Hashed before storage; prior success suppresses the command
  --error-class NAME          Bounded failure class
  --error-message TEXT        Redacted and truncated; never pass secrets
  --source NAME               Calling automation or adapter
  --state-dir PATH            Private ledger/report directory
  --config PATH               Workflow expectations JSON
  --timeout-ms N              run command timeout (default: 120000)

STATUS is success, failed, timeout, skipped, or deduped.`;

function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // Best effort on filesystems that do not support POSIX modes.
  }
}

function statePaths(stateDir = DEFAULT_STATE_DIR) {
  return {
    stateDir,
    ledgerPath: path.join(stateDir, 'executions.jsonl'),
    notificationStatePath: path.join(stateDir, 'notification-state.json'),
    reportDir: path.join(stateDir, 'reports'),
  };
}

function nonNegativeNumber(value, name, { integer = false } = {}) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${name} must be a non-negative ${integer ? 'integer' : 'number'}`);
  }
  return parsed;
}

function boundedText(value, max = 200) {
  if (value == null) return null;
  const text = String(value).replace(/[\r\n\t]+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function redactText(value) {
  const text = boundedText(value, 240);
  if (!text) return null;
  return text
    .replace(/\bghp_[A-Za-z0-9_]+\b/g, '[redacted-github-token]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, '[redacted-github-token]')
    .replace(/\bsk_live_[A-Za-z0-9_]+\b/g, '[redacted-stripe-key]')
    .replace(/\bxai-[A-Za-z0-9_-]+\b/g, '[redacted-provider-key]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, 'Bearer [redacted]')
    .replace(
      /\b(api[-_]?key|token|secret|password|authorization)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[redacted]',
    );
}

function safeIdentifier(value, fallback = null) {
  const text = boundedText(value, 100);
  if (!text) return fallback;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(text) || text.includes('..')) {
    throw new Error(`invalid identifier: ${text}`);
  }
  return text;
}

function parseOutcomeValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  return redactText(value);
}

function parseOutcome(text) {
  const index = String(text || '').indexOf('=');
  if (index <= 0) throw new Error('--outcome must be key=value');
  const key = safeIdentifier(String(text).slice(0, index));
  return [key, parseOutcomeValue(String(text).slice(index + 1))];
}

function sanitizeOutcomes(outcomes) {
  const result = {};
  for (const [rawKey, rawValue] of Object.entries(outcomes || {})) {
    const key = safeIdentifier(rawKey);
    if (/token|secret|password|authorization|api[-_]?key|credential/i.test(key)) {
      result[key] = '[redacted]';
    } else if (typeof rawValue === 'boolean' || rawValue == null) {
      result[key] = rawValue;
    } else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      result[key] = rawValue;
    } else {
      result[key] = redactText(rawValue);
    }
  }
  return result;
}

function idempotencyHash(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

function normalizeTimestamp(value, fallback) {
  const timestamp = value || fallback;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) throw new Error(`invalid timestamp: ${timestamp}`);
  return new Date(parsed).toISOString();
}

function normalizeRecord(input, now = Date.now()) {
  const workflowId = safeIdentifier(input.workflowId || input.workflow);
  if (!workflowId) throw new Error('workflowId is required');
  const status = String(input.status || '').toLowerCase();
  if (!ALLOWED_STATUSES.has(status)) {
    throw new Error(`invalid status: ${status || '<missing>'}`);
  }
  const finishedAt = normalizeTimestamp(input.finishedAt, new Date(now).toISOString());
  const durationMs = nonNegativeNumber(input.durationMs, 'durationMs', { integer: true });
  const inferredStart = new Date(Date.parse(finishedAt) - (durationMs || 0)).toISOString();
  const startedAt = normalizeTimestamp(input.startedAt, inferredStart);
  const normalizedDuration =
    durationMs == null ? Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)) : durationMs;
  const inputTokens = nonNegativeNumber(input.inputTokens, 'inputTokens', { integer: true });
  const outputTokens = nonNegativeNumber(input.outputTokens, 'outputTokens', { integer: true });
  const costUsd = nonNegativeNumber(input.costUsd, 'costUsd');
  const estimatedCostUsd = nonNegativeNumber(input.estimatedCostUsd, 'estimatedCostUsd');
  const maxCostUsd = nonNegativeNumber(input.maxCostUsd, 'maxCostUsd');
  const maxRetries = nonNegativeNumber(input.maxRetries, 'maxRetries', { integer: true });
  const timeSavedMinutes = nonNegativeNumber(input.timeSavedMinutes, 'timeSavedMinutes');

  return {
    schema: RUN_SCHEMA,
    runId: safeIdentifier(input.runId, crypto.randomUUID()),
    workflowId,
    workflowVersion: safeIdentifier(input.workflowVersion || input.version, 'unknown'),
    client: safeIdentifier(input.client, 'internal'),
    idempotencyHash: input.idempotencyHash || idempotencyHash(input.idempotencyKey),
    startedAt,
    finishedAt,
    durationMs: normalizedDuration,
    status,
    exitCode:
      input.exitCode == null ? null : nonNegativeNumber(input.exitCode, 'exitCode', { integer: true }),
    retryCount: nonNegativeNumber(input.retryCount ?? 0, 'retryCount', { integer: true }),
    provider: safeIdentifier(input.provider, null),
    model: safeIdentifier(input.model, null),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens:
        inputTokens == null && outputTokens == null
          ? null
          : Number(inputTokens || 0) + Number(outputTokens || 0),
      attribution: inputTokens == null && outputTokens == null ? 'unknown' : 'supplied',
    },
    cost: {
      usd: costUsd,
      attribution: costUsd == null ? 'unknown' : 'supplied',
      estimatedUsd: estimatedCostUsd,
      maxUsd: maxCostUsd,
    },
    timeSaved: {
      minutes: timeSavedMinutes,
      attribution: timeSavedMinutes == null ? 'unknown' : 'supplied',
    },
    outcomes: sanitizeOutcomes(input.outcomes),
    error:
      status === 'failed' || status === 'timeout'
        ? {
            class: safeIdentifier(input.errorClass, status),
            message: redactText(input.errorMessage),
          }
        : null,
    source: safeIdentifier(input.source, 'manual'),
    governance: {
      maxRetries,
      costGateEvaluated: estimatedCostUsd != null && maxCostUsd != null,
    },
  };
}

function appendExecution(input, options = {}) {
  const record = input?.schema === RUN_SCHEMA ? input : normalizeRecord(input, options.now);
  const paths = statePaths(options.stateDir);
  const ledgerPath = options.ledgerPath || paths.ledgerPath;
  ensurePrivateDir(path.dirname(ledgerPath));
  fs.appendFileSync(ledgerPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(ledgerPath, 0o600);
  } catch {
    // Best effort.
  }
  return record;
}

function readExecutions(options = {}) {
  const ledgerPath = options.ledgerPath || statePaths(options.stateDir).ledgerPath;
  if (!fs.existsSync(ledgerPath)) return [];
  const runs = [];
  const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed?.schema === RUN_SCHEMA && parsed.workflowId && parsed.finishedAt) runs.push(parsed);
    } catch (error) {
      if (options.strict) throw new Error(`invalid ledger JSON at line ${i + 1}: ${error.message}`);
    }
  }
  return runs;
}

function findIdempotentSuccess(runs, workflowId, hash) {
  if (!hash) return null;
  return [...runs]
    .reverse()
    .find(
      (run) =>
        run.workflowId === workflowId &&
        run.idempotencyHash === hash &&
        (run.status === 'success' || run.status === 'deduped'),
    );
}

function executeObserved(input, options = {}) {
  const workflowId = safeIdentifier(input.workflowId || input.workflow);
  if (!workflowId) throw new Error('workflowId is required');
  const hash = idempotencyHash(input.idempotencyKey);
  const existing = findIdempotentSuccess(readExecutions(options), workflowId, hash);
  if (existing) {
    const record = appendExecution(
      {
        ...input,
        workflowId,
        status: 'deduped',
        exitCode: 0,
        durationMs: 0,
        idempotencyHash: hash,
        outcomes: { ...(input.outcomes || {}), deduped: true, original_run_id: existing.runId },
      },
      options,
    );
    return { record, childStatus: 0, deduped: true };
  }

  const retryCount = nonNegativeNumber(input.retryCount ?? 0, 'retryCount', { integer: true });
  const maxRetries = nonNegativeNumber(input.maxRetries, 'maxRetries', { integer: true });
  const estimatedCostUsd = nonNegativeNumber(input.estimatedCostUsd, 'estimatedCostUsd');
  const maxCostUsd = nonNegativeNumber(input.maxCostUsd, 'maxCostUsd');
  const retryBlocked = maxRetries != null && retryCount > maxRetries;
  const costBlocked =
    estimatedCostUsd != null && maxCostUsd != null && estimatedCostUsd > maxCostUsd;
  if (retryBlocked || costBlocked) {
    const reason = retryBlocked ? 'retry_budget_exhausted' : 'estimated_cost_cap_exceeded';
    const record = appendExecution(
      {
        ...input,
        workflowId,
        status: 'skipped',
        exitCode: 78,
        durationMs: 0,
        idempotencyHash: hash,
        outcomes: { ...(input.outcomes || {}), guard_blocked: true, guard_reason: reason },
      },
      options,
    );
    return { record, childStatus: 78, deduped: false, blocked: true, reason };
  }

  const command = input.command;
  const commandArgs = input.commandArgs || [];
  if (!command) throw new Error('run requires a command after --');
  const startedMs = options.now ?? Date.now();
  const spawn = options.spawn || spawnSync;
  const result = spawn(command, commandArgs, {
    cwd: input.cwd || process.cwd(),
    env: input.env || process.env,
    stdio: options.stdio || 'inherit',
    timeout: input.timeoutMs || 120_000,
  });
  const finishedMs = options.finishedNow ?? Date.now();
  const timedOut = result?.error?.code === 'ETIMEDOUT';
  const childStatus = Number.isInteger(result?.status) ? result.status : timedOut ? 124 : 1;
  const status = timedOut ? 'timeout' : childStatus === 0 ? 'success' : 'failed';
  const record = appendExecution(
    {
      ...input,
      workflowId,
      status,
      exitCode: childStatus,
      idempotencyHash: hash,
      startedAt: new Date(startedMs).toISOString(),
      finishedAt: new Date(finishedMs).toISOString(),
      durationMs: Math.max(0, finishedMs - startedMs),
      errorClass: status === 'success' ? null : timedOut ? 'timeout' : 'nonzero_exit',
      errorMessage: status === 'success' ? null : `child exited ${childStatus}`,
    },
    options,
  );
  return { record, childStatus, deduped: false };
}

function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  if (!fs.existsSync(configPath)) return { schema: 'workflow-observability/config-v1', workflows: [] };
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!Array.isArray(parsed.workflows)) throw new Error('config.workflows must be an array');
  return parsed;
}

function finding(workflowId, code, severity, detail, runId = null) {
  const fingerprint = crypto
    .createHash('sha256')
    .update([workflowId, code, runId || '', detail].join('|'))
    .digest('hex')
    .slice(0, 24);
  return { workflowId, code, severity, detail, runId, fingerprint };
}

function isOutcomePresent(outcomes, key) {
  const value = outcomes?.[key];
  return value === true || (typeof value === 'number' && value > 0) || (typeof value === 'string' && value.length > 0);
}

function scanExecutions(options = {}) {
  const now = options.now ?? Date.now();
  const runs = options.runs || readExecutions(options);
  const config = options.config || loadConfig(options.configPath);
  const configured = new Map((config.workflows || []).map((item) => [item.id, item]));
  const workflowIds = new Set([...configured.keys(), ...runs.map((run) => run.workflowId)]);
  const findings = [];
  const workflowStatus = [];

  for (const workflowId of [...workflowIds].sort()) {
    const expectation = configured.get(workflowId) || {};
    const relevant = runs
      .filter((run) => run.workflowId === workflowId)
      .sort((a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt));
    const attempts = relevant.filter((run) => ATTEMPT_STATUSES.has(run.status));
    const latest = attempts[attempts.length - 1] || null;
    const latestSuccess = [...attempts].reverse().find((run) => run.status === 'success') || null;

    if (!latest) {
      workflowStatus.push({ workflowId, state: 'unobserved', lastRunAt: null, findingCount: 0 });
      continue;
    }

    if (FAILED_STATUSES.has(latest.status)) {
      findings.push(
        finding(
          workflowId,
          'terminal_failure',
          'high',
          `latest execution is ${latest.status} at ${latest.finishedAt}`,
          latest.runId,
        ),
      );
    }

    const expectedEveryMinutes = nonNegativeNumber(
      expectation.expectedEveryMinutes,
      `${workflowId}.expectedEveryMinutes`,
    );
    if (expectedEveryMinutes != null) {
      const ageMs = now - Date.parse(latest.finishedAt);
      if (ageMs > expectedEveryMinutes * 60_000) {
        findings.push(
          finding(
            workflowId,
            'missed_cadence',
            'high',
            `last execution is ${Math.floor(ageMs / 60_000)}m old; expected within ${expectedEveryMinutes}m`,
            latest.runId,
          ),
        );
      }
    }

    const maxRetries = nonNegativeNumber(expectation.maxRetries ?? 3, `${workflowId}.maxRetries`, {
      integer: true,
    });
    if (Number(latest.retryCount || 0) > maxRetries) {
      findings.push(
        finding(
          workflowId,
          'retry_limit_exceeded',
          'high',
          `retryCount=${latest.retryCount} exceeds maxRetries=${maxRetries}`,
          latest.runId,
        ),
      );
    }

    const maxCostUsd = nonNegativeNumber(expectation.maxCostUsd, `${workflowId}.maxCostUsd`);
    if (maxCostUsd != null && latest.cost?.usd != null && Number(latest.cost.usd) > maxCostUsd) {
      findings.push(
        finding(
          workflowId,
          'cost_cap_exceeded',
          'high',
          `run cost $${Number(latest.cost.usd).toFixed(6)} exceeds $${maxCostUsd.toFixed(6)}`,
          latest.runId,
        ),
      );
    }

    if (expectation.requireCostAttribution === true && latest.status === 'success' && latest.cost?.usd == null) {
      findings.push(
        finding(
          workflowId,
          'cost_attribution_missing',
          'high',
          'execution succeeded without measured or provider-reported cost',
          latest.runId,
        ),
      );
    }

    if (latestSuccess && Array.isArray(expectation.requiredOutcomes)) {
      const missing = expectation.requiredOutcomes.filter(
        (key) => !isOutcomePresent(latestSuccess.outcomes, key),
      );
      if (missing.length) {
        findings.push(
          finding(
            workflowId,
            'required_outcome_missing',
            'high',
            `execution succeeded but outcome missing: ${missing.join(', ')}`,
            latestSuccess.runId,
          ),
        );
      }
    }

    const failureWindowMinutes = nonNegativeNumber(
      expectation.failureWindowMinutes ?? 60,
      `${workflowId}.failureWindowMinutes`,
    );
    const failureBurstThreshold = nonNegativeNumber(
      expectation.failureBurstThreshold ?? 3,
      `${workflowId}.failureBurstThreshold`,
      { integer: true },
    );
    const recentFailures = attempts.filter(
      (run) => FAILED_STATUSES.has(run.status) && now - Date.parse(run.finishedAt) <= failureWindowMinutes * 60_000,
    );
    if (recentFailures.length >= failureBurstThreshold) {
      findings.push(
        finding(
          workflowId,
          'failure_burst',
          'high',
          `${recentFailures.length} failures in ${failureWindowMinutes}m`,
          recentFailures[recentFailures.length - 1].runId,
        ),
      );
    }

    workflowStatus.push({
      workflowId,
      state: findings.some((item) => item.workflowId === workflowId) ? 'alert' : 'healthy',
      lastRunAt: latest.finishedAt,
      lastSuccessAt: latestSuccess?.finishedAt || null,
      findingCount: findings.filter((item) => item.workflowId === workflowId).length,
    });
  }

  return {
    schema: 'workflow-observability/scan-v1',
    checkedAt: new Date(now).toISOString(),
    runCount: runs.length,
    workflowCount: workflowIds.size,
    alertCount: findings.length,
    findings,
    workflows: workflowStatus,
  };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writePrivateJson(file, value) {
  ensurePrivateDir(path.dirname(file));
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Best effort.
  }
}

function defaultLocalNotifier(item) {
  if (process.platform !== 'darwin') return { sent: false, reason: 'unsupported_platform' };
  const title = `Workflow alert: ${item.workflowId}`.replace(/["\\]/g, '');
  const body = `${item.code}: ${item.detail}`.slice(0, 220).replace(/["\\]/g, '');
  const result = spawnSync(
    '/usr/bin/osascript',
    ['-e', `display notification "${body}" with title "${title}"`],
    { encoding: 'utf8', timeout: 5000 },
  );
  return {
    sent: result.status === 0,
    reason: result.status === 0 ? null : boundedText(result.stderr || 'osascript_failed', 120),
  };
}

function notifyFindings(scan, options = {}) {
  const now = options.now ?? Date.now();
  const paths = statePaths(options.stateDir);
  const statePath = options.notificationStatePath || paths.notificationStatePath;
  const state = readJson(statePath, { schema: 'workflow-observability/notifications-v1', sent: {} });
  state.sent = state.sent || {};
  const cooldownMinutes = nonNegativeNumber(options.cooldownMinutes ?? 360, 'cooldownMinutes');
  const notifier = options.notifier || defaultLocalNotifier;
  const notifications = [];

  for (const item of scan.findings.filter((candidate) => candidate.severity === 'high')) {
    const last = Date.parse(state.sent[item.fingerprint] || '');
    if (Number.isFinite(last) && now - last < cooldownMinutes * 60_000) {
      notifications.push({ fingerprint: item.fingerprint, sent: false, deduped: true });
      continue;
    }
    const result = notifier(item) || { sent: false, reason: 'notifier_returned_nothing' };
    notifications.push({ fingerprint: item.fingerprint, ...result, deduped: false });
    if (result.sent) state.sent[item.fingerprint] = new Date(now).toISOString();
  }

  const keepAfter = now - 30 * 24 * 60 * 60_000;
  state.sent = Object.fromEntries(
    Object.entries(state.sent).filter(([, timestamp]) => Date.parse(timestamp) >= keepAfter),
  );
  state.updatedAt = new Date(now).toISOString();
  writePrivateJson(statePath, state);
  return notifications;
}

function utcMonth(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 7);
}

function reportGroup(runs) {
  const attempts = runs.filter((run) => ATTEMPT_STATUSES.has(run.status));
  const successes = attempts.filter((run) => run.status === 'success');
  const failures = attempts.filter((run) => FAILED_STATUSES.has(run.status));
  const priced = attempts.filter((run) => run.cost?.usd != null);
  const timed = attempts.filter((run) => run.timeSaved?.minutes != null);
  const tokened = attempts.filter((run) => run.usage?.totalTokens != null);
  const outcomes = {};
  for (const run of successes) {
    for (const [key, value] of Object.entries(run.outcomes || {})) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        outcomes[key] = Number((Number(outcomes[key] || 0) + value).toFixed(6));
      } else if (value === true) {
        outcomes[key] = Number(outcomes[key] || 0) + 1;
      }
    }
  }
  return {
    recordedRuns: runs.length,
    attempts: attempts.length,
    successes: successes.length,
    failures: failures.length,
    skipped: runs.filter((run) => run.status === 'skipped').length,
    deduped: runs.filter((run) => run.status === 'deduped').length,
    successRate: attempts.length ? Number((successes.length / attempts.length).toFixed(4)) : null,
    retries: attempts.reduce((sum, run) => sum + Number(run.retryCount || 0), 0),
    attributedCostUsd: Number(
      priced.reduce((sum, run) => sum + Number(run.cost.usd), 0).toFixed(6),
    ),
    unpricedAttempts: attempts.length - priced.length,
    attributedTimeSavedMinutes: Number(
      timed.reduce((sum, run) => sum + Number(run.timeSaved.minutes), 0).toFixed(2),
    ),
    unknownTimeSavedAttempts: attempts.length - timed.length,
    attributedTokens: tokened.reduce((sum, run) => sum + Number(run.usage.totalTokens), 0),
    unknownTokenAttempts: attempts.length - tokened.length,
    outcomes,
    exceptions: failures.slice(-10).map((run) => ({
      runId: run.runId,
      workflowId: run.workflowId,
      finishedAt: run.finishedAt,
      status: run.status,
      errorClass: run.error?.class || null,
    })),
  };
}

function buildMonthlyReport(options = {}) {
  const now = options.now ?? Date.now();
  const month = options.month || utcMonth(now);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('--month must be YYYY-MM');
  const client = options.client ? safeIdentifier(options.client) : null;
  const runs = (options.runs || readExecutions(options)).filter(
    (run) => utcMonth(run.finishedAt) === month && (!client || run.client === client),
  );
  const workflowIds = [...new Set(runs.map((run) => run.workflowId))].sort();
  return {
    schema: REPORT_SCHEMA,
    generatedAt: new Date(now).toISOString(),
    month,
    client: client || 'all',
    truthBoundary:
      'Costs, tokens, and time saved are summed only when supplied by the workflow; unknown values are never treated as zero.',
    totals: reportGroup(runs),
    workflows: workflowIds.map((workflowId) => ({
      workflowId,
      ...reportGroup(runs.filter((run) => run.workflowId === workflowId)),
    })),
  };
}

function percentage(value) {
  return value == null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function renderMonthlyMarkdown(report) {
  const totals = report.totals;
  const lines = [
    `# Workflow operations report — ${report.month}`,
    '',
    `Client/account: \`${report.client}\``,
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `> ${report.truthBoundary}`,
    '',
    '## Summary',
    '',
    `- Attempts: ${totals.attempts}; successes: ${totals.successes}; failures/timeouts: ${totals.failures}; success rate: ${percentage(totals.successRate)}`,
    `- Duplicate side effects suppressed: ${totals.deduped}; scheduled skips: ${totals.skipped}; retries consumed: ${totals.retries}`,
    `- Attributed API/provider cost: $${totals.attributedCostUsd.toFixed(6)}; unpriced attempts: ${totals.unpricedAttempts}`,
    `- Attributed tokens: ${totals.attributedTokens}; attempts without token data: ${totals.unknownTokenAttempts}`,
    `- Attributed time saved: ${totals.attributedTimeSavedMinutes} minutes; attempts without time-saved evidence: ${totals.unknownTimeSavedAttempts}`,
    '',
    '## By workflow',
    '',
    '| Workflow | Attempts | Success | Fail | Rate | Retries | Cost USD | Unpriced | Time saved min |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const item of report.workflows) {
    lines.push(
      `| ${item.workflowId} | ${item.attempts} | ${item.successes} | ${item.failures} | ${percentage(item.successRate)} | ${item.retries} | ${item.attributedCostUsd.toFixed(6)} | ${item.unpricedAttempts} | ${item.attributedTimeSavedMinutes} |`,
    );
  }
  if (!report.workflows.length) lines.push('| No observed workflows | 0 | 0 | 0 | n/a | 0 | 0.000000 | 0 | 0 |');

  lines.push('', '## Downstream outcomes', '');
  const outcomes = Object.entries(totals.outcomes);
  if (outcomes.length) {
    for (const [key, value] of outcomes) lines.push(`- ${key}: ${value}`);
  } else {
    lines.push('- No numeric or boolean downstream outcomes were attributed this month.');
  }

  lines.push('', '## Exceptions', '');
  if (totals.exceptions.length) {
    for (const item of totals.exceptions) {
      lines.push(
        `- ${item.finishedAt} — ${item.workflowId} ${item.status} (${item.errorClass || 'unclassified'}), run ${item.runId}`,
      );
    }
  } else {
    lines.push('- No failed or timed-out attempts recorded.');
  }
  lines.push('');
  return lines.join('\n');
}

function writeMonthlyReport(report, options = {}) {
  const reportDir = options.reportDir || statePaths(options.stateDir).reportDir;
  ensurePrivateDir(reportDir);
  const clientSlug = String(report.client || 'all').replace(/[^A-Za-z0-9._-]/g, '-');
  const base = `${report.month}-${clientSlug}`;
  const jsonPath = path.join(reportDir, `${base}.json`);
  const markdownPath = path.join(reportDir, `${base}.md`);
  writePrivateJson(jsonPath, report);
  fs.writeFileSync(markdownPath, `${renderMonthlyMarkdown(report)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(markdownPath, 0o600);
  } catch {
    // Best effort.
  }
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const args = {
    command: argv[0] && !argv[0].startsWith('-') ? argv[0] : 'help',
    json: false,
    notify: false,
    write: false,
    stateDir: DEFAULT_STATE_DIR,
    configPath: DEFAULT_CONFIG_PATH,
    outcomes: {},
    child: [],
    timeoutMs: 120_000,
  };
  let index = args.command === 'help' ? 0 : 1;
  for (; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      args.child = argv.slice(index + 1);
      break;
    }
    const next = () => {
      const value = argv[++index];
      if (value == null) throw new Error(`${arg} requires a value`);
      return value;
    };
    if (arg === '--json') args.json = true;
    else if (arg === '--notify') args.notify = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--state-dir') args.stateDir = path.resolve(next());
    else if (arg === '--config') args.configPath = path.resolve(next());
    else if (arg === '--workflow') args.workflowId = next();
    else if (arg === '--client') args.client = next();
    else if (arg === '--version') args.workflowVersion = next();
    else if (arg === '--status') args.status = next();
    else if (arg === '--started-at') args.startedAt = next();
    else if (arg === '--finished-at') args.finishedAt = next();
    else if (arg === '--duration-ms') args.durationMs = next();
    else if (arg === '--retry-count') args.retryCount = next();
    else if (arg === '--provider') args.provider = next();
    else if (arg === '--model') args.model = next();
    else if (arg === '--input-tokens') args.inputTokens = next();
    else if (arg === '--output-tokens') args.outputTokens = next();
    else if (arg === '--cost-usd') args.costUsd = next();
    else if (arg === '--estimated-cost-usd') args.estimatedCostUsd = next();
    else if (arg === '--max-cost-usd') args.maxCostUsd = next();
    else if (arg === '--max-retries') args.maxRetries = next();
    else if (arg === '--time-saved-minutes') args.timeSavedMinutes = next();
    else if (arg === '--idempotency-key') args.idempotencyKey = next();
    else if (arg === '--error-class') args.errorClass = next();
    else if (arg === '--error-message') args.errorMessage = next();
    else if (arg === '--source') args.source = next();
    else if (arg === '--timeout-ms') args.timeoutMs = nonNegativeNumber(next(), 'timeoutMs', { integer: true });
    else if (arg === '--outcome') {
      const [key, value] = parseOutcome(next());
      args.outcomes[key] = value;
    } else if (arg === '--month') args.month = next();
    else if (arg === '--help' || arg === '-h') args.command = 'help';
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function printResult(result, json) {
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(result)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'help') {
    process.stdout.write(`${usage}\n`);
    return 0;
  }
  if (args.command === 'record') {
    const record = appendExecution(args, { stateDir: args.stateDir });
    printResult(record, args.json);
    return 0;
  }
  if (args.command === 'run') {
    if (!args.child.length) throw new Error('run requires a command after --');
    const result = executeObserved(
      { ...args, command: args.child[0], commandArgs: args.child.slice(1) },
      { stateDir: args.stateDir },
    );
    if (args.json) process.stdout.write(`${JSON.stringify(result.record, null, 2)}\n`);
    return result.childStatus;
  }
  if (args.command === 'scan') {
    const scan = scanExecutions({ stateDir: args.stateDir, configPath: args.configPath });
    if (args.notify) {
      scan.notifications = notifyFindings(scan, { stateDir: args.stateDir });
    }
    printResult(scan, args.json);
    return scan.alertCount ? 2 : 0;
  }
  if (args.command === 'report') {
    const report = buildMonthlyReport({
      stateDir: args.stateDir,
      month: args.month,
      client: args.client,
    });
    if (args.write) report.files = writeMonthlyReport(report, { stateDir: args.stateDir });
    if (args.json) printResult(report, true);
    else process.stdout.write(`${renderMonthlyMarkdown(report)}\n`);
    return 0;
  }
  throw new Error(`unknown command: ${args.command}`);
}

module.exports = {
  RUN_SCHEMA,
  DEFAULT_STATE_DIR,
  DEFAULT_CONFIG_PATH,
  appendExecution,
  buildMonthlyReport,
  executeObserved,
  findIdempotentSuccess,
  idempotencyHash,
  loadConfig,
  normalizeRecord,
  notifyFindings,
  parseArgs,
  readExecutions,
  renderMonthlyMarkdown,
  scanExecutions,
  sanitizeOutcomes,
  statePaths,
  writeMonthlyReport,
};

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`workflow-observability: ${error.message}\n`);
    process.exitCode = 1;
  }
}
