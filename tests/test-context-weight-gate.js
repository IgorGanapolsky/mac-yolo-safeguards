#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { SOURCE, reviewContextWeight } = require('../tools/context-weight-gate');

function ids(report) {
  return report.findings.map((item) => item.id).sort();
}

function assertHeld(report) {
  assert.strictEqual(report.applied, false);
  assert.strictEqual(report.published, false);
  assert.strictEqual(report.routed, false);
  assert.strictEqual(report.databaseOpened, false);
  assert.strictEqual(report.processStarted, false);
  assert.strictEqual(report.fileWritten, false);
  assert.strictEqual(report.millisecondExact, null);
  assert.strictEqual(report.localLatencyMs, null);
  assert.strictEqual(report.localCompressionPct, null);
  assert.strictEqual(report.idleRamMb, null);
  assert.strictEqual(report.source, SOURCE);
  assert.deepStrictEqual(Object.keys(report).sort(), [
    'applied',
    'databaseOpened',
    'fileWritten',
    'findings',
    'humanReview',
    'idleRamMb',
    'localCompressionPct',
    'localLatencyMs',
    'millisecondExact',
    'ok',
    'processStarted',
    'published',
    'routed',
    'screenMarkdown',
    'source',
    'status',
    'tableMarkdown',
    'tier',
    'timelineMarkdown',
  ]);
  for (const item of report.findings) {
    assert.deepStrictEqual(Object.keys(item).sort(), ['id', 'severity']);
    assert.strictEqual(item.severity, 'block');
  }
}

