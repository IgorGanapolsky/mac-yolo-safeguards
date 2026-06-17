#!/usr/bin/env node
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HERMES_MIN_TOOL_CONTEXT = 64000;

const usage = `Usage:
  node tools/hermes-productivity-audit.js [--send-smoke] [--test-public-webhook] [--allow-live-telegram] [--remote HOST] [--json]

Scores Hermes Telegram productivity and reliability from local evidence.

Checks include launchd status, gateway state, outbound Telegram delivery,
duplicate gateway processes, recent gateway log faults, MCP surface, session
activity, and obvious stale Hermes build helpers. Secrets are never printed.

--send-smoke  Request an outbound Telegram smoke check.
--test-public-webhook  Request a signed synthetic inbound update to TELEGRAM_WEBHOOK_URL.
--allow-live-telegram  Actually post requested smoke/webhook checks into the live Telegram chat.
--remote HOST  Also collect a read-only Hermes gateway summary over SSH.
--json        Emit JSON instead of a markdown report.`;

function parseArgs(argv) {
  const args = { sendSmoke: false, testPublicWebhook: false, allowLiveTelegram: false, json: false, remotes: [] };
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
      if (!remote) {
        throw new Error('--remote requires a host');
      }
      args.remotes.push(remote);
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

function run(command, args = [], options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout || 30000,
    maxBuffer: 1024 * 1024 * 8,
  });
  return {
    command: [command, ...args].join(' '),
    code: result.status,
    signal: result.signal,
    elapsedMs: Date.now() - started,
    stdout: redact(result.stdout || ''),
    stderr: redact(result.stderr || ''),
    timedOut: result.error && result.error.code === 'ETIMEDOUT',
  };
}

function sh(script, options = {}) {
  return run('sh', ['-lc', script], options);
}

function redact(text) {
  return String(text)
    .replace(/\b\d{7,}\b/g, '<id>')
    .replace(/(token|secret|key|password|api_key|bot_token)([=: ]+)[^ \n]+/gi, '$1$2<redacted>');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { _error: error.message };
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return '';
  }
}

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    env[key] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return { _error: error.message, raw: String(text || '').slice(0, 300) };
  }
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function parseOllamaPsContext(text, model) {
  const expected = String(model || '').trim();
  if (!expected) return null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('NAME') || !trimmed.includes(expected)) continue;
    const processorMatch = trimmed.match(/\b(?:CPU|GPU)\s+(\d+)\s+\d+\s+(?:second|seconds|minute|minutes|hour|hours)\b/i);
    if (processorMatch) return Number(processorMatch[1]);
    const contextBeforeUntil = trimmed.match(/\s(\d+)\s+\d+\s+(?:second|seconds|minute|minutes|hour|hours)\b/i);
    if (contextBeforeUntil) return Number(contextBeforeUntil[1]);
  }
  return null;
}

function recentLines(text, limit = 4000) {
  return text.split(/\r?\n/).slice(-limit).join('\n');
}

function linesSince(text, isoDate) {
  if (!isoDate) {
    return recentLines(text);
  }
  const threshold = String(isoDate).replace('T', ' ').slice(0, 16);
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const prefix = line.slice(0, 16);
      return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(prefix) && prefix >= threshold;
    })
    .join('\n');
}

function addFinding(findings, severity, title, evidence, recommendation) {
  findings.push({ severity, title, evidence, recommendation });
}

function score(findings, telemetry) {
  const penalty = findings.reduce((sum, finding) => {
    if (finding.severity === 'critical') return sum + 35;
    if (finding.severity === 'high') return sum + 20;
    if (finding.severity === 'medium') return sum + 10;
    return sum + 4;
  }, 0);
  const latencyPenalty = telemetry.sendSmoke && telemetry.sendSmoke.success
    ? Math.max(0, Math.ceil((telemetry.sendSmoke.elapsedMs - 3000) / 1000) * 5)
    : 0;
  return Math.max(0, Math.min(100, 100 - penalty - latencyPenalty));
}

