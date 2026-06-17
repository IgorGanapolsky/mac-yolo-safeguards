#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_HERMES_HOME = path.join(os.homedir(), '.hermes');
const DEFAULT_SKOOL_CWD = path.join(os.homedir(), 'workspace/git/igor/skool_top1percent');
const LARGE_SESSION_TOKENS = 40000;

const usage = `Usage:
  node tools/hermes-project-routing-audit.js [--hermes-home path] [--expected-cwd path] [--telegram-chat-id id] [--probe-runtime] [--json]

Verifies that Hermes Telegram is pinned to the Skool project while CLI chats
remain separate sessions. --probe-runtime runs a separate local CLI probe and
is informational: a different CLI cwd is expected when invoked from another
repo. Secrets and long numeric chat IDs are redacted.`;

function parseArgs(argv) {
  const args = {
    hermesHome: DEFAULT_HERMES_HOME,
    expectedCwd: DEFAULT_SKOOL_CWD,
    telegramChatId: '',
    probeRuntime: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--hermes-home') args.hermesHome = requireValue(argv, ++i, arg);
    else if (arg === '--expected-cwd') args.expectedCwd = requireValue(argv, ++i, arg);
    else if (arg === '--telegram-chat-id') args.telegramChatId = requireValue(argv, ++i, arg);
    else if (arg === '--probe-runtime') args.probeRuntime = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  args.hermesHome = expandPath(args.hermesHome);
  args.expectedCwd = expandPath(args.expectedCwd);
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

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function redact(text) {
  return String(text || '')
    .replace(/\b\d{7,}\b/g, '<id>')
    .replace(/(token|secret|key|password|api_key|bot_token)([=: ]+)[^ \n]+/gi, '$1$2<redacted>');
}

function parseTerminalCwd(configText) {
  const lines = String(configText || '').split(/\r?\n/);
  let inTerminal = false;
  for (const line of lines) {
    if (/^terminal:\s*$/.test(line)) {
      inTerminal = true;
      continue;
    }
    if (inTerminal && /^[^ \t#][^:]*:\s*/.test(line)) inTerminal = false;
    if (inTerminal) {
      const match = line.match(/^\s+cwd:\s*(.+?)\s*$/);
      if (match) return match[1].replace(/^['"]|['"]$/g, '');
    }
  }
  return '';
}

function parseScalar(configText, key) {
  const match = String(configText || '').match(new RegExp(`^\\s*${escapeRegex(key)}:\\s*(.+?)\\s*$`, 'm'));
  return match ? match[1].replace(/^['"]|['"]$/g, '') : '';
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectTelegramSessionEntries(sessions, chatId) {
  const all = sessions && typeof sessions === 'object' ? sessions : {};
  return Object.entries(all)
    .filter(([key]) => key.includes(':telegram:'))
    .filter(([key]) => !chatId || key.endsWith(`:${chatId}`))
    .map(([key, value]) => ({
      key: redact(key),
      sessionId: value && value.session_id ? redact(value.session_id) : '',
      lastPromptTokens: Number(value && value.last_prompt_tokens) || 0,
      isFreshReset: Boolean(value && value.is_fresh_reset),
    }));
}

function addFinding(findings, severity, title, evidence, recommendation) {
  findings.push({ severity, title, evidence: redact(evidence), recommendation });
}

function probeRuntimeCwd(timeoutMs = 60000) {
  const result = spawnSync('hermes', ['-z', 'Run pwd only. Return exactly the current working directory and nothing else.'], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const candidates = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('/Users/') || line.startsWith('/private/'));
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal || '',
    cwd: candidates[candidates.length - 1] || '',
    outputTail: redact(output.split(/\r?\n/).slice(-20).join('\n')),
  };
}

function collect(options) {
  const configPath = path.join(options.hermesHome, 'config.yaml');
  const sessionsPath = path.join(options.hermesHome, 'sessions/sessions.json');
  const configText = readText(configPath);
  const sessions = readJson(sessionsPath);
  const findings = [];
  const terminalCwd = expandPath(parseTerminalCwd(configText) || '');
  const groupSessionsPerUser = parseScalar(configText, 'group_sessions_per_user');
  const sessionResetMode = parseScalar(configText, 'mode');
  const telegramEntries = collectTelegramSessionEntries(sessions, options.telegramChatId);
  const channelPromptHasExpectedCwd = configText.includes(options.expectedCwd);
  const channelPromptMentionsMacYolo = /channel_prompts:[\s\S]*mac-yolo-safeguards/.test(configText);

  if (!configText) {
    addFinding(findings, 'high', 'Hermes config is missing or unreadable', configPath, 'Restore ~/.hermes/config.yaml before relying on Telegram routing.');
  } else {
    if (terminalCwd !== options.expectedCwd) {
      addFinding(findings, 'high', 'Configured Hermes terminal cwd is not Skool', `configured=${terminalCwd || '<missing>'} expected=${options.expectedCwd}`, 'Set terminal.cwd to the Skool repo and restart the Hermes gateway.');
    }
    if (!channelPromptHasExpectedCwd) {
      addFinding(findings, 'high', 'Telegram channel prompt does not pin Skool cwd', `expected path missing: ${options.expectedCwd}`, 'Add the Skool repo path to telegram.channel_prompts for the Telegram DM.');
    }
    if (channelPromptMentionsMacYolo) {
      addFinding(findings, 'medium', 'Telegram prompt mentions mac-yolo-safeguards', 'mac-yolo-safeguards appears inside channel_prompts', 'Keep this mention only as an explicit temporary exception, never as the active repo.');
    }
    if (groupSessionsPerUser !== 'true') {
      addFinding(findings, 'medium', 'Telegram DM is not grouped per user', `group_sessions_per_user=${groupSessionsPerUser || '<missing>'}`, 'Use group_sessions_per_user: true so Telegram has one stable Skool lane per user.');
    }
  }

  if (!sessions) {
    addFinding(findings, 'medium', 'Hermes session map is missing or unreadable', sessionsPath, 'Restart Hermes gateway and verify it recreates the Telegram session map.');
  } else if (telegramEntries.length === 0) {
    addFinding(findings, 'medium', 'No Telegram session key found', `sessions=${Object.keys(sessions).length}`, 'Send one Telegram message after gateway restart, then re-run this audit.');
  } else {
    const large = telegramEntries.filter((entry) => entry.lastPromptTokens >= LARGE_SESSION_TOKENS);
    if (large.length) {
      addFinding(findings, 'high', 'Telegram Skool lane has a large mixed-context session', `lastPromptTokens=${large.map((entry) => entry.lastPromptTokens).join(',')}`, 'Reset the Telegram DM session after Skool pinning so old debug context cannot compress into revenue work.');
    }
  }

  let runtimeProbe = null;
  if (options.probeRuntime) {
    runtimeProbe = probeRuntimeCwd();
    if (!runtimeProbe.ok) {
      addFinding(findings, 'medium', 'CLI Hermes cwd probe failed', `status=${runtimeProbe.status} signal=${runtimeProbe.signal}`, 'Inspect local Hermes CLI separately; Telegram routing is governed by config/session checks above.');
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    hermesHome: options.hermesHome,
    expectedCwd: options.expectedCwd,
    config: {
      path: configPath,
      terminalCwd,
      channelPromptHasExpectedCwd,
      channelPromptMentionsMacYolo,
      groupSessionsPerUser,
      sessionResetMode,
    },
    sessions: {
      path: sessionsPath,
      telegramEntries,
      totalGatewaySessionKeys: sessions && typeof sessions === 'object' ? Object.keys(sessions).length : 0,
    },
    runtimeProbe,
    cliIsolation: {
      status: 'separate-by-default',
      evidence: 'Telegram gateway sessions use :telegram: keys; normal hermes CLI sessions are not stored under that Telegram DM key unless --continue/--resume is explicitly reused.',
      recommendation: 'For other projects, start a fresh CLI chat from that project directory and avoid --continue unless you intend to resume that specific chat.',
    },
    findings,
    ok: !findings.some((finding) => finding.severity === 'high'),
  };
}

function render(report) {
  const lines = [];
  lines.push('Hermes project routing audit');
  lines.push(`Expected Telegram/terminal cwd: ${report.expectedCwd}`);
  lines.push(`Configured terminal cwd: ${report.config.terminalCwd || '<missing>'}`);
  lines.push(`Telegram session keys: ${report.sessions.telegramEntries.length}`);
  for (const entry of report.sessions.telegramEntries) {
    lines.push(`- ${entry.key} -> ${entry.sessionId || '<missing>'} prompt_tokens=${entry.lastPromptTokens}`);
  }
  if (report.runtimeProbe) {
    lines.push(`CLI cwd probe: ${report.runtimeProbe.cwd || '<unknown>'} (status=${report.runtimeProbe.status}; informational)`);
  }
  lines.push(`CLI isolation: ${report.cliIsolation.status}`);
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