function main() {
  const source = fs.readFileSync(path.join(__dirname, '../tools/context-weight-gate.js'), 'utf8');
  const banned = /require\(['"]node:sqlite['"]\)|new DatabaseSync|fs\.writeFile|fs\.mkdir|child_process|require\(['"]https['"]\)|require\(['"]http['"]\)|\bfetch\s*\(|\bexec\s*\(|\bexecFile\b|process\.env/;
  assert.strictEqual(banned.test(source), false);
  assert.strictEqual(/localLatencyMs\s*[:=]\s*[0-9]/.test(source), false);
  assert.strictEqual(/idleRamMb\s*[:=]\s*[0-9]/.test(source), false);
  assert.strictEqual(/localCompressionPct\s*[:=]\s*[0-9]/.test(source), false);
  assert.strictEqual(/millisecondExact\s*[:=]\s*(?:true|[0-9])/.test(source), false);

  const clear = reviewContextWeight({
    action: 'note',
    note: 'Leave the menu-bar app alone.',
    command: 'cat README.md',
  });
  assert.strictEqual(clear.ok, true);
  assert.strictEqual(clear.status, 'clear');
  assert.deepStrictEqual(clear.findings, []);
  assert.strictEqual(clear.humanReview, false);
  assert.strictEqual(clear.tier, null);
  assert.strictEqual(clear.timelineMarkdown, null);
  assert.strictEqual(clear.screenMarkdown, null);
  assert.strictEqual(clear.tableMarkdown, null);
  assertHeld(clear);

  const citation = reviewContextWeight({
    action: 'note',
    note: 'Bugsee (https://bugsee.com/) describes a millisecond-exact timeline. Firecrawl (https://www.firecrawl.dev/) describes an ultra-dense extract. OpenRouter (https://openrouter.ai/) describes a semantic cache. Jet Admin (https://www.jetadmin.io/) reads a schema.',
  });
  assert.strictEqual(citation.ok, true);
  assert.deepStrictEqual(citation.findings, []);
  assertHeld(citation);

  const targetRam = reviewContextWeight({
    action: 'note',
    note: 'The idle weight target is around 93 MB and is unmeasured.',
  });
  assert.strictEqual(targetRam.ok, true);
  assert.strictEqual(targetRam.idleRamMb, null);
  assertHeld(targetRam);

  const avoidElectron = reviewContextWeight({
    action: 'note',
    note: 'Avoid an Electron bundle.',
    command: 'npm install left-pad',
  });
  assert.strictEqual(avoidElectron.ok, true);
  assertHeld(avoidElectron);

  const lightTask = reviewContextWeight({
    action: 'note',
    task: 'formatting data',
  });
  assert.strictEqual(lightTask.ok, true);
  assert.strictEqual(lightTask.tier, 'light');
  assert.strictEqual(lightTask.routed, false);
  assertHeld(lightTask);

  const heavyTask = reviewContextWeight({
    action: 'note',
    task: 'multi-file migration',
  });
  assert.strictEqual(heavyTask.ok, true);
  assert.strictEqual(heavyTask.tier, 'heavy');
  assert.strictEqual(heavyTask.routed, false);
  assertHeld(heavyTask);

  const namedModels = reviewContextWeight({
    action: 'note',
    task: 'formatting data',
    note: 'A heavy example name is claude-fable-5.2. A light example name is gemini-2.5-flash-lite.',
  });
  assert.strictEqual(namedModels.ok, true);
  assert.strictEqual(namedModels.tier, 'light');
  assert.strictEqual(namedModels.routed, false);
  assertHeld(namedModels);

  const aligned = reviewContextWeight({
    action: 'meeting',
    speech: 'The build failed on the guard.',
    terminal: 'node tests/test-context-weight-gate.js',
    screen: 'const status = clear;',
    speechMs: 1700000000000,
    terminalMs: 1700000000000,
    screenMs: 1700000000000,
  });
  assert.strictEqual(aligned.ok, true);
  assert.strictEqual(aligned.humanReview, false);
  assert.ok(aligned.timelineMarkdown.indexOf('## State at 1700000000000') === 0);
  assert.ok(aligned.timelineMarkdown.indexOf('The build failed on the guard.') > 0);
  assert.ok(aligned.timelineMarkdown.indexOf('node tests/test-context-weight-gate.js') > 0);
  assert.ok(aligned.timelineMarkdown.indexOf('const status = clear;') > 0);
  assert.strictEqual(aligned.published, false);
  assert.strictEqual(aligned.millisecondExact, null);
  assertHeld(aligned);

  const missingStamp = reviewContextWeight({
    action: 'meeting',
    speech: 'hello',
    terminal: 'ls',
    screen: 'const x = 1;',
    speechMs: 10,
    terminalMs: 10,
  });
  assert.strictEqual(missingStamp.ok, false);
  assert.deepStrictEqual(ids(missingStamp), ['unanchored_timeline']);
  assert.strictEqual(missingStamp.timelineMarkdown, null);
  assert.strictEqual(missingStamp.humanReview, true);
  assertHeld(missingStamp);

  const mismatched = reviewContextWeight({
    action: 'meeting',
    speech: 'hello',
    terminal: 'ls',
    screen: 'const x = 1;',
    speechMs: 1,
    terminalMs: 2,
    screenMs: 1,
  });
  assert.deepStrictEqual(ids(mismatched), ['unanchored_timeline']);
  assert.strictEqual(mismatched.timelineMarkdown, null);
  assertHeld(mismatched);

  const invented = reviewContextWeight({
    action: 'record',
    speech: 'hello',
    terminal: 'ls',
    screen: 'const x = 1;',
    speechMs: 5,
    terminalMs: 5,
    screenMs: 5,
    note: 'timestampMs: Date.now()',
  });
  assert.deepStrictEqual(ids(invented), ['unanchored_timeline']);
  assert.strictEqual(invented.timelineMarkdown, null);
  assertHeld(invented);

  const meetingTool = reviewContextWeight({
    action: 'note',
    command: 'dayglass_get_live_meeting',
  });
  assert.deepStrictEqual(ids(meetingTool), ['unanchored_timeline']);
  assert.strictEqual(meetingTool.timelineMarkdown, null);
  assert.strictEqual(meetingTool.humanReview, true);
  assertHeld(meetingTool);

  const code = reviewContextWeight({
    action: 'compile',
    screen: 'function add() {\n  return 1;\n}',
  });
  assert.strictEqual(code.ok, true);
  assert.strictEqual(code.screenMarkdown, '```\nfunction add() {\n  return 1;\n}\n```');
  assert.strictEqual(code.published, false);
  assert.strictEqual(code.localCompressionPct, null);
  assertHeld(code);

  const slides = reviewContextWeight({
    action: 'compile',
    screen: 'Slide 1: Intro\nSlide 2: Next',
  });
  assert.strictEqual(slides.ok, true);
  assert.strictEqual(slides.screenMarkdown, '## 1. Intro\n## 2. Next');
  assertHeld(slides);

  const tree = reviewContextWeight({
    action: 'compile',
    screen: '[AXGroup] AXFrame=1 Target:0xabc',
  });
  assert.deepStrictEqual(ids(tree), ['geometric_noise']);
  assert.strictEqual(tree.screenMarkdown, null);
  assert.strictEqual(tree.humanReview, false);
  assertHeld(tree);

  const prose = reviewContextWeight({
    action: 'compile',
    screen: 'A paragraph about the menu bar.',
  });
  assert.strictEqual(prose.ok, true);
  assert.strictEqual(prose.screenMarkdown, null);
  assertHeld(prose);

  const table = reviewContextWeight({
    action: 'note',
    columns: 'pid, cpu, ram',
  });
  assert.strictEqual(table.ok, true);
  assert.strictEqual(table.tableMarkdown, '| pid | cpu | ram |\n| --- | --- | --- |');
  assert.strictEqual(table.processStarted, false);
  assert.strictEqual(table.fileWritten, false);
  assertHeld(table);

  const heavyForLight = reviewContextWeight({
    action: 'note',
    task: 'write basic tests',
    note: 'route the basic tests to claude-fable-5.2',
  });
  assert.deepStrictEqual(ids(heavyForLight), ['remote_call', 'tier_mismatch']);
  assert.strictEqual(heavyForLight.tier, 'light');
  assert.strictEqual(heavyForLight.routed, false);
  assert.strictEqual(heavyForLight.humanReview, true);
  assertHeld(heavyForLight);

  const lightForHeavy = reviewContextWeight({
    action: 'route',
    task: 'abstract logic',
    note: 'gemini-2.5-flash-lite',
  });
  assert.deepStrictEqual(ids(lightForHeavy), ['remote_call', 'tier_mismatch']);
  assert.strictEqual(lightForHeavy.tier, 'heavy');
  assert.strictEqual(lightForHeavy.routed, false);
  assertHeld(lightForHeavy);

  const routeLight = reviewContextWeight({
    action: 'route',
    task: 'schema mapping',
  });
  assert.deepStrictEqual(ids(routeLight), ['remote_call']);
  assert.strictEqual(routeLight.tier, 'light');
  assert.strictEqual(routeLight.routed, false);
  assertHeld(routeLight);

  const api = reviewContextWeight({
    action: 'note',
    note: 'POST https://openrouter.ai/api/v1/chat',
  });
  assert.deepStrictEqual(ids(api), ['remote_call']);
  assert.strictEqual(api.routed, false);
  assertHeld(api);

  const database = reviewContextWeight({ action: 'database' });
  assert.deepStrictEqual(ids(database), ['second_database']);
  assert.strictEqual(database.databaseOpened, false);
  assert.strictEqual(database.humanReview, true);
  assertHeld(database);

  const engine = reviewContextWeight({
    action: 'note',
    command: 'node tools/bugsee-firecrawl-openrouter-jetadmin-engine.js',
  });
  assert.deepStrictEqual(ids(engine), ['vendor_engine']);
  assert.strictEqual(engine.databaseOpened, false);
  assert.strictEqual(engine.humanReview, false);
  assertHeld(engine);

  const electron = reviewContextWeight({
    action: 'note',
    command: 'npm install electron',
  });
  assert.deepStrictEqual(ids(electron), ['vendor_install']);
  assert.strictEqual(electron.processStarted, false);
  assertHeld(electron);

  const window = reviewContextWeight({ action: 'ui' });
  assert.deepStrictEqual(ids(window), ['vendor_ui']);
  assert.strictEqual(window.processStarted, false);
  assert.strictEqual(window.tableMarkdown, null);
  assertHeld(window);

  const swift = reviewContextWeight({
    action: 'note',
    command: 'writeFileSync("Dashboard.swift", source)',
  });
  assert.deepStrictEqual(ids(swift), ['file_write', 'vendor_ui']);
  assert.strictEqual(swift.fileWritten, false);
  assertHeld(swift);

  const measured = reviewContextWeight({
    action: 'note',
    note: 'idleRamMb: 93. compressionRatioPct: 40. We run a millisecond-exact timeline. We keep a semantic cache.',
  });
  assert.deepStrictEqual(ids(measured), ['unmeasured_figure']);
  assert.strictEqual(measured.idleRamMb, null);
  assert.strictEqual(measured.localCompressionPct, null);
  assert.strictEqual(measured.humanReview, false);
  assertHeld(measured);

  const ourDense = reviewContextWeight({
    action: 'note',
    note: 'Our extract is ultra-dense.',
  });
  assert.deepStrictEqual(ids(ourDense), ['unmeasured_figure']);
  assertHeld(ourDense);

  const stacked = reviewContextWeight({
    action: 'route',
    task: 'formatting data to claude-fable-5.2',
    note: 'npm install electron. compressionRatioPct: 40. idleRamMb: 93. We run a millisecond-exact timeline. DatabaseSync.',
    command: 'node tools/bugsee-firecrawl-openrouter-jetadmin-engine.js',
    speech: 'hello',
    terminal: 'ls',
    screen: '[AXGroup] AXFrame=1',
  });
  assert.deepStrictEqual(ids(stacked), [
    'geometric_noise',
    'remote_call',
    'second_database',
    'tier_mismatch',
    'unanchored_timeline',
    'unmeasured_figure',
    'vendor_engine',
    'vendor_install',
  ]);
  assert.strictEqual(stacked.humanReview, true);
  assert.strictEqual(stacked.timelineMarkdown, null);
  assert.strictEqual(stacked.screenMarkdown, null);
  assert.strictEqual(stacked.ok, false);
  assertHeld(stacked);

  const clearCli = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/context-weight-gate.js'),
    '--action', 'note',
    '--note', 'Leave the menu-bar app alone.',
    '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(clearCli.status, 0);
  const clearReport = JSON.parse(clearCli.stdout);
  assert.strictEqual(clearReport.ok, true);
  assert.strictEqual(clearReport.published, false);
  assert.strictEqual(clearReport.idleRamMb, null);

  const blockedCli = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/context-weight-gate.js'),
    '--action', 'route',
    '--task', 'formatting data',
    '--json',
  ], { encoding: 'utf8' });
  assert.strictEqual(blockedCli.status, 2);
  const blockedReport = JSON.parse(blockedCli.stdout);
  assert.strictEqual(blockedReport.routed, false);
  assert.strictEqual(blockedReport.findings.some((item) => item.id === 'remote_call'), true);

  console.log('test-context-weight-gate: PASS');
}

main();