function collect(args) {
  const home = os.homedir();
  const hermesHome = path.join(home, '.hermes');
  const launchLabel = `gui/${process.getuid()}/ai.hermes.gateway`;
  const gatewayStatePath = path.join(hermesHome, 'gateway_state.json');
  const rawGatewayLog = readText(path.join(hermesHome, 'logs', 'gateway.log'));
  const rawGatewayErrorLog = readText(path.join(hermesHome, 'logs', 'gateway.error.log'));
  const rawAgentLog = readText(path.join(hermesHome, 'logs', 'agent.log'));
  const config = readText(path.join(hermesHome, 'config.yaml'));
  const envText = readText(path.join(hermesHome, '.env'));
  const env = parseEnv(envText);

  const commands = {
    configSummary: sh(`~/.hermes/hermes-agent/venv/bin/python - <<'PY'
import json, pathlib, yaml
cfg = yaml.safe_load(pathlib.Path.home().joinpath('.hermes/config.yaml').read_text()) or {}
print(json.dumps({
  "terminal_cwd": (cfg.get("terminal") or {}).get("cwd"),
  "model_provider": (cfg.get("model") or {}).get("provider"),
  "model_ollama_num_ctx": (cfg.get("model") or {}).get("ollama_num_ctx"),
  "fallback_providers": cfg.get("fallback_providers") or [],
}))
PY`, { timeout: 10000 }),
    gatewayStatus: run('hermes', ['gateway', 'status']),
    status: run('hermes', ['status']),
    doctor: run('hermes', ['doctor']),
    sessionsStats: run('hermes', ['sessions', 'stats']),
    mcpList: run('hermes', ['mcp', 'list']),
    launchctlPrint: sh(`launchctl print ${launchLabel}`),
    gatewayProcesses: sh("ps -axo pid,command | awk '/[p]ython -m hermes_cli[.]main gateway run|[p]ython .*hermes_cli[.]main[.]py gateway run/ {print $1 \" \" substr($0, index($0,$2))}' || true"),
    hermesProcesses: sh("ps aux | grep -i '[h]ermes' || true"),
    telegramBridgeProcesses: sh("ps -axo pid,command | awk '/[p]ython.*[t]elegram-simple-bridge|[p]ython.*[t]elegram-healthcheck|[h]ermes-[t]elegram-simple-bridge/ {print $1 \" \" substr($0, index($0,$2))}' || true"),
    hermesRuntimeCwd: run('hermes', ['-z', 'Run pwd and reply with exactly the working directory output, no other text.'], { timeout: 45000 }),
    ollamaTags: sh(`python3 - <<'PY'
import json, urllib.request
try:
    with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=4) as r:
        data = json.loads(r.read().decode())
    print(json.dumps({"reachable": True, "models": [m.get("name") for m in data.get("models", []) if m.get("name")]}))
except Exception as exc:
    print(json.dumps({"reachable": False, "error": type(exc).__name__, "message": str(exc)[:160]}))
PY`, { timeout: 8000 }),
    ollamaPs: sh(`ollama ps 2>/dev/null || true`, { timeout: 8000 }),
    telegramWebhookInfo: sh(`python3 - <<'PY'
import json, urllib.parse, urllib.request
from pathlib import Path
env={}
for line in (Path.home()/'.hermes/.env').read_text().splitlines():
    if not line or line.strip().startswith('#') or '=' not in line:
        continue
    k,v=line.split('=',1)
    env[k]=v.strip().strip('"').strip("'")
token=env.get('TELEGRAM_BOT_TOKEN','')
configured=env.get('TELEGRAM_WEBHOOK_URL','')
if not token:
    print(json.dumps({"ok": False, "error": "missing TELEGRAM_BOT_TOKEN"}))
    raise SystemExit(0)
with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/getWebhookInfo", timeout=15) as r:
    data=json.loads(r.read().decode())
info=data.get('result') or {}
actual=urllib.parse.urlparse(info.get('url') or '')
expected=urllib.parse.urlparse(configured or '')
print(json.dumps({
    "ok": data.get("ok"),
    "configured_host": expected.netloc,
    "configured_path": expected.path,
    "registered_host": actual.netloc,
    "registered_path": actual.path,
    "url_matches": bool(configured) and info.get("url") == configured,
    "pending_update_count": info.get("pending_update_count"),
    "last_error_date": info.get("last_error_date"),
    "last_error_message": info.get("last_error_message"),
    "allowed_updates": info.get("allowed_updates"),
}))
PY`, { timeout: 30000 }),
  };

  const state = readJson(gatewayStatePath);
  const gatewayLog = linesSince(rawGatewayLog, state.updated_at);
  const gatewayErrorLog = linesSince(rawGatewayErrorLog, state.updated_at);
  const agentLog = linesSince(rawAgentLog, state.updated_at);
  const findings = [];
  const telemetry = {
    checkedAt: new Date().toISOString(),
    gatewayStatePath,
    gatewayState: state.gateway_state || null,
    telegramState: state.platforms && state.platforms.telegram ? state.platforms.telegram.state : null,
    activeAgents: state.active_agents,
    gatewayPid: state.pid,
    sendSmoke: null,
    counts: {},
    remotes: [],
    telegramWebhook: null,
    publicWebhookTest: null,
    config: {},
    localRuntime: {},
  };

  telemetry.config = safeJson(commands.configSummary.stdout);
  const configuredCwd = telemetry.config.terminal_cwd || null;
  const cwdExists = Boolean(configuredCwd && fs.existsSync(path.resolve(os.homedir(), configuredCwd.replace(/^~(?=\/|$)/, '.'))));
  const runtimeCwd = commands.hermesRuntimeCwd.stdout.trim().split(/\r?\n/).pop() || '';
  telemetry.localRuntime = {
    terminalCwd: configuredCwd,
    terminalCwdExists: cwdExists,
    hermesRuntimeCwd: runtimeCwd,
    hermesRuntimeCwdMatches: Boolean(configuredCwd && runtimeCwd === configuredCwd),
    fallbackProviders: Array.isArray(telemetry.config.fallback_providers) ? telemetry.config.fallback_providers : [],
    ollama: safeJson(commands.ollamaTags.stdout),
    ollamaPs: commands.ollamaPs.stdout.trim(),
  };

  if (!configuredCwd) {
    addFinding(
      findings,
      'high',
      'Hermes terminal cwd is not configured',
      'config.yaml did not expose terminal.cwd.',
      'Set terminal.cwd to the active repo so Telegram and hermes-yolo tools do not drift into stale projects.'
    );
  } else if (!cwdExists) {
    addFinding(
      findings,
      'high',
      'Hermes terminal cwd does not exist',
      `terminal.cwd=${configuredCwd}.`,
      'Set terminal.cwd to an existing repo path before trusting tool execution.'
    );
  } else if (runtimeCwd && runtimeCwd !== configuredCwd) {
    addFinding(
      findings,
      'medium',
      'Hermes runtime cwd differs from configured cwd',
      `configured=${configuredCwd}; runtime=${runtimeCwd}.`,
      'Restart the gateway and re-run the cwd probe until runtime tool execution starts in the configured repo.'
    );
  }

  const fallbackProviders = telemetry.localRuntime.fallbackProviders;
  const fullContextFallbacks = fallbackProviders.filter((provider) => Number(provider.context_length || 0) >= HERMES_MIN_TOOL_CONTEXT);
  telemetry.localRuntime.fullContextFallbackCount = fullContextFallbacks.length;
  const localFallbacks = fallbackProviders.filter((provider) => {
    const url = String(provider.base_url || '');
    return /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);
  });
  if (localFallbacks.length === 0) {
    addFinding(
      findings,
      'medium',
      'No local model fallback is configured',
      'fallback_providers contains no localhost/OpenAI-compatible runtime.',
      'Keep a measured local fallback for Telegram outages and provider brownouts.'
    );
  } else {
    const ollamaFallback = localFallbacks.find((provider) => String(provider.base_url || '').includes('11434'));
    if (ollamaFallback) {
      const ollama = telemetry.localRuntime.ollama || {};
      const models = Array.isArray(ollama.models) ? ollama.models : [];
      const expectedModel = String(ollamaFallback.model || '');
      telemetry.localRuntime.expectedOllamaModel = expectedModel;
      telemetry.localRuntime.expectedOllamaModelAvailable = models.includes(expectedModel);
      const loadedContext = parseOllamaPsContext(commands.ollamaPs.stdout, expectedModel);
      telemetry.localRuntime.expectedOllamaLoadedContext = loadedContext;
      if (!ollama.reachable) {
        addFinding(
          findings,
          'medium',
          'Configured Ollama fallback is not reachable',
          `base_url=${ollamaFallback.base_url}; error=${ollama.error || 'unknown'}.`,
          'Start Ollama or move Hermes fallback to a reachable OpenAI-compatible local runtime.'
        );
      } else if (expectedModel && !models.includes(expectedModel)) {
        addFinding(
          findings,
          'medium',
          'Configured Ollama fallback model is not installed',
          `expected=${expectedModel}; available=${models.slice(0, 8).join(', ') || '<none>'}.`,
          'Install the configured fallback model or update fallback_providers to a model that exists locally.'
        );
      }
      if (Number(ollamaFallback.context_length || 0) >= 32768 && !commands.ollamaPs.stdout.includes(expectedModel)) {
        addFinding(
          findings,
          'low',
          'Large-context Ollama fallback is configured but not loaded',
          `expected=${expectedModel}; requested_context=${ollamaFallback.context_length || 'unknown'}.`,
          'For serious agent loops, verify loaded runtime context with ollama ps or use a serving stack with explicit context/metrics.'
        );
      }
      if (loadedContext !== null && loadedContext < HERMES_MIN_TOOL_CONTEXT) {
        addFinding(
          findings,
          fullContextFallbacks.length > 0 ? 'low' : 'medium',
          'Loaded Ollama fallback context is below Hermes tool-use floor',
          `model=${expectedModel}; loaded_context=${loadedContext}; minimum=${HERMES_MIN_TOOL_CONTEXT}.`,
          'Use this fallback only for bounded rescue answers, or switch to a verified runtime/model with at least 64k loaded context for full Telegram tool use.'
        );
      }
    }
  }

  telemetry.telegramWebhook = safeJson(commands.telegramWebhookInfo.stdout);
  if (env.TELEGRAM_WEBHOOK_URL) {
    if (!telemetry.telegramWebhook.registered_host) {
      addFinding(
        findings,
        'high',
        'Telegram webhook is not registered',
        'Bot API getWebhookInfo returned an empty webhook URL.',
        'Register TELEGRAM_WEBHOOK_URL with setWebhook and verify public ingress before trusting Telegram.'
      );
    } else if (!telemetry.telegramWebhook.url_matches) {
      addFinding(
        findings,
        'high',
        'Telegram webhook registration does not match local config',
        `registered=${telemetry.telegramWebhook.registered_host}${telemetry.telegramWebhook.registered_path || ''}; configured=${telemetry.telegramWebhook.configured_host}${telemetry.telegramWebhook.configured_path || ''}.`,
        'Re-register the current tunnel URL and restart the gateway if the tunnel rotated.'
      );
    }
    if (telemetry.telegramWebhook.last_error_message) {
      addFinding(
        findings,
        'high',
        'Telegram reports webhook delivery errors',
        telemetry.telegramWebhook.last_error_message,
        'Repair the public tunnel or webhook handler until getWebhookInfo has no last_error_message.'
      );
    }
    if (Number(telemetry.telegramWebhook.pending_update_count || 0) > 0) {
      addFinding(
        findings,
        'medium',
        'Telegram has pending undelivered updates',
        `pending_update_count=${telemetry.telegramWebhook.pending_update_count}.`,
        'Drain or repair webhook delivery; pending updates mean user messages may not be reaching Hermes.'
      );
    }
  }

  if (commands.gatewayStatus.stdout.includes('Service definition is stale')) {
    addFinding(
      findings,
      'high',
      'Gateway LaunchAgent definition is stale',
      'hermes gateway status reported stale service definition.',
      'Regenerate the service during a quiet window, then verify launchctl, gateway_state, and Telegram delivery.'
    );
  }

  if (!commands.gatewayStatus.stdout.includes('Gateway service is loaded')) {
    addFinding(
      findings,
      'critical',
      'Gateway service is not loaded',
      'hermes gateway status did not report a loaded service.',
      'Bootstrap the launchd plist and verify a single gateway PID.'
    );
  }

  if (state.gateway_state !== 'running') {
    addFinding(
      findings,
      'critical',
      'Gateway state is not running',
      `gateway_state.json gateway_state=${state.gateway_state || '<missing>'}.`,
      'Inspect launchd and gateway logs before assuming Telegram can receive prompts.'
    );
  }

  const telegramState = state.platforms && state.platforms.telegram ? state.platforms.telegram.state : null;
  if (telegramState !== 'connected') {
    addFinding(
      findings,
      'critical',
      'Telegram platform is not connected',
      `gateway_state.json telegram.state=${telegramState || '<missing>'}.`,
      'Repair Telegram gateway connectivity and run an outbound and inbound productivity smoke test.'
    );
  }

  const processLines = commands.gatewayProcesses.stdout.trim().split(/\r?\n/).filter(Boolean);
  telemetry.counts.gatewayProcesses = processLines.length;
  if (processLines.length !== 1) {
    addFinding(
      findings,
      'high',
      'Gateway process ownership is ambiguous',
      `Found ${processLines.length} hermes_cli.main gateway run process(es).`,
      'Keep exactly one gateway owner to prevent Telegram polling/webhook conflicts.'
    );
  }

  const bridgeLines = commands.telegramBridgeProcesses.stdout.trim().split(/\r?\n/).filter(Boolean);
  telemetry.counts.telegramBridgeProcesses = bridgeLines.length;
  if (bridgeLines.some((line) => line.includes('telegram-simple-bridge'))) {
    addFinding(
      findings,
      'high',
      'Legacy Telegram simple bridge is running beside Hermes gateway',
      `Found ${bridgeLines.length} telegram bridge/healthcheck process line(s).`,
      'Use exactly one Telegram ingress owner. Stop and disable the simple bridge after confirming gateway-owned Telegram is the intended path.'
    );
  }

  telemetry.counts.pollingConflicts = countMatches(gatewayErrorLog + '\n' + agentLog, /polling conflict|other getUpdates request|webhook is active/gi);
  if (telemetry.counts.pollingConflicts > 0) {
    addFinding(
      findings,
      'medium',
      'Recent logs contain Telegram ingress conflicts',
      `Found ${telemetry.counts.pollingConflicts} recent polling/webhook conflict line(s).`,
      'Treat webhook as the single production ingress and monitor for duplicate pollers after restarts.'
    );
  }

  telemetry.counts.sigterms = countMatches(gatewayLog + '\n' + gatewayErrorLog, /Received SIGTERM|Shutdown context: signal=SIGTERM/gi);
  if (telemetry.counts.sigterms > 1) {
    addFinding(
      findings,
      'medium',
      'Gateway restart churn is visible in recent logs',
      `Found ${telemetry.counts.sigterms} recent SIGTERM/shutdown line(s).`,
      'Separate tunnel renewal from gateway restart where possible and alert before productivity-impacting restarts.'
    );
  }

  if (envText.includes('TELEGRAM_WEBHOOK_URL=') && !envText.includes('TELEGRAM_WEBHOOK_SECRET=')) {
    addFinding(
      findings,
      'critical',
      'Webhook URL is set without webhook secret',
      'TELEGRAM_WEBHOOK_URL is present but TELEGRAM_WEBHOOK_SECRET was not found.',
      'Set TELEGRAM_WEBHOOK_SECRET and register it with Telegram setWebhook secret_token.'
    );
  }

  if (/fallback_providers:\s*\[\]/.test(config) || commands.status.stdout.includes('fallback_providers: []')) {
    addFinding(
      findings,
      'medium',
      'No verified model fallback chain',
      'config.yaml has an empty fallback_providers list.',
      'Configure and test one fallback provider for Telegram-originated prompts.'
    );
  }

  if (/privacy:\s*\n(?:.*\n){0,8}?\s*redact_pii:\s*false/i.test(config)) {
    addFinding(
      findings,
      'medium',
      'PII redaction appears disabled',
      'config.yaml indicates privacy.redact_pii: false.',
      'Enable PII redaction if it does not break required workflows, then verify with a harmless test.'
    );
  }

  telemetry.counts.hiddenTelegramCommands = countMatches(gatewayLog, /Telegram menu: 30 commands registered, \d+ hidden/gi);
  if (telemetry.counts.hiddenTelegramCommands > 0) {
    addFinding(
      findings,
      'low',
      'Telegram command surface exceeds menu limits',
      'Gateway log reports only 30 commands registered with additional commands hidden.',
      'Curate the Telegram top-30 command menu around daily productivity workflows.'
    );
  }

  const staleBuild = commands.hermesProcesses.stdout
    .split(/\r?\n/)
    .filter((line) => /install-main\.sh|electron-builder|app-builder_arm64/.test(line));
  telemetry.counts.staleBuildHelpers = staleBuild.length;
  if (staleBuild.length > 0) {
    addFinding(
      findings,
      'low',
      'Old Hermes installer/build helper processes are still present',
      `Found ${staleBuild.length} install/build helper process line(s).`,
      'Inspect and terminate only with explicit process-level consent; they confuse reliability audits.'
    );
  }

  if (!commands.mcpList.stdout.includes('context7') || !commands.mcpList.stdout.includes('enabled')) {
    addFinding(
      findings,
      'medium',
      'Context7 MCP is not clearly enabled',
      'hermes mcp list did not show context7 enabled.',
      'Keep Context7 healthy for live coding-doc retrieval and test it after gateway restarts.'
    );
  }

  if (args.sendSmoke && !args.allowLiveTelegram) {
    telemetry.sendSmoke = {
      skipped: true,
      success: null,
      reason: 'live Telegram smoke skipped; pass --allow-live-telegram to post to the real chat',
    };
  } else if (args.sendSmoke) {
    const message = `Hermes Telegram productivity audit smoke ${new Date().toISOString()}`;
    const smoke = run('hermes', ['send', '--to', 'telegram', '--json', message], { timeout: 30000 });
    let parsed = null;
    try {
      parsed = JSON.parse(smoke.stdout);
    } catch (_) {
      parsed = null;
    }
    telemetry.sendSmoke = {
      code: smoke.code,
      elapsedMs: smoke.elapsedMs,
      success: Boolean(parsed && parsed.success),
      messageId: parsed && parsed.message_id ? '<redacted-id>' : null,
    };
    if (!telemetry.sendSmoke.success) {
      addFinding(
        findings,
        'critical',
        'Outbound Telegram smoke failed',
        `hermes send exited ${smoke.code} in ${smoke.elapsedMs}ms.`,
        'Repair outbound Telegram delivery before trusting Telegram as the operator interface.'
      );
    }
  }

  if (args.testPublicWebhook && !args.allowLiveTelegram) {
    telemetry.publicWebhookTest = {
      skipped: true,
      success: null,
      reason: 'live public webhook test skipped; pass --allow-live-telegram to post to the real chat',
    };
  } else if (args.testPublicWebhook) {
    const publicWebhook = sh(`python3 - <<'PY'
import json, time, urllib.request
from pathlib import Path
env={}
for line in (Path.home()/'.hermes/.env').read_text().splitlines():
    if not line or line.strip().startswith('#') or '=' not in line:
        continue
    k,v=line.split('=',1)
    env[k]=v.strip().strip('"').strip("'")
url=env.get('TELEGRAM_WEBHOOK_URL','')
secret=env.get('TELEGRAM_WEBHOOK_SECRET','')
chat_id=int(env.get('TELEGRAM_HOME_CHANNEL','0') or 0)
if not url or not secret or not chat_id:
    print(json.dumps({"success": False, "error": "missing webhook url, secret, or home channel"}))
    raise SystemExit(0)
now=int(time.time())
update={
  "update_id": now + 5000000,
  "message": {
    "message_id": now % 1000000,
    "date": now,
    "chat": {"id": chat_id, "type": "private", "first_name": "Igor"},
    "from": {"id": chat_id, "is_bot": False, "first_name": "Igor"},
    "text": "Reply with exactly HERMES-PUBLIC-AUDIT-OK",
  },
}
req=urllib.request.Request(
    url,
    data=json.dumps(update).encode(),
    headers={"Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        print(json.dumps({"success": 200 <= r.status < 300, "status": r.status, "body_len": len(r.read())}))
except Exception as exc:
    print(json.dumps({"success": False, "error": type(exc).__name__, "message": str(exc)[:200]}))
PY`, { timeout: 30000 });
    telemetry.publicWebhookTest = safeJson(publicWebhook.stdout);
    if (!telemetry.publicWebhookTest.success) {
      addFinding(
        findings,
        'high',
        'Public Telegram webhook ingress failed',
        telemetry.publicWebhookTest.message || telemetry.publicWebhookTest.error || 'Synthetic public webhook POST did not return success.',
        'Repair or rotate the tunnel before treating Telegram as usable from phone/browser clients.'
      );
    }
  }

  for (const remote of args.remotes) {
    const remoteSummary = collectRemote(remote);
    telemetry.remotes.push(remoteSummary);
    if (!remoteSummary.reachable) {
      addFinding(
        findings,
        'high',
        `Remote ${remote} is not reachable`,
        remoteSummary.error || 'SSH check failed.',
        'Restore SSH/Tailscale reachability before treating this as a redundant Hermes surface.'
      );
      continue;
    }
    if (remoteSummary.telegramState !== 'connected') {
      addFinding(
        findings,
        'high',
        `Remote ${remote} Telegram is not connected`,
        `remote gateway_state=${remoteSummary.gatewayState || 'unknown'} telegram_state=${remoteSummary.telegramState || 'unknown'}.`,
        'Start or repair the remote Hermes gateway, then verify Telegram delivery from that host.'
      );
    }
    if (!remoteSummary.serviceLoaded) {
      addFinding(
        findings,
        'medium',
        `Remote ${remote} gateway is not launchd-managed`,
        remoteSummary.serviceEvidence || 'Remote gateway is running outside launchd or stopped.',
        'Fix launchd bootstrap on the remote Mac or document the non-autostart risk explicitly.'
      );
    }
    if (remoteSummary.simpleBridgeRunning) {
      addFinding(
        findings,
        'high',
        `Remote ${remote} legacy Telegram simple bridge is running`,
        remoteSummary.bridgeEvidence || 'Remote simple bridge process is active.',
        'Use exactly one Telegram ingress owner. Stop and disable the legacy simple bridge after confirming the main gateway owns Telegram.'
      );
    }
  }

  telemetry.productivityScore = score(findings, telemetry);
  return { telemetry, findings, commands };
}

