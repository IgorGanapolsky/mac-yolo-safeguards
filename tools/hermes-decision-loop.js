#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { collect } = require('./hermes-productivity-audit');

const usage = `Usage:
  node tools/hermes-decision-loop.js [--send-smoke] [--test-public-webhook] [--allow-live-telegram] [--remote HOST ...] [--date YYYY-MM-DD] [--out-jsonl FILE] [--out-md FILE] [--json]

Runs the Hermes reliability gate that decides whether Telegram is safe to use
as the operator interface for autonomous work.

This is a weak-supervision decision loop, not a trained ML model. It records
features, thresholds, decision outcome, and evidence so later RAG/eval passes
can learn from real incidents without relying on vague status summaries.`;

function parseArgs(argv) {
  const args = {
    sendSmoke: false,
    testPublicWebhook: false,
    allowLiveTelegram: false,
    json: false,
    remotes: [],
    date: new Date().toISOString().slice(0, 10),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--send-smoke') {
      args.sendSmoke = true;
    } else if (arg === '--test-public-webhook') {
      args.testPublicWebhook = true;
    } else if (arg === '--allow-live-telegram') {
      args.allowLiveTelegram = true;
    } else if (arg === '--remote') {
      const remote = argv[++i];
      if (!remote) throw new Error('--remote requires a host');
      args.remotes.push(remote);
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--out-jsonl') {
      args.outJsonl = argv[++i];
    } else if (arg === '--out-md') {
      args.outMd = argv[++i];
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function requireArgs(args) {
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date must be YYYY-MM-DD');
  }
  if (!args.outJsonl) args.outJsonl = `hermes-decisions-${args.date}.jsonl`;
  if (!args.outMd) args.outMd = `hermes-decision-${args.date}.md`;
}

function worstSeverity(findings) {
  const rank = { critical: 4, high: 3, medium: 2, low: 1 };
  return findings.reduce((worst, finding) => {
    return rank[finding.severity] > rank[worst] ? finding.severity : worst;
  }, 'none');
}

function hasSeverity(findings, severities) {
  return findings.some((finding) => severities.includes(finding.severity));
}

function classify(result) {
  const t = result.telemetry;
  const counts = t.counts || {};
  const remoteBlockers = (t.remotes || []).filter((remote) => {
    return !remote.reachable
      || remote.gatewayState !== 'running'
      || remote.telegramState !== 'connected'
      || !remote.serviceLoaded
      || remote.simpleBridgeRunning;
  });
  const smokeFailed = t.sendSmoke && !t.sendSmoke.skipped && !t.sendSmoke.success;
  const publicWebhookFailed = t.publicWebhookTest && !t.publicWebhookTest.skipped && !t.publicWebhookTest.success;
  const hardBlock = t.productivityScore < 80
    || hasSeverity(result.findings, ['critical', 'high'])
    || t.gatewayState !== 'running'
    || t.telegramState !== 'connected'
    || counts.gatewayProcesses !== 1
    || counts.telegramBridgeProcesses > 0
    || counts.pollingConflicts > 0
    || remoteBlockers.length > 0
    || smokeFailed
    || publicWebhookFailed;

  if (hardBlock) {
    return {
      decision: 'BLOCK',
      allowedActions: ['report_status', 'repair_hermes', 'capture_rag_lesson'],
      reason: 'Hermes/Telegram reliability gate failed.',
      nextAction: 'Fix the highest-severity Hermes finding before using Telegram as an autonomous operator surface.',
    };
  }

  if (t.productivityScore < 90 || hasSeverity(result.findings, ['medium'])) {
    return {
      decision: 'OBSERVE_ONLY',
      allowedActions: ['report_status', 'read_only_analysis', 'capture_rag_lesson'],
      reason: 'Hermes is usable for observation but not clean enough for autonomous external actions.',
      nextAction: 'Clear medium findings or collect more smoke data before autonomous sends.',
    };
  }

  return {
    decision: 'GO',
    allowedActions: ['telegram_operator_interface', 'autonomous_local_hygiene', 'read_write_repo_work', 'capture_rag_lesson'],
    reason: 'Hermes reliability gate passed.',
    nextAction: 'Use Telegram as the operator interface while continuing scored audits and RAG capture.',
  };
}

function buildRecord(args, result, classification) {
  return {
    id: `hermes-${new Date().toISOString()}`,
    checked_at: result.telemetry.checkedAt,
    date: args.date,
    decision: classification.decision,
    reason: classification.reason,
    next_action: classification.nextAction,
    allowed_actions: classification.allowedActions,
    features: {
      productivity_score: result.telemetry.productivityScore,
      gateway_state: result.telemetry.gatewayState,
      telegram_state: result.telemetry.telegramState,
      active_agents: result.telemetry.activeAgents,
      gateway_processes: result.telemetry.counts.gatewayProcesses,
      legacy_bridge_processes: result.telemetry.counts.telegramBridgeProcesses,
      polling_conflicts: result.telemetry.counts.pollingConflicts,
      smoke_success: result.telemetry.sendSmoke ? result.telemetry.sendSmoke.success : null,
      smoke_elapsed_ms: result.telemetry.sendSmoke ? result.telemetry.sendSmoke.elapsedMs : null,
      webhook_registered_host: result.telemetry.telegramWebhook ? result.telemetry.telegramWebhook.registered_host : null,
      webhook_url_matches_config: result.telemetry.telegramWebhook ? result.telemetry.telegramWebhook.url_matches : null,
      webhook_pending_updates: result.telemetry.telegramWebhook ? result.telemetry.telegramWebhook.pending_update_count : null,
      public_webhook_success: result.telemetry.publicWebhookTest ? result.telemetry.publicWebhookTest.success : null,
      public_webhook_status: result.telemetry.publicWebhookTest ? result.telemetry.publicWebhookTest.status : null,
      remote_count: result.telemetry.remotes.length,
      remote_blockers: result.telemetry.remotes.filter((remote) => {
        return !remote.reachable
          || remote.gatewayState !== 'running'
          || remote.telegramState !== 'connected'
          || !remote.serviceLoaded
          || remote.simpleBridgeRunning;
      }).map((remote) => remote.host),
      worst_finding_severity: worstSeverity(result.findings),
      finding_count: result.findings.length,
    },
    thresholds: {
      go: 'score >= 90, no critical/high/medium findings, one gateway process, Telegram connected, registered webhook matches config, public webhook test passes when requested, no duplicate bridge, no polling conflicts, remote peers healthy',
      observe_only: 'score 80-89 or medium findings',
      block: 'score < 80, any critical/high finding, Telegram disconnected, gateway process != 1, webhook unregistered/mismatched/erroring, duplicate bridge, polling conflicts, failed smoke/public webhook, or unhealthy remote peer',
    },
    findings: result.findings,
    remotes: result.telemetry.remotes.map((remote) => ({
      host: remote.host,
      reachable: remote.reachable,
      hostname: remote.hostname,
      gateway_state: remote.gatewayState,
      telegram_state: remote.telegramState,
      service_loaded: remote.serviceLoaded,
      simple_bridge_running: remote.simpleBridgeRunning,
      pid: remote.pid,
    })),
  };
}

function renderMarkdown(record) {
  const lines = [];
  lines.push('# Hermes Decision Loop');
  lines.push('');
  lines.push(`Checked: ${record.checked_at}`);
  lines.push(`Decision: ${record.decision}`);
  lines.push(`Score: ${record.features.productivity_score}/100`);
  lines.push(`Reason: ${record.reason}`);
  lines.push(`Next action: ${record.next_action}`);
  lines.push('');
  lines.push('## Gate Features');
  lines.push('');
  lines.push(`- Gateway: ${record.features.gateway_state}`);
  lines.push(`- Telegram: ${record.features.telegram_state}`);
  lines.push(`- Gateway processes: ${record.features.gateway_processes}`);
  lines.push(`- Legacy bridge processes: ${record.features.legacy_bridge_processes}`);
  lines.push(`- Polling conflicts: ${record.features.polling_conflicts}`);
  lines.push(`- Smoke: ${record.features.smoke_success === null ? 'not run' : `${record.features.smoke_success ? 'pass' : 'fail'} (${record.features.smoke_elapsed_ms}ms)`}`);
  lines.push(`- Webhook: ${record.features.webhook_registered_host || 'unknown'}${record.features.webhook_url_matches_config ? ' (matches config)' : ''}`);
  lines.push(`- Public webhook: ${record.features.public_webhook_success === null ? 'not run' : `${record.features.public_webhook_success ? 'pass' : 'fail'}${record.features.public_webhook_status ? ` (${record.features.public_webhook_status})` : ''}`}`);
  lines.push(`- Remote blockers: ${record.features.remote_blockers.length ? record.features.remote_blockers.join(', ') : 'none'}`);
  lines.push('');
  lines.push('## Allowed Actions');
  lines.push('');
  for (const action of record.allowed_actions) {
    lines.push(`- ${action}`);
  }
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (record.findings.length === 0) {
    lines.push('- No findings.');
  } else {
    for (const finding of record.findings) {
      lines.push(`- ${finding.severity.toUpperCase()}: ${finding.title}`);
      lines.push(`  Evidence: ${finding.evidence}`);
    }
  }
  lines.push('');
  lines.push('## RAG Capture Prompt');
  lines.push('');
  lines.push('Capture this record when the decision changes, a blocker is fixed, or a false positive/negative is found.');
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const result = collect({
    sendSmoke: args.sendSmoke,
    testPublicWebhook: args.testPublicWebhook,
    allowLiveTelegram: args.allowLiveTelegram,
    remotes: args.remotes,
  });
  const classification = classify(result);
  const record = buildRecord(args, result, classification);

  fs.appendFileSync(args.outJsonl, `${JSON.stringify(record)}\n`);
  fs.writeFileSync(args.outMd, renderMarkdown(record));

  if (args.json) {
    console.log(JSON.stringify(record, null, 2));
  } else {
    process.stdout.write(renderMarkdown(record));
    console.log(`Wrote ${args.outJsonl}`);
    console.log(`Wrote ${args.outMd}`);
  }

  if (record.decision === 'BLOCK') {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
