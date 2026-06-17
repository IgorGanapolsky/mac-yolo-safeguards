#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_HERMES_HOME = path.join(os.homedir(), '.hermes');
const DEFAULT_SKOOL_REPO = path.join(os.homedir(), 'workspace/git/igor/skool_top1percent');

const usage = `Usage:
  node tools/hermes-governance-audit.js [--hermes-home path] [--skool-repo path] [--sample-response text] [--json]

Audits Hermes against the June 2026 agent-governance failure patterns Igor is
seeing in Telegram: parent-chat blocking, manual credential handoffs, fake Skool
API paths, missing browser evidence, and context-reset risk. Secrets are never
printed.`;

function parseArgs(argv) {
  const args = {
    hermesHome: DEFAULT_HERMES_HOME,
    skoolRepo: DEFAULT_SKOOL_REPO,
    sampleResponse: '',
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--hermes-home') args.hermesHome = expandPath(requireValue(argv, ++i, arg));
    else if (arg === '--skool-repo') args.skoolRepo = expandPath(requireValue(argv, ++i, arg));
    else if (arg === '--sample-response') args.sampleResponse = requireValue(argv, ++i, arg);
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function expandPath(value) {
  return path.resolve(String(value || '').replace(/^~(?=\/|$)/, os.homedir()));
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

function normalizeText(text) {
  return String(text || '')
    .replace(/''/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function includesNormalized(text, needle) {
  return normalizeText(text).includes(normalizeText(needle));
}

function scalar(configText, dottedKey) {
  const parts = dottedKey.split('.');
  const lines = String(configText || '').split(/\r?\n/);
  let start = 0;
  let parentIndent = -1;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    let foundLine = -1;
    let value = '';
    for (let lineNumber = start; lineNumber < lines.length; lineNumber += 1) {
      const line = lines[lineNumber];
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const indent = line.match(/^ */)[0].length;
      if (parentIndent >= 0 && indent <= parentIndent) break;
      const match = line.match(new RegExp(`^ {${parentIndent + 1},}${escapeRegex(part)}:\\s*(.*?)\\s*$`));
      if (match) {
        foundLine = lineNumber;
        parentIndent = indent;
        value = stripQuotes(match[1]);
        break;
      }
    }
    if (foundLine < 0) return '';
    if (index === parts.length - 1) return value;
    start = foundLine + 1;
  }
  return '';
}

function stripQuotes(value) {
  return String(value || '').replace(/^['"]|['"]$/g, '');
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addFinding(findings, severity, title, evidence, recommendation) {
  findings.push({ severity, title, evidence: redact(evidence), recommendation });
}

function runSkoolGuard(skoolRepo, sampleResponse) {
  const guard = path.join(skoolRepo, 'scripts/hermes_autonomy_guard.py');
  if (!sampleResponse || !fs.existsSync(guard)) {
    return null;
  }
  const proc = spawnSync('python3', [guard, 'check-response', '--text', sampleResponse], {
    cwd: skoolRepo,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  let parsed = null;
  try {
    parsed = JSON.parse(proc.stdout);
  } catch (_) {
    parsed = null;
  }
  return {
    status: proc.status,
    ok: proc.status === 0,
    result: parsed,
    stderr: redact(proc.stderr),
  };
}

function fileExists(...parts) {
  return fs.existsSync(path.join(...parts));
}

function collect(options) {
  const configPath = path.join(options.hermesHome, 'config.yaml');
  const configText = readText(configPath);
  const skoolGuardPath = path.join(options.skoolRepo, 'scripts/hermes_autonomy_guard.py');
  const skoolGuardText = readText(skoolGuardPath);
  const findings = [];

  if (!configText) {
    addFinding(findings, 'high', 'Hermes config is missing', configPath, 'Restore config.yaml before relying on Telegram.');
  }

  const terminalCwd = scalar(configText, 'terminal.cwd');
  if (terminalCwd !== options.skoolRepo) {
    addFinding(findings, 'high', 'Telegram runtime cwd is not pinned to Skool', `terminal.cwd=${terminalCwd || '<missing>'}; expected=${options.skoolRepo}`, 'Set terminal.cwd to the Skool repo for the Telegram lane.');
  }

  const browserProvider = scalar(configText, 'browser.cloud_provider');
  if (!browserProvider) {
    addFinding(findings, 'high', 'Browser/computer-use provider is not configured', 'browser.cloud_provider=<missing>', 'Configure a browser provider so Skool UI work does not degrade into manual copy handoffs.');
  }

  const delegationEnabled = scalar(configText, 'delegation.orchestrator_enabled');
  const maxChildren = Number(scalar(configText, 'delegation.max_concurrent_children') || 0);
  if (delegationEnabled !== 'true' || maxChildren < 2) {
    addFinding(findings, 'medium', 'Async subagent capacity is not clearly enabled', `orchestrator_enabled=${delegationEnabled || '<missing>'}; max_concurrent_children=${maxChildren || '<missing>'}`, 'Enable async delegation so long research or browser work does not block the Telegram parent chat.');
  }

  const notifyInterval = Number(scalar(configText, 'agent.gateway_notify_interval') || 0);
  const timeoutWarning = Number(scalar(configText, 'agent.gateway_timeout_warning') || 0);
  const telegramToolProgress = scalar(configText, 'display.platforms.telegram.tool_progress');
  const telegramLongRunning = scalar(configText, 'display.platforms.telegram.long_running_notifications');
  if (!notifyInterval || notifyInterval > 30 || !timeoutWarning || timeoutWarning > 120) {
    addFinding(findings, 'high', 'Telegram real-time progress cadence is too slow', `gateway_notify_interval=${notifyInterval || '<missing>'}; gateway_timeout_warning=${timeoutWarning || '<missing>'}`, 'Set gateway_notify_interval <= 30 and gateway_timeout_warning <= 120 so Telegram shows Codex-style progress.');
  }

  if (telegramToolProgress === 'off' || telegramLongRunning === 'false') {
    addFinding(findings, 'high', 'Telegram progress messages are disabled', `tool_progress=${telegramToolProgress || '<missing>'}; long_running_notifications=${telegramLongRunning || '<missing>'}`, 'Enable Telegram tool progress and long-running notifications so Hermes does not appear stalled.');
  }

  if (/bypasses model safety filters/i.test(configText)) {
    addFinding(findings, 'high', 'Credential prompt uses unsafe bypass language', 'config contains "bypasses model safety filters"', 'Use env-backed non-interactive credential filling language without encouraging safety-filter bypasses.');
  }

  if (!/skool_browser_dm_dry_run\.js/.test(configText)) {
    addFinding(findings, 'high', 'Skool browser evidence path is not named in Telegram prompt', 'skool_browser_dm_dry_run.js missing from config prompt', 'Name the repo script Hermes should run before claiming Skool UI work is blocked.');
  }

  if (!/skool_browser_post_dry_run\.js/.test(configText) || !/skool_chat_limit/.test(configText)) {
    addFinding(findings, 'high', 'Skool chat-limit post fallback is not named in Telegram prompt', 'skool_browser_post_dry_run.js or skool_chat_limit missing from config prompt', 'When Skool DMs hit the weekly chat limit, route Hermes to browser community-post evidence instead of retrying DMs.');
  }

  if (!includesNormalized(configText, 'Telegram handoff, local outbox status, and "copy to send" are never Skool delivery proof')) {
    addFinding(findings, 'high', 'Telegram handoff is not explicitly excluded as Skool proof', 'delivery-proof exclusion missing from config prompt', 'Make Hermes treat Telegram handoffs and copy drafts as handoffs only, never verified Skool delivery.');
  }

  if (!includesNormalized(configText, 'do not say "I don\'t have send permissions"') || !includesNormalized(configText, 'queue it for manual send')) {
    addFinding(findings, 'high', 'Manual-send refusal ban is missing from Telegram prompt', 'send-permission refusal ban missing from config prompt', 'Make Hermes run the browser evidence path instead of repeating send-permission refusals.');
  }

  if (!includesNormalized(configText, 'Gateway truth protocol') || !includesNormalized(configText, 'missing userbot api_id/api_hash')) {
    addFinding(findings, 'high', 'Gateway hallucination ban is missing from Telegram prompt', 'gateway truth protocol missing from config prompt', 'Make Hermes run hermes gateway status before claiming Telegram gateway credential problems.');
  }

  if (!includesNormalized(configText, 'Zero-revenue protocol') || !includesNormalized(configText, 'revenue_engine.py close_digest')) {
    addFinding(findings, 'high', 'Zero-revenue execution protocol is missing from Telegram prompt', 'zero-revenue command missing from config prompt', 'Make Hermes execute metrics, reliability, and digest commands before discussing first-dollar timing.');
  }

  if (!includesNormalized(configText, 'Real-time progress protocol') || !includesNormalized(configText, 'current command/tool')) {
    addFinding(findings, 'high', 'Telegram real-time progress protocol is missing from prompt', 'real-time progress instruction missing', 'Tell Hermes to emit concrete command/tool/evidence updates during long Telegram tasks.');
  }

  if (!/Do not refuse with "I cannot enter the password"/.test(configText)) {
    addFinding(findings, 'medium', 'Password-refusal guard is missing from Telegram prompt', 'exact refusal guard missing', 'Tell Hermes to use safe existing credential paths instead of asking Igor to type passwords.');
  }

  if (!skoolGuardText) {
    addFinding(findings, 'high', 'Skool autonomy guard is missing', skoolGuardPath, 'Restore scripts/hermes_autonomy_guard.py in the Skool repo.');
  } else {
    for (const required of ['FORBIDDEN_BROWSER_HANDOFF_PHRASES', 'i cannot enter the password', 'copy to send:', 'skool api', 'FORBIDDEN_GATEWAY_HALLUCINATION_PHRASES']) {
      if (!skoolGuardText.toLowerCase().includes(required.toLowerCase())) {
        addFinding(findings, 'high', 'Skool autonomy guard lacks a known failure phrase', required, 'Add the phrase to the deterministic guard and test it.');
      }
    }
  }

  const hasEvidenceStores = [
    fileExists(options.skoolRepo, 'experiments', 'metrics.db'),
    fileExists(options.skoolRepo, 'rag', 'index.json'),
    fileExists(options.skoolRepo, 'docs', 'trajectories', 'outreach-outbox.json'),
  ].some(Boolean);
  if (!hasEvidenceStores) {
    addFinding(findings, 'medium', 'No Skool operational evidence store found', options.skoolRepo, 'Keep an append-only event/RAG/outbox record so Hermes cannot claim sends without evidence.');
  }

  const sessionResetMode = scalar(configText, 'session_reset.mode');
  const sessionIdleMinutes = Number(scalar(configText, 'session_reset.idle_minutes') || 0);
  if (sessionResetMode && sessionResetMode !== 'none' && sessionIdleMinutes <= 180) {
    addFinding(findings, 'medium', 'Session reset can still erase Telegram working memory', `mode=${sessionResetMode}; idle_minutes=${sessionIdleMinutes}`, 'For critical revenue work, use explicit resume/context restore or raise the idle reset window.');
  }

  const guardSample = runSkoolGuard(options.skoolRepo, options.sampleResponse);
  if (guardSample && guardSample.ok) {
    addFinding(findings, 'high', 'Sample bad Hermes response was not blocked', options.sampleResponse, 'Update scripts/hermes_autonomy_guard.py until this sample exits non-zero.');
  }

  return {
    generatedAt: new Date().toISOString(),
    hermesHome: options.hermesHome,
    skoolRepo: options.skoolRepo,
    configPath,
    terminalCwd,
    browserProvider,
    delegation: {
      orchestratorEnabled: delegationEnabled,
      maxConcurrentChildren: maxChildren,
    },
    sessionReset: {
      mode: sessionResetMode,
      idleMinutes: sessionIdleMinutes,
    },
    skoolGuard: {
      path: skoolGuardPath,
      present: Boolean(skoolGuardText),
      sample: guardSample,
    },
    findings,
    ok: !findings.some((finding) => finding.severity === 'high'),
  };
}

function render(report) {
  const lines = [];
  lines.push('Hermes governance audit');
  lines.push(`Hermes config: ${report.configPath}`);
  lines.push(`Skool repo: ${report.skoolRepo}`);
  lines.push(`Terminal cwd: ${report.terminalCwd || '<missing>'}`);
  lines.push(`Browser provider: ${report.browserProvider || '<missing>'}`);
  lines.push(`Async delegation: ${report.delegation.orchestratorEnabled || '<missing>'}; max children=${report.delegation.maxConcurrentChildren || '<missing>'}`);
  lines.push(`Session reset: ${report.sessionReset.mode || '<missing>'}; idle=${report.sessionReset.idleMinutes || '<missing>'}`);
  if (report.skoolGuard.sample) {
    lines.push(`Sample response blocked: ${report.skoolGuard.sample.ok ? 'no' : 'yes'}`);
  }
  if (!report.findings.length) {
    lines.push('Findings: none');
  } else {
    lines.push('Findings:');
    for (const finding of report.findings) {
      lines.push(`- [${finding.severity}] ${finding.title}`);
      lines.push(`  Evidence: ${finding.evidence}`);
      lines.push(`  Recommendation: ${finding.recommendation}`);
    }
  }
  return lines.join('\n');
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage);
      return 0;
    }
    const report = collect(args);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(render(report));
    return report.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    console.error(usage);
    return 2;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { collect, parseArgs, render };