function collectRemote(remote) {
  const script = `python3 - <<'PY'
import json, pathlib, subprocess
state_path = pathlib.Path.home() / ".hermes" / "gateway_state.json"
state = {}
if state_path.exists():
    state = json.loads(state_path.read_text())
status = subprocess.run(["hermes", "gateway", "status"], text=True, capture_output=True, timeout=20)
hostname = subprocess.run(["hostname"], text=True, capture_output=True, timeout=5).stdout.strip()
bridge = subprocess.run(["sh", "-lc", "ps -axo pid,command | awk '/[p]ython.*[t]elegram-simple-bridge|[p]ython.*[t]elegram-healthcheck|[h]ermes-[t]elegram-simple-bridge/ {print $1 \" \" substr($0, index($0,$2))}' || true"], text=True, capture_output=True, timeout=10).stdout.strip()
print(json.dumps({
    "hostname": hostname,
    "statusCode": status.returncode,
    "serviceLoaded": "Gateway service is loaded" in status.stdout,
    "serviceEvidence": "\\n".join(status.stdout.splitlines()[:8]),
    "gatewayState": state.get("gateway_state"),
    "telegramState": (state.get("platforms") or {}).get("telegram", {}).get("state"),
    "activeAgents": state.get("active_agents"),
    "pid": state.get("pid"),
    "simpleBridgeRunning": "telegram-simple-bridge" in bridge,
    "bridgeEvidence": bridge,
}))
PY`;
  const result = run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', remote, script], { timeout: 30000 });
  if (result.code !== 0) {
    return {
      host: remote,
      reachable: false,
      error: result.stderr || result.stdout || `ssh exited ${result.code}`,
    };
  }
  try {
    return {
      host: remote,
      reachable: true,
      ...JSON.parse(result.stdout),
    };
  } catch (error) {
    return {
      host: remote,
      reachable: false,
      error: `Could not parse remote summary: ${error.message}`,
    };
  }
}

