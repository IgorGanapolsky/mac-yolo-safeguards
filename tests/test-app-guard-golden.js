#!/usr/bin/env node
'use strict';

/**
 * Golden set for the Mac YOLO app's kill/spare decisions ("Stop Runaways" = Cool Down Fans,
 * "Free Agent RAM" = agent-guard clean, stranded-agent reaper). Runs the REAL decision
 * functions over redacted snapshots of real process tables, documented incidents and
 * derived variants, then scores them:
 *   false kill   expected spare, got kill     must be 0 (fails the test)
 *   missed       expected kill, got spare     recall must not fall below the recorded floor
 *
 * Fixtures: tests/fixtures/app-guard-golden/{snapshots,cases}/*.json, floor.json.
 * Unlisted pids default to spare, so any kill outside a case's `expect.kill` is a false kill.
 * Capture new snapshots with tools/capture-guard-snapshot.js.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const guard = require('../tools/mac-yolo-agent-guard');
const care = require('../tools/mac-yolo-system-care-engine');

const FIXTURES = path.join(__dirname, 'fixtures', 'app-guard-golden');
const T0 = 1_700_000_000_000;

function readJson(...parts) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, ...parts), 'utf8'));
}

// Resolve a case to { ps rows, cpuSamples, launchdPids }.
function materialize(c) {
  let ps = c.ps ? [...c.ps] : [];
  let samples = c.cpuSamples ? JSON.parse(JSON.stringify(c.cpuSamples)) : [];
  let launchd = [...(c.launchdPids || [])];
  if (c.snapshot) {
    const snap = readJson('snapshots', `${c.snapshot}.json`);
    ps = [...snap.ps];
    samples = snap.cpuSamples;
    launchd = [...snap.launchdPids, ...launchd];
  }
  const ov = c.overlay || {};
  const removed = new Set((ov.remove || []).map(Number));
  const replaced = new Map(Object.entries(ov.replace || {}).map(([pid, line]) => [Number(pid), line]));
  ps = ps.filter((l) => !removed.has(Number(l.split(' ')[0]))).map((l) => replaced.get(Number(l.split(' ')[0])) || l);
  ps.push(...(ov.add || []));
  if (c.timeline) {
    // Hold every process's CPU time flat for flatForSec, except `moving` pids, which keep burning CPU.
    const added = Object.fromEntries((ov.add || []).map((l) => [l.split(' ')[0], 0]));
    const base = { ...samples[0].cpu, ...added, ...(ov.cpu || {}) };
    const later = { ...base };
    for (const pid of c.timeline.moving || []) later[pid] = (later[pid] || 0) + c.timeline.flatForSec / 2;
    samples = [{ atSec: 0, cpu: base }, { atSec: c.timeline.flatForSec, cpu: later }];
  }
  return { ps, samples, launchdPids: new Set(launchd.map(Number)) };
}

// The union of everything the app's actions would signal, with the action that picked each pid.
function decide(c) {
  const { ps, samples, launchdPids } = materialize(c);
  const procs = guard.parsePs(ps.join('\n'));
  let idle = new Map();
  for (const s of samples) {
    const cpu = new Map(Object.entries(s.cpu).map(([pid, v]) => [Number(pid), v]));
    idle = guard.trackIdle(idle, cpu, T0 + s.atSec * 1000);
  }
  const now = T0 + (samples.length ? samples[samples.length - 1].atSec : 0) * 1000;
  const killed = new Map();
  const mark = (pid, by) => { if (!killed.has(pid)) killed.set(pid, by); };
  for (const pid of care.runawayPids(procs)) mark(pid, 'cool-down-fans');
  for (const s of guard.findStorms(procs)) for (const pid of s.pids) mark(pid, 'storm');
  for (const p of guard.findOrphanMcpServers(procs, { launchdPids })) mark(p.pid, 'orphan-mcp');
  for (const p of guard.findStrandedAgents(procs, idle, { now, launchdPids })) mark(p.pid, 'stranded-agent');
  return { procs, killed };
}

function main() {
  const dir = path.join(FIXTURES, 'cases');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const floor = readJson('floor.json');
  assert.ok(files.length >= 25, `golden set needs at least 25 cases, found ${files.length}`);

  const falseKills = [];
  const known = [];
  const missed = [];
  let expectedKills = 0;
  let caught = 0;
  const bySource = { real: 0, incident: 0, derived: 0 };

  for (const f of files) {
    const c = readJson('cases', f);
    assert.ok(c.id && ['real', 'incident', 'derived'].includes(c.source), `${f}: id and source real|incident|derived`);
    assert.ok(c.expect && Array.isArray(c.expect.kill) && Array.isArray(c.expect.spare), `${f}: expect.kill and expect.spare`);
    for (const e of [...c.expect.kill, ...c.expect.spare]) assert.ok(e.pid && e.reason, `${f}: every expectation has pid and a reason`);
    bySource[c.source] += 1;
    const { procs, killed } = decide(c);
    const present = new Set(procs.map((p) => p.pid));
    const wantKill = new Map(c.expect.kill.map((e) => [e.pid, e.reason]));
    for (const e of [...c.expect.kill, ...c.expect.spare]) assert.ok(present.has(e.pid), `${f}: expected pid ${e.pid} is not in the snapshot`);
    for (const e of c.expect.spare) assert.ok(!wantKill.has(e.pid), `${f}: pid ${e.pid} is both kill and spare`);
    const name = (pid) => procs.find((p) => p.pid === pid).command.split(' ')[0].split('/').pop();
    for (const [pid, by] of killed) {
      if (wantKill.has(pid)) continue;
      const hit = { case: c.id, pid, process: name(pid), by };
      (c.knownFailure ? known : falseKills).push(hit);
    }
    for (const [pid, reason] of wantKill) {
      expectedKills += 1;
      if (killed.has(pid)) caught += 1;
      else missed.push({ case: c.id, pid, process: name(pid), reason });
    }
  }

  const recall = expectedKills ? caught / expectedKills : 1;
  console.log(`app-guard golden: cases=${files.length} (real=${bySource.real} incident=${bySource.incident} derived=${bySource.derived}) false_kills=${falseKills.length} known_failures=${known.length} recall=${caught}/${expectedKills}=${recall.toFixed(3)} floor=${floor.minRecall}`);
  for (const m of missed) console.log(`  missed runaway: ${m.case} pid ${m.pid} ${m.process} (${m.reason})`);
  for (const k of known) console.log(`  known false kill: ${k.case} pid ${k.pid} ${k.process} via ${k.by}`);
  for (const k of falseKills) console.log(`  FALSE KILL: ${k.case} pid ${k.pid} ${k.process} via ${k.by}`);

  assert.strictEqual(falseKills.length, 0, `${falseKills.length} false kill(s): a live session or foreground app would be killed`);
  assert.ok(recall + 1e-9 >= floor.minRecall, `recall ${recall.toFixed(3)} fell below the recorded floor ${floor.minRecall}`);
  if (Math.floor(recall * 10000) / 10000 > floor.minRecall + 1e-9) console.log(`  recall improved: raise tests/fixtures/app-guard-golden/floor.json minRecall to ${(Math.floor(recall * 10000) / 10000).toFixed(4)}`);
}

if (require.main === module) main();
module.exports = { decide, materialize };
