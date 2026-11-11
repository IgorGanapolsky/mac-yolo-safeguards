#!/usr/bin/env node
'use strict';

/**
 * Fail closed on an unanchored speech/terminal/screen block, a second timeline
 * database, a raw screen tree, a model call, and an Electron or generated window.
 * Sources: https://bugsee.com/ https://www.firecrawl.dev/
 * https://openrouter.ai/ https://www.jetadmin.io/
 *
 * Done means: node tests/test-context-weight-gate.js exits 0.
 * Keep: no model call, no new database, no screen capture, no window, null measurements.
 */

const SOURCE = 'https://bugsee.com/ https://www.firecrawl.dev/ https://openrouter.ai/ https://www.jetadmin.io/';

const GEOMETRIC = /\[AX[A-Za-z]+\]|\bAXFrame\s*=|\bAXPosition\s*=|\bTarget:0x[0-9a-f]/i;
const CODE = /\b(?:function|const|let|class|def|import|fn)\b/;
const SLIDE_LINE = /^slide\s+(\d+)\s*[:.\-]?\s*(.*)$/i;
const SECOND_DB = /\bDatabaseSync\b|\btimeline_frames\b|\bgateway_semantic_cache\b|\bCREATE\s+VIRTUAL\s+TABLE\b|\bopenOmniscientSqlite\b|\bnode:sqlite\b/i;
const ENGINE = /bugsee-firecrawl-openrouter-jetadmin-engine/;
const INSTALL = /\b(?:npm|pnpm|bun|brew|pip|npx)\s+(?:install|add)\b[\s\S]{0,80}\b(?:bugsee|firecrawl|openrouter|jetadmin|jet-admin|electron)\b/i;
const MODEL_CALL = /\b(?:route|send|call|post)\b[\s\S]{0,80}\b(?:gemini-2\.5-flash-lite|claude-fable-5\.2|flash-lite|fable\s*5(?:\.\d+)?)\b/i;
const API_URL = /openrouter\.ai\/api|generativelanguage\.googleapis\.com/i;
const HEAVY_MODEL = /\b(?:claude-fable-5\.2|fable\s*5(?:\.\d+)?)\b/i;
const LIGHT_MODEL = /\b(?:gemini-2\.5-flash-lite|flash-lite)\b/i;
const LIGHT_TASK = /\b(?:format(?:ting)?(?:\s+data)?|basic tests?|schema mappings?|simple schema mappings?)\b/i;
const HEAVY_TASK = /\b(?:multi-file migrations?|abstract (?:logical|architectural) (?:breakdowns?|root-cause|logic)|abstract logic)\b/i;
const INVENTED_CLOCK = /timestampMs\s*[:=]\s*Date\.now\(\)/;
const FILE_WRITE = /\bwriteFile(?:Sync)?\s*\(/;
const SWIFT_WRITE = /\b(?:writeFile(?:Sync)?|cp|mv)\b[\s\S]{0,80}\.swift\b/i;
const MEASURED_RAM = /\bidleRam(?:Target)?Mb\s*[:=]\s*93\b|\bcompressionRatioPct\s*[:=]\s*\d/;
const MEETING_TOOL = /dayglass_get_live_meeting/;

function finding(id) {
  return { id, severity: 'block' };
}

function msOf(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function compileScreen(text) {
  const raw = String(text || '').trim();
  if (!raw || GEOMETRIC.test(raw)) return null;
  if (/^```/.test(raw)) return raw;
  const lines = raw.split('\n');
  const filled = lines.filter((line) => line.trim());
  const slides = filled.filter((line) => SLIDE_LINE.test(line.trim()));
  if (slides.length > 0 && slides.length === filled.length) {
    return lines.map((line) => {
      const match = line.trim().match(SLIDE_LINE);
      if (!match) return line;
      return '## ' + match[1] + '. ' + match[2];
    }).join('\n');
  }
  if (CODE.test(raw)) return '```\n' + raw + '\n```';
  return null;
}

function compileTable(columns) {
  const list = Array.isArray(columns) ? columns : String(columns || '').split(',');
  const names = list.map((item) => String(item).trim()).filter(Boolean);
  if (!names.length || names.some((name) => /[|\n]/.test(name))) return null;
  return '| ' + names.join(' | ') + ' |\n| ' + names.map(() => '---').join(' | ') + ' |';
}

function buildTimeline(speech, terminal, screen, ms) {
  return [
    '## State at ' + ms,
    '### Spoken',
    String(speech).trim(),
    '### Terminal',
    String(terminal).trim(),
    '### Screen',
    String(screen).trim(),
  ].join('\n');
}

function reviewContextWeight(input = {}) {
  const action = String(input.action || 'note').toLowerCase();
  const note = String(input.note || '');
  const command = String(input.command || '');
  const task = String(input.task || '');
  const speech = String(input.speech || '');
  const terminal = String(input.terminal || '');
  const screen = String(input.screen || '');
  const blob = [note, command, task].filter(Boolean).join('\n');
  const findings = [];

  const speechMs = msOf(input.speechMs);
  const terminalMs = msOf(input.terminalMs);
  const screenMs = msOf(input.screenMs);
  const aligned = Boolean(speech.trim() && terminal.trim() && screen.trim()
    && speechMs !== null && speechMs === terminalMs && terminalMs === screenMs);
  const geometric = GEOMETRIC.test(screen);
  const wantsTimeline = action === 'meeting' || action === 'record'
    || MEETING_TOOL.test(blob)
    || Boolean(speech.trim() && terminal.trim() && screen.trim());
  const inventedClock = INVENTED_CLOCK.test(blob);

  if ((wantsTimeline && !aligned) || (inventedClock && (wantsTimeline || action === 'meeting' || action === 'record'))) {
    findings.push(finding('unanchored_timeline'));
  }
  if (geometric && (action === 'compile' || action === 'payload' || wantsTimeline)) {
    findings.push(finding('geometric_noise'));
  }
  if (action === 'database' || SECOND_DB.test(blob)) findings.push(finding('second_database'));
  if (ENGINE.test(blob)) findings.push(finding('vendor_engine'));
  if (action === 'install' || INSTALL.test(blob)) findings.push(finding('vendor_install'));

  const callsModel = action === 'route' || action === 'call' || MODEL_CALL.test(blob) || API_URL.test(blob);
  if (callsModel) findings.push(finding('remote_call'));

  const tier = HEAVY_TASK.test(task || blob) ? 'heavy' : (LIGHT_TASK.test(task || blob) ? 'light' : null);
  const picksHeavy = action === 'heavy' || HEAVY_MODEL.test(blob);
  const picksLight = action === 'light' || LIGHT_MODEL.test(blob);
  if (tier === 'light' && picksHeavy && (callsModel || action === 'heavy')) findings.push(finding('tier_mismatch'));
  if (tier === 'heavy' && picksLight && (callsModel || action === 'light')) findings.push(finding('tier_mismatch'));

  if (action === 'ui' || action === 'webview' || action === 'swift' || SWIFT_WRITE.test(blob)) {
    findings.push(finding('vendor_ui'));
  }
  if (FILE_WRITE.test(blob)) findings.push(finding('file_write'));

  if (MEASURED_RAM.test(blob)) findings.push(finding('unmeasured_figure'));
  if (/millisecond-exact/i.test(blob) && !/\bBugsee\b/.test(blob)) findings.push(finding('unmeasured_figure'));
  if (/ultra-dense/i.test(blob) && !/\bFirecrawl\b/.test(blob)) findings.push(finding('unmeasured_figure'));
  if (/semantic cache/i.test(blob) && !/\bOpenRouter\b/.test(blob)) findings.push(finding('unmeasured_figure'));

  const seen = new Set();
  const unique = findings.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const humanReview = unique.some((item) => (
    item.id === 'unanchored_timeline'
    || item.id === 'tier_mismatch'
    || item.id === 'remote_call'
    || item.id === 'second_database'
  ));

  const compileAction = action === 'compile' || action === 'payload';
  const screenMarkdown = !geometric && compileAction ? compileScreen(screen) : null;
  const timelineMarkdown = aligned && !geometric && !inventedClock
    ? buildTimeline(speech, terminal, screen, speechMs)
    : null;
  const tableMarkdown = action === 'ui' || action === 'webview' || action === 'swift'
    ? null
    : compileTable(input.columns);

  return {
    ok: unique.length === 0,
    status: unique.length ? 'blocked' : 'clear',
    findings: unique,
    applied: false,
    published: false,
    routed: false,
    databaseOpened: false,
    processStarted: false,
    fileWritten: false,
    humanReview,
    tier,
    timelineMarkdown,
    screenMarkdown,
    tableMarkdown,
    millisecondExact: null,
    localLatencyMs: null,
    localCompressionPct: null,
    idleRamMb: null,
    source: SOURCE,
  };
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0 || index + 1 >= argv.length) return '';
  return argv[index + 1];
}

function main() {
  const argv = process.argv.slice(2);
  const report = reviewContextWeight({
    action: argValue(argv, '--action') || 'note',
    note: argValue(argv, '--note'),
    command: argValue(argv, '--command'),
    task: argValue(argv, '--task'),
    speech: argValue(argv, '--speech'),
    terminal: argValue(argv, '--terminal'),
    screen: argValue(argv, '--screen'),
    speechMs: argValue(argv, '--speech-ms'),
    terminalMs: argValue(argv, '--terminal-ms'),
    screenMs: argValue(argv, '--screen-ms'),
    columns: argValue(argv, '--columns'),
  });
  if (argv.indexOf('--json') >= 0) console.log(JSON.stringify(report));
  else {
    console.log(report.ok ? 'Context weight: clear' : 'Context weight: blocked');
    for (const item of report.findings) console.log('blocked: ' + item.id);
    console.log('published: false');
    console.log('routed: false');
    console.log('humanReview: ' + report.humanReview);
  }
  process.exit(report.ok ? 0 : 2);
}

if (require.main === module) main();

module.exports = { SOURCE, reviewContextWeight };