function severityRank(severity) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity] ?? 4;
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# Hermes Productivity Audit');
  lines.push('');
  lines.push(`Checked: ${result.telemetry.checkedAt}`);
  lines.push(`Score: ${result.telemetry.productivityScore}/100`);
  lines.push('');
  lines.push('## Signals');
  lines.push('');
  lines.push(`- Gateway: ${result.telemetry.gatewayState || 'unknown'}`);
  lines.push(`- Telegram: ${result.telemetry.telegramState || 'unknown'}`);
  lines.push(`- Active agents: ${result.telemetry.activeAgents ?? 'unknown'}`);
  lines.push(`- Gateway PID: ${result.telemetry.gatewayPid || 'unknown'}`);
  lines.push(`- Gateway process count: ${result.telemetry.counts.gatewayProcesses}`);
  lines.push(`- Legacy bridge process count: ${result.telemetry.counts.telegramBridgeProcesses}`);
  if (result.telemetry.localRuntime) {
    const local = result.telemetry.localRuntime;
    lines.push(`- Hermes cwd: ${local.hermesRuntimeCwd || 'unknown'}${local.hermesRuntimeCwdMatches ? ' (matches config)' : ''}`);
    lines.push(`- Local fallback providers: ${Array.isArray(local.fallbackProviders) ? local.fallbackProviders.length : 0}`);
    if (local.expectedOllamaModel) {
      const context = local.expectedOllamaLoadedContext ? ` / context ${local.expectedOllamaLoadedContext}` : '';
      lines.push(`- Ollama fallback: ${local.ollama && local.ollama.reachable ? 'reachable' : 'not reachable'} / ${local.expectedOllamaModel}${local.expectedOllamaModelAvailable ? ' installed' : ' not installed'}${context}`);
    }
  }
  if (result.telemetry.sendSmoke) {
    if (result.telemetry.sendSmoke.skipped) {
      lines.push(`- Outbound smoke: skipped (${result.telemetry.sendSmoke.reason})`);
    } else {
      lines.push(`- Outbound smoke: ${result.telemetry.sendSmoke.success ? 'pass' : 'fail'} (${result.telemetry.sendSmoke.elapsedMs}ms)`);
    }
  }
  if (result.telemetry.telegramWebhook) {
    const webhook = result.telemetry.telegramWebhook;
    lines.push(`- Telegram webhook: ${webhook.registered_host || 'not registered'}${webhook.url_matches ? ' (matches config)' : ''}`);
    lines.push(`- Telegram pending updates: ${webhook.pending_update_count ?? 'unknown'}`);
  }
  if (result.telemetry.publicWebhookTest) {
    if (result.telemetry.publicWebhookTest.skipped) {
      lines.push(`- Public webhook POST: skipped (${result.telemetry.publicWebhookTest.reason})`);
    } else {
      lines.push(`- Public webhook POST: ${result.telemetry.publicWebhookTest.success ? 'pass' : 'fail'}${result.telemetry.publicWebhookTest.status ? ` (${result.telemetry.publicWebhookTest.status})` : ''}`);
    }
  }
  for (const remote of result.telemetry.remotes) {
    const status = remote.reachable
      ? `${remote.gatewayState || 'unknown'} / telegram ${remote.telegramState || 'unknown'} / launchd ${remote.serviceLoaded ? 'loaded' : 'not loaded'}`
      : 'unreachable';
    lines.push(`- Remote ${remote.host}: ${status}`);
  }
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (result.findings.length === 0) {
    lines.push('- No findings from local checks.');
  } else {
    for (const finding of result.findings.slice().sort((a, b) => severityRank(a.severity) - severityRank(b.severity))) {
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
  const result = collect(args);
  if (args.json) {
    console.log(JSON.stringify({
      telemetry: result.telemetry,
      findings: result.findings,
    }, null, 2));
  } else {
    process.stdout.write(renderMarkdown(result));
  }
  if (result.findings.some((finding) => finding.severity === 'critical' || finding.severity === 'high')) {
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

module.exports = {
  collect,
  parseArgs,
  renderMarkdown,
  parseOllamaPsContext,
  score,
  severityRank,
};
