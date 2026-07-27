#!/usr/bin/env node
'use strict';
// Minimal MCP (Model Context Protocol) server, stdio transport, zero npm deps.
// Gives the official `opencode` binary a "computer use" toolset — see the real
// screen (screenshot -> image content block) and act on it (click/move/type/key)
// via macOS `screencapture` + `cliclick` — the same primitives the `hermes` CLI's
// built-in computer_use toolset uses. Wired into opencode-yolo's generated
// opencode.json under `mcp.computer_use`.
//
// Protocol subset implemented: initialize, notifications/initialized,
// tools/list, tools/call. No resources/prompts — opencode only needs tools.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLICLICK = process.env.CLICLICK_BIN || '/opt/homebrew/bin/cliclick';

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function ok(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function fail(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function textContent(text) {
  return { content: [{ type: 'text', text: String(text) }] };
}

function haveCliclick() {
  return fs.existsSync(CLICLICK);
}

function runCliclick(args) {
  if (!haveCliclick()) throw new Error(`cliclick not found at ${CLICLICK} (brew install cliclick)`);
  execFileSync(CLICLICK, args, { timeout: 10000 });
}

const MODIFIER_NAMES = new Set(['cmd', 'alt', 'ctrl', 'shift', 'fn']);

function pressKeyCombo(keySpec) {
  const parts = String(keySpec).toLowerCase().split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error('key is required');
  const finalKey = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).filter((p) => MODIFIER_NAMES.has(p));
  const badModifiers = parts.slice(0, -1).filter((p) => !MODIFIER_NAMES.has(p));
  if (badModifiers.length) throw new Error(`unknown modifier(s): ${badModifiers.join(', ')} (allowed: cmd, alt, ctrl, shift, fn)`);
  for (const m of modifiers) runCliclick([`kd:${m}`]);
  try {
    runCliclick([`kp:${finalKey}`]);
  } finally {
    for (const m of modifiers.slice().reverse()) runCliclick([`ku:${m}`]);
  }
}

const TOOLS = [
  {
    name: 'screenshot',
    description: 'Capture the current macOS screen and return it as an image so the model can see it. Requires a vision-capable model (route opencode-yolo through -m hermes/glm-vision for screen/computer-use sessions).',
    inputSchema: {
      type: 'object',
      properties: {
        display: { type: 'integer', description: 'Display index to capture (screencapture -D). Omit for the main display.' },
      },
    },
  },
  {
    name: 'move_mouse',
    description: 'Move the real mouse cursor to absolute screen coordinates (x, y), without clicking.',
    inputSchema: {
      type: 'object',
      properties: { x: { type: 'integer' }, y: { type: 'integer' } },
      required: ['x', 'y'],
    },
  },
  {
    name: 'click',
    description: 'Click the real mouse at absolute screen coordinates (x, y). Set button="right" for a right-click, or double=true for a double-click.',
    inputSchema: {
      type: 'object',
      properties: {
        x: { type: 'integer' },
        y: { type: 'integer' },
        button: { type: 'string', enum: ['left', 'right'], default: 'left' },
        double: { type: 'boolean', default: false },
      },
      required: ['x', 'y'],
    },
  },
  {
    name: 'type_text',
    description: 'Type literal text at the current keyboard focus, as if typed by a real keyboard.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    name: 'key_press',
    description: 'Press a key or key combo, e.g. "return", "tab", "esc", "cmd+c", "cmd+shift+4". Modifiers: cmd, alt, ctrl, shift, fn.',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  },
];

function callTool(name, args) {
  args = args || {};
  switch (name) {
    case 'screenshot': {
      const tmp = path.join(os.tmpdir(), `opencode-yolo-screenshot-${process.pid}-${Date.now()}.png`);
      const capArgs = ['-x'];
      if (Number.isInteger(args.display)) capArgs.push('-D', String(args.display));
      capArgs.push(tmp);
      execFileSync('/usr/sbin/screencapture', capArgs, { timeout: 10000 });
      const data = fs.readFileSync(tmp);
      fs.unlinkSync(tmp);
      return { content: [{ type: 'image', data: data.toString('base64'), mimeType: 'image/png' }] };
    }
    case 'move_mouse':
      runCliclick([`m:${args.x},${args.y}`]);
      return textContent(`moved to ${args.x},${args.y}`);
    case 'click': {
      const kind = args.button === 'right' ? 'rc' : args.double ? 'dc' : 'c';
      runCliclick([`${kind}:${args.x},${args.y}`]);
      return textContent(`${args.double ? 'double-' : ''}${args.button === 'right' ? 'right-' : ''}clicked ${args.x},${args.y}`);
    }
    case 'type_text':
      runCliclick([`t:${args.text}`]);
      return textContent(`typed ${args.text.length} chars`);
    case 'key_press':
      pressKeyCombo(args.key);
      return textContent(`pressed ${args.key}`);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      continue;
    }
    handleMessage(msg);
  }
});

function handleMessage(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    ok(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'opencode-yolo-computer-use', version: '1.0.0' },
    });
    return;
  }
  if (method === 'notifications/initialized') return; // no response for notifications
  if (method === 'tools/list') {
    ok(id, { tools: TOOLS });
    return;
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const args = params && params.arguments;
    try {
      ok(id, callTool(name, args));
    } catch (e) {
      ok(id, { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true });
    }
    return;
  }
  if (id !== undefined) fail(id, -32601, `method not found: ${method}`);
}

process.stdin.resume();
