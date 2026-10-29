#!/usr/bin/env node
'use strict';

/**
 * Cheap screen packet shared by the decision stack and Dayglass.
 *
 * The confusion gate still runs on the task alone. A window title does not
 * clear a vague task. An unchanged window skips the brief. A new window that
 * passes the gate keeps only that window line and does not run RAG.
 *
 *   node tools/dayglass-screen-budget.js --json '{"task":"edit tools/foo.js","screen":{"app_name":"Ghostty","window_title":"thumbgate"}}'
 */

const { measure } = require('./agent-confusion-gate');

const FIELD_CAP = 180;
const GRAPH_SLICE_CHARS = 6000;

function clipField(value) {
  const text = String(value || '').replace(/[\r\n]+/g, ' ').trim();
  return text.length > FIELD_CAP ? text.slice(0, FIELD_CAP) : text;
}

function screenFrom(screen) {
  const nested = screen && typeof screen === 'object' ? screen : {};
  const app = clipField(nested.app_name || nested.app || '');
  const title = clipField(nested.window_title || nested.title || '');
  if (!app && !title) return { app: '', title: '', key: '' };
  return { app, title, key: `${app}\n${title}` };
}

function screenLine(screen) {
  if (!screen.app) return '';
  return screen.title ? `${screen.app} — ${screen.title}` : screen.app;
}

function budget(input = {}) {
  const task = String(input.task || input.instruction || '').trim();
  const screen = screenFrom(input.screen);
  const previous = input.previous && typeof input.previous === 'object' ? input.previous : {};
  const previousKey = String(previous.key || '');
  const previousTask = String(previous.task || '');
  if (screen.key && previousKey === screen.key && previousTask === task) {
    return {
      action: 'skip',
      modelCalls: 0,
      callModel: false,
      contextBytes: 0,
      runFullBrief: false,
      replacedGraphChars: GRAPH_SLICE_CHARS,
      screen,
      confusion: null,
      prompt: '',
      reason: 'Front window and task are unchanged, so the decision brief stays cached.',
    };
  }
  const confusion = measure({
    instruction: task,
    command: input.command,
    path: input.path,
    actor: input.actor,
    claims: input.claims,
    records: input.records,
    planText: input.planText,
  });
  const line = screenLine(screen);
  if (confusion.decision === 'hold') {
    const held = line ? `On screen now: ${line}` : '';
    return {
      action: 'hold',
      modelCalls: 0,
      callModel: false,
      contextBytes: Buffer.byteLength(held, 'utf8'),
      runFullBrief: false,
      replacedGraphChars: GRAPH_SLICE_CHARS,
      screen,
      confusion,
      prompt: '',
      reason: 'Hold. A confusion axis fired before this decision.',
    };
  }
  if (screen.key) {
    const prompt = `On screen now: ${line}\n${task}`;
    return {
      action: 'screen',
      modelCalls: 0,
      callModel: true,
      contextBytes: Buffer.byteLength(prompt, 'utf8'),
      runFullBrief: false,
      replacedGraphChars: GRAPH_SLICE_CHARS,
      screen,
      confusion,
      prompt,
      reason: 'Confusion gate passed. Use the front window only and skip the full brief.',
    };
  }
  return {
    action: 'full',
    modelCalls: 0,
    callModel: true,
    contextBytes: 0,
    runFullBrief: true,
    replacedGraphChars: 0,
    screen,
    confusion,
    prompt: '',
    reason: 'No front window was supplied. The full decision brief may run.',
  };
}

function main(argv) {
  if (argv[0] !== '--json' || !argv[1]) {
    process.stdout.write(`${JSON.stringify({ ok: false, action: 'hold', error: 'usage: --json <object>' })}\n`);
    process.exitCode = 2;
    return;
  }
  let input;
  try {
    input = JSON.parse(argv[1]);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, action: 'hold', error: 'invalid json' })}\n`);
    process.exitCode = 2;
    return;
  }
  const result = budget(input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.action === 'hold' ? 1 : 0;
}

module.exports = {
  FIELD_CAP,
  GRAPH_SLICE_CHARS,
  budget,
  screenFrom,
};

if (require.main === module) main(process.argv.slice(2));
