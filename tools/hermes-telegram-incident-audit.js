#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_HERMES_HOME = path.join(os.homedir(), '.hermes');
const DEFAULT_SLOW_TURN_SECONDS = 300;

const usage = `Usage:
  node tools/hermes-telegram-incident-audit.js [--hermes-home path] [--slow-turn-seconds N] [--json]

Audits Hermes Telegram logs for the failure mode where Telegram says the agent
is still working, times out, or replies generically after losing task context.
Secrets are redacted; this tool reads local logs only.`;

function parseArgs(argv) {
  const args = {
    hermesHome: DEFAULT_HERMES_HOME,
    slowTurnSeconds: DEFAULT_SLOW_TURN_SECONDS,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--hermes-home') args.hermesHome = requireValue(argv, ++i, arg);
    else if (arg === '--slow-turn-seconds') args.slowTurnSeconds = Number.parseFloat(requireValue(argv, ++i, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(args.slowTurnSeconds) || args.slowTurnSeconds <= 0) {
    throw new Error('--slow-turn-seconds must be a positive number');
  }
  args.hermesHome = path.resolve(args.hermesHome.replace(/^~(?=\/|$)/, os.homedir()));
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return '';
  }
}

function redact(text) {
  return String(text || '')
    .replace(/\b\d{7,}\b/g, '<id>')
    .replace(/(token|secret|key|password|api_key|bot_token)([=: ]+)[^ \n]+/gi, '$1$2<redacted>');
}

function tailLines(text, limit = 6000) {
  return String(text || '').split(/\r?\n/).slice(-limit);
}

function parseTimestamp(line) {
  const match = String(line).match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  return match ? match[1] : '';
}

function countMatching(lines, pattern) {
  return lines.filter((line) => pattern.test(line)).length;
}

function addFinding(findings, severity, title, evidence, recommendation) {
  findings.push({ severity, title, evidence: redact(evidence), recommendation });
}

function inboundMessages(lines) {
  return lines
    .filter((line) => /inbound message: platform=telegram/.test(line))
    .map((line) => {
      const msgMatch = line.match(/\bmsg=(['"])([\s\S]*)\1\s*$/);
      return {
        timestamp: parseTimestamp(line),
        message: msgMatch ? redact(msgMatch[2]) : '',
        line: redact(line),
      };
    });
}

function responseReady(lines) {
  return lines
    .filter((line) => /response ready: platform=telegram/.test(line))
    .map((line) => {
      const timeMatch = line.match(/\btime=([0-9.]+)s\b/);
      const callsMatch = line.match(/\bapi_calls=(\d+)\b/);
      const charsMatch = line.match(/\bresponse=(\d+) chars\b/);
      return {
        timestamp: parseTimestamp(line),
        seconds: timeMatch ? Number.parseFloat(timeMatch[1]) : null,
        apiCalls: callsMatch ? Number.parseInt(callsMatch[1], 10) : null,
        responseChars: charsMatch ? Number.parseInt(charsMatch[1], 10) : null,
        line: redact(line),
      };
    });
}

function genericContextLoss(lines) {
  const genericPatterns = [
    /please let me know what you need assistance with/i,
    /whatever problem you're facing/i,
    /i'?m here to help you solve whatever problem/i,
    /how can i assist you/i,
  ];
  return lines.filter((line) => genericPatterns.some((pattern) => pattern.test(line))).map(redact);
}

function collect(options = {}) {
  const hermesHome = path.resolve(options.hermesHome || DEFAULT_HERMES_HOME);
  const logDir = path.join(hermesHome, 'logs');
  const gatewayLogPath = path.join(logDir, 'gateway.log');
  const gatewayErrorLogPath = path.join(logDir, 'gateway.error.log');
  const agentLogPath = path.join(logDir, 'agent.log');
  const lines = [
    ...tailLines(readText(gatewayLogPath)),
    ...tailLines(readText(gatewayErrorLogPath)),
    ...tailLines(readText(agentLogPath)),
  ];
  const findings = [];
  const slowTurnSeconds = options.slowTurnSeconds || DEFAULT_SLOW_TURN_SECONDS;
  const inbound = inboundMessages(lines);
  const responses = responseReady(lines);
  const slowResponses = responses.filter((response) => Number(response.seconds) >= slowTurnSeconds);
  const pollingConflicts = countMatching(lines, /polling conflict|other getUpdates request|This Updater is already running/i);
  const telegramTimeouts = countMatching(lines, /Telegram send failed: Timed out|telegram\.error\.TimedOut|Timed out|connect timed out/i);
  const providerFailures = countMatching(lines, /HTTP 503|temporarily unavailable|invalid, blocked or out of funds|payment \/ credit error|Request timed out/i);
  const compressionStarts = countMatching(lines, /context compression started|Preflight compression/i);
  const genericReplies = genericContextLoss(lines);

  if (slowResponses.length > 0) {
    const worst = slowResponses.slice().sort((a, b) => b.seconds - a.seconds)[0];
    addFinding(
      findings,
      'high',
      'Telegram turn exceeded operator timeout budget',
      `Worst recent response took ${worst.seconds}s with ${worst.apiCalls ?? 'unknown'} API call(s): ${worst.line}`,
      'Split long-running tasks into a quick acknowledgement plus a bounded background job with explicit next checkpoint; do not leave Telegram waiting silently.'
    );
  }

  if (pollingConflicts > 0) {
    addFinding(
      findings,
      'high',
      'Telegram ingress has repeated polling conflicts',
      `${pollingConflicts} recent conflict line(s) mention another getUpdates owner or already-running updater.`,
      'Ensure exactly one Telegram ingress owner. Stop duplicate pollers/bridges and prefer one registered webhook or one polling gateway, not both.'
    );
  }

  if (telegramTimeouts > 0) {
    addFinding(
      findings,
      'medium',
      'Telegram network/send timeouts are present',
      `${telegramTimeouts} recent timeout line(s) in gateway/agent logs.`,
      'Treat Telegram transport as degraded; retry outbound delivery with backoff and surface a concrete delivery failure instead of a generic blocked message.'
    );
  }

  if (providerFailures > 0) {
    addFinding(
      findings,
      'medium',
      'Provider health issues are visible during Telegram work',
      `${providerFailures} recent provider failure line(s), including capacity, auth, credit, or request timeout symptoms.`,
      'Route long Telegram tasks through a known-healthy provider/fallback and fail fast if the primary provider is degraded.'
    );
  }

  if (compressionStarts > 0 && slowResponses.length > 0) {
    addFinding(
      findings,
      'medium',
      'Context compression is part of slow Telegram turns',
      `${compressionStarts} recent compression marker(s) and ${slowResponses.length} slow response(s).`,
      'Use a smaller revenue/session context for Telegram and move broad research to repo-local artifacts before asking the model to answer.'
    );
  }

  if (genericReplies.length > 0) {
    addFinding(
      findings,
      'high',
      'Recent reply appears context-lost or generic',
      genericReplies.slice(-2).join('\n'),
      'Before answering, require Hermes to restate the active task lane from logs/memory; if it cannot, it must run the project-context tool instead of asking what the user needs.'
    );
  }

  return {
    checkedAt: new Date().toISOString(),
    hermesHome,
    logFiles: [gatewayLogPath, gatewayErrorLogPath, agentLogPath],
    metrics: {
      inboundMessages: inbound.length,
      responseReady: responses.length,
      slowResponses: slowResponses.length,
      worstResponseSeconds: slowResponses.length ? Math.max(...slowResponses.map((response) => response.seconds)) : 0,
      pollingConflicts,
      telegramTimeouts,
      providerFailures,
      compressionStarts,
      genericContextLossReplies: genericReplies.length,
    },
    recentInbound: inbound.slice(-5),
    slowResponses: slowResponses.slice(-5),
    findings,
  };
}

function severityRank(severity) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity] ?? 4;
}

function renderMarkdown(report) {
  const lines = [
    '# Hermes Telegram Incident Audit',
    '',
    `Checked: ${report.checkedAt}`,
    `Hermes home: ${report.hermesHome}`,
    '',
    '## Metrics',
    '',
    `- Recent inbound Telegram messages: ${report.metrics.inboundMessages}`,
    `- Recent completed Telegram responses: ${report.metrics.responseReady}`,
    `- Slow responses: ${report.metrics.slowResponses}`,
    `- Worst response seconds: ${report.metrics.worstResponseSeconds}`,
    `- Polling conflicts: ${report.metrics.pollingConflicts}`,
    `- Telegram timeouts: ${report.metrics.telegramTimeouts}`,
    `- Provider failures: ${report.metrics.providerFailures}`,
    `- Context compression markers: ${report.metrics.compressionStarts}`,
    `- Generic/context-lost replies: ${report.metrics.genericContextLossReplies}`,
    '',
    '## Findings',
    '',
  ];
  if (report.findings.length === 0) {
    lines.push('- No Telegram timeout/context-loss incidents found in recent logs.');
  } else {
    for (const finding of report.findings.slice().sort((a, b) => severityRank(a.severity) - severityRank(b.severity))) {
      lines.push(`- ${finding.severity.toUpperCase()}: ${finding.title}`);
      lines.push(`  Evidence: ${finding.evidence}`);
      lines.push(`  Next: ${finding.recommendation}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }
  const report = collect(args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else process.stdout.write(renderMarkdown(report));
  if (report.findings.some((finding) => finding.severity === 'critical' || finding.severity === 'high')) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(usage);
    process.exit(2);
  }
}

module.exports = {
  collect,
  genericContextLoss,
  inboundMessages,
  parseArgs,
  renderMarkdown,
  responseReady,
};
