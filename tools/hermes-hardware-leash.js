#!/usr/bin/env node
'use strict';

/**
 * Hermes Hardware Leash
 *
 * A small, dependency-free contract for M5Stack-style devices:
 * physical buttons and tiny displays emit signed, replay-limited operator
 * events that Hermes/ThumbGate can verify before any consequential action.
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8642';
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.hermes', 'hardware-leash.json');
const DEFAULT_EVENT_LOG_PATH = path.join(os.homedir(), '.hermes', 'hardware-leash-events.jsonl');
const DEFAULT_REPLAY_WINDOW_SECONDS = 300;

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function slugify(input) {
  return String(input || 'device')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'device';
}

function hmac(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function normalizeButton(button) {
  const normalized = String(button || '').trim().toLowerCase().replace(/[_\s-]+/g, '_');
  const aliases = {
    allow: 'approve',
    approved: 'approve',
    green: 'approve',
    ok: 'approve',
    thumbs_up: 'approve',
    yes: 'approve',
    block: 'deny',
    denied: 'deny',
    no: 'deny',
    red: 'deny',
    reject: 'deny',
    thumbs_down: 'deny',
    panic: 'pause',
    stop: 'pause',
    kill_switch: 'pause',
    start: 'resume',
    unpause: 'resume',
    refresh: 'status',
    heartbeat: 'status',
  };
  return aliases[normalized] || normalized;
}

function eventTypeForButton(button) {
  if (button === 'approve' || button === 'deny') {
    return 'thumbgate.decision';
  }
  if (button === 'pause' || button === 'resume') {
    return 'hermes.operator_control';
  }
  if (button === 'status') {
    return 'hermes.status_request';
  }
  return 'hermes.hardware_event';
}

function assertKnownButton(button) {
  const allowed = new Set(['approve', 'deny', 'pause', 'resume', 'status']);
  if (!allowed.has(button)) {
    throw new Error(`Unsupported hardware button: ${button || '(empty)'}`);
  }
}

function normalizeHardwareEvent(input = {}, options = {}) {
  const deviceId = slugify(input.deviceId || input.device_id);
  if (!deviceId) {
    throw new Error('device_id is required');
  }
  const button = normalizeButton(input.button || input.decision);
  assertKnownButton(button);
  const actionId = input.actionId || input.action_id || '';
  if ((button === 'approve' || button === 'deny') && !actionId) {
    throw new Error(`${button} requires action_id so ThumbGate can match the pending approval`);
  }
  const now = options.now || new Date();
  const ts = input.ts || now.toISOString();
  const basis = `${deviceId}:${button}:${actionId}:${ts}:${input.note || ''}`;
  const eventId = input.eventId || input.event_id || `hw_${crypto.createHash('sha256').update(basis).digest('hex').slice(0, 16)}`;
  const event = {
    version: 1,
    event_id: eventId,
    event_type: eventTypeForButton(button),
    source: 'm5stack_hardware_leash',
    device_id: deviceId,
    button,
    decision: button === 'approve' ? 'approve' : button === 'deny' ? 'deny' : null,
    action_id: actionId || null,
    operator_note: input.note || '',
    requires_thumbgate: true,
    ttl_seconds: Number(input.ttlSeconds || input.ttl_seconds || DEFAULT_REPLAY_WINDOW_SECONDS),
    ts,
  };
  if (button === 'pause' || button === 'resume') {
    event.control = button === 'pause' ? 'pause_outbound_and_new_jobs' : 'resume_with_existing_limits';
    event.scope = input.scope || 'all_macs';
  }
  return event;
}

function unsignedEvent(event) {
  const clone = { ...event };
  delete clone.signature;
  return clone;
}

function signHardwareEvent(event, secret) {
  if (!secret) {
    throw new Error('secret is required for signing');
  }
  const unsigned = unsignedEvent(event);
  return {
    ...unsigned,
    signature: `sha256=${hmac(secret, stableStringify(unsigned))}`,
  };
}

function verifyHardwareEvent(event, secret, options = {}) {
  if (!event || typeof event !== 'object') {
    return { ok: false, reason: 'event_missing' };
  }
  if (!event.signature) {
    return { ok: false, reason: 'signature_missing' };
  }
  if (!secret) {
    return { ok: false, reason: 'secret_missing' };
  }
  const expected = signHardwareEvent(unsignedEvent(event), secret).signature;
  const left = Buffer.from(String(event.signature));
  const right = Buffer.from(String(expected));
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return { ok: false, reason: 'signature_mismatch' };
  }
  const replayWindow = Number(options.replayWindowSeconds || event.ttl_seconds || DEFAULT_REPLAY_WINDOW_SECONDS);
  const nowMs = options.now ? new Date(options.now).getTime() : Date.now();
  const eventMs = new Date(event.ts).getTime();
  if (!Number.isFinite(eventMs)) {
    return { ok: false, reason: 'timestamp_invalid' };
  }
  if (Math.abs(nowMs - eventMs) > replayWindow * 1000) {
    return { ok: false, reason: 'timestamp_outside_replay_window' };
  }
  return { ok: true, reason: 'verified' };
}

function gatewayHealth(url = DEFAULT_GATEWAY_URL, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const request = http.get(`${String(url).replace(/\/+$/, '')}/health`, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode });
    });
    request.on('timeout', () => {
      request.destroy();
      resolve({ ok: false, status: 'timeout' });
    });
    request.on('error', (error) => resolve({ ok: false, status: error.code || 'error' }));
  });
}

function defaultMachine() {
  return {
    id: slugify(os.hostname()),
    label: os.hostname(),
    role: 'local',
    gateway_url: process.env.HERMES_GATEWAY_URL || DEFAULT_GATEWAY_URL,
  };
}

function rankHardwareActions(snapshot = {}) {
  const pending = Number(snapshot.thumbgate?.pending_count || 0);
  const unhealthy = Number(snapshot.fleet?.machines?.filter((machine) => machine.status !== 'online').length || 0);
  return [
    {
      id: 'physical_thumbgate_decision',
      label: 'Approve or deny pending ThumbGate card',
      score: pending > 0 ? 100 : 72,
      button_map: { green: 'approve', red: 'deny' },
      why: 'Fastest way to stop repeated approval prompts without opening a phone or browser.',
    },
    {
      id: 'panic_pause_outbound',
      label: 'Pause outbound and new jobs',
      score: 96,
      button_map: { hold_red: 'pause' },
      why: 'Highest-leverage safety control when Hermes loops, spams, or spends.',
    },
    {
      id: 'fleet_heartbeat_panel',
      label: 'Show all-Mac Hermes health',
      score: unhealthy > 0 ? 92 : 80,
      button_map: { blue: 'status' },
      why: 'Tiny always-on screen catches dead gateways, stale workers, and offline Macs.',
    },
    {
      id: 'payment_and_revenue_alert',
      label: 'Flash verified payment or refund/dispute',
      score: 78,
      button_map: { display: 'money_event' },
      why: 'Moves attention to actual revenue events instead of agent activity.',
    },
    {
      id: 'ci_and_e2e_failure_alert',
      label: 'Flash CI/E2E failure during release',
      score: 70,
      button_map: { display: 'build_event' },
      why: 'Avoids burning Actions/EAS credits by showing only the failing quality gate.',
    },
  ].sort((a, b) => b.score - a.score);
}

async function buildSnapshot(options = {}) {
  const configPath = options.configPath || process.env.HERMES_HARDWARE_LEASH_CONFIG || DEFAULT_CONFIG_PATH;
  const config = options.config || readJsonIfExists(configPath);
  const machines = config.machines?.length ? config.machines : [defaultMachine()];
  const probe = options.probe !== false;
  const checkedMachines = [];
  for (const machine of machines) {
    const url = machine.gateway_url || machine.gatewayUrl || DEFAULT_GATEWAY_URL;
    const health = probe ? await gatewayHealth(url, options.timeoutMs) : {
      ok: machine.online === true ? true : null,
      status: machine.online === true ? 200 : 'not_probed',
    };
    checkedMachines.push({
      id: slugify(machine.id || machine.label || url),
      label: machine.label || machine.id || url,
      role: machine.role || 'worker',
      gateway_url: url,
      status: health.ok === true ? 'online' : health.ok === null ? 'unknown' : 'offline',
      health,
    });
  }
  const pendingCards = config.thumbgate?.pending_cards || [];
  const onlineCount = checkedMachines.filter((machine) => machine.status === 'online').length;
  const snapshot = {
    version: 1,
    generated_at: new Date().toISOString(),
    source: 'hermes_hardware_leash',
    device_profiles: [
      { model: 'M5Stack Core/Core2/Tab', use: 'desk approval console' },
      { model: 'M5Stick/Atom', use: 'per-Mac health puck' },
      { model: 'Cardputer', use: 'portable operator keyboard' },
      { model: 'ePaper/CoreInk', use: 'always-on fleet status display' },
    ],
    fleet: {
      online_count: onlineCount,
      total_count: checkedMachines.length,
      machines: checkedMachines,
    },
    thumbgate: {
      pending_count: pendingCards.length,
      pending_cards: pendingCards.slice(0, 5),
    },
    display: {
      title: 'Hermes Leash',
      primary_line: pendingCards.length ? `${pendingCards.length} approval${pendingCards.length === 1 ? '' : 's'} waiting` : 'No approvals waiting',
      secondary_line: `Fleet ${onlineCount}/${checkedMachines.length} online`,
      color: pendingCards.length ? 'amber' : checkedMachines.some((machine) => machine.status === 'offline') ? 'red' : onlineCount === checkedMachines.length ? 'green' : 'amber',
    },
  };
  snapshot.actions = rankHardwareActions(snapshot);
  return snapshot;
}

function appendEventLog(event, logPath = DEFAULT_EVENT_LOG_PATH) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify({
    recorded_at: new Date().toISOString(),
    event,
  })}\n`, { mode: 0o600 });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error('request_body_too_large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload, null, 2));
}

function createHardwareLeashServer(options = {}) {
  const secret = options.secret || process.env.HERMES_HARDWARE_LEASH_SECRET;
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, { ok: true, service: 'hermes-hardware-leash' });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/snapshot') {
        const snapshot = await buildSnapshot({
          configPath: options.configPath,
          probe: url.searchParams.get('probe') !== 'false',
        });
        sendJson(response, 200, snapshot);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/event') {
        if (!secret) {
          sendJson(response, 500, { ok: false, reason: 'secret_missing' });
          return;
        }
        const raw = await readRequestBody(request);
        const event = JSON.parse(raw || '{}');
        const verified = verifyHardwareEvent(event, secret);
        if (!verified.ok) {
          sendJson(response, 401, verified);
          return;
        }
        appendEventLog(event, options.logPath);
        sendJson(response, 202, { ok: true, recorded: true, event_id: event.event_id });
        return;
      }
      sendJson(response, 404, { ok: false, reason: 'not_found' });
    } catch (error) {
      sendJson(response, 500, { ok: false, reason: error.message });
    }
  });
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      args._.push(item);
      continue;
    }
    const [rawKey, inlineValue] = item.slice(2).split(/=(.*)/s);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (inlineValue !== undefined && inlineValue !== '') {
      args[key] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
      args[key] = argv[index + 1];
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function output(value, json = false) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (value.display) {
    console.log(`${value.display.title}: ${value.display.primary_line} (${value.display.secondary_line})`);
    for (const action of value.actions.slice(0, 3)) {
      console.log(`- ${action.score} ${action.label}`);
    }
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0] || 'snapshot';
  if (command === 'snapshot' || command === 'status') {
    const snapshot = await buildSnapshot({ configPath: args.config, probe: args.probe !== 'false' && args.noProbe !== true });
    output(snapshot, Boolean(args.json));
    return snapshot;
  }
  if (command === 'recommend') {
    const snapshot = await buildSnapshot({ configPath: args.config, probe: false });
    output({ actions: rankHardwareActions(snapshot) }, Boolean(args.json));
    return snapshot.actions;
  }
  if (command === 'event') {
    const event = normalizeHardwareEvent({
      deviceId: args.deviceId || args.device,
      button: args.button,
      actionId: args.actionId,
      note: args.note,
      scope: args.scope,
    });
    const secret = args.secret || process.env.HERMES_HARDWARE_LEASH_SECRET;
    const signed = secret ? signHardwareEvent(event, secret) : event;
    output(signed, Boolean(args.json));
    return signed;
  }
  if (command === 'verify') {
    const event = args.eventJson ? JSON.parse(args.eventJson) : normalizeHardwareEvent({
      deviceId: args.deviceId || args.device,
      button: args.button,
      actionId: args.actionId,
      note: args.note,
      ts: args.ts,
    });
    if (args.signature) {
      event.signature = args.signature;
    }
    const result = verifyHardwareEvent(event, args.secret || process.env.HERMES_HARDWARE_LEASH_SECRET, {
      replayWindowSeconds: args.replayWindowSeconds,
    });
    output(result, Boolean(args.json));
    if (!result.ok) {
      process.exitCode = 1;
    }
    return result;
  }
  if (command === 'server') {
    const port = Number(args.port || process.env.HERMES_HARDWARE_LEASH_PORT || 8795);
    const server = createHardwareLeashServer({
      secret: args.secret || process.env.HERMES_HARDWARE_LEASH_SECRET,
      configPath: args.config,
      logPath: args.logPath,
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`Hermes hardware leash listening on http://127.0.0.1:${port}`);
    });
    return server;
  }
  throw new Error(`Unknown command: ${command}`);
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  DEFAULT_EVENT_LOG_PATH,
  appendEventLog,
  buildSnapshot,
  createHardwareLeashServer,
  normalizeButton,
  normalizeHardwareEvent,
  parseArgs,
  rankHardwareActions,
  signHardwareEvent,
  stableStringify,
  verifyHardwareEvent,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
