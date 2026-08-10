#!/usr/bin/env node
/**
 * Test suite for jcode fleet RAM auditor + adaptive job sizer (high-ROI steals)
 */

const { audit, classify, parseEtime } = require('../tools/jcode-fleet-ram-auditor');
const { sizeJobs, computeSafeJobs, pressureLabel, getMemoryState } = require('../tools/jcode-adaptive-job-sizer');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

function testParseEtime() {
  assert(parseEtime('00:30') === 30, 'MM:SS parse');
  assert(parseEtime('01:00:00') === 3600, 'HH:MM:SS parse');
  assert(parseEtime('2-03:04:05') === 2 * 86400 + 3 * 3600 + 4 * 60 + 5, 'D-HH:MM:SS parse');
  console.log('✅ parseEtime passed.');
}

function testAuditClassifiesAndDetectsLeaks() {
  const procs = [
    { pid: 1, etime: '00:05:00', ageSec: 300, rssMb: 50, cmd: 'agy --dangerously-skip-permissions' },
    { pid: 2, etime: '3-00:00:00', ageSec: 3 * 86400, rssMb: 250, cmd: 'agy --dangerously-skip-permissions' },
    { pid: 3, etime: '2-00:00:00', ageSec: 2 * 86400, rssMb: 180, cmd: 'agy --dangerously-skip-permissions' },
    { pid: 4, etime: '1-00:00:00', ageSec: 86400, rssMb: 70, cmd: 'node /Users/x/.local/bin/hermes-yolo' },
    { pid: 5, etime: '00:00:10', ageSec: 10, rssMb: 20, cmd: 'python snowflake-labs-mcp/foo' },
    { pid: 6, etime: '00:00:10', ageSec: 10, rssMb: 15, cmd: 'com.apple.launchd' },
  ];
  const result = audit({ processes: procs });
  assert(result.totalRssMb === 585, `total ${result.totalRssMb} !== 585`);
  const agy = result.classes.find((c) => c.key === 'agy');
  assert(agy && agy.count === 3 && agy.rssMb === 480, 'agy class counted');
  // Leak detection: agy pid 2/3 old + >60MB; hermes-yolo pid 4 old + 70MB -> 3 leaks
  const leakPids = result.leaks.map((l) => l.pid).sort((a, b) => a - b);
  assert(JSON.stringify(leakPids) === JSON.stringify([2, 3, 4]), `leak pids ${leakPids} != [2,3,4]`);
  assert(result.leaks.find((l) => l.pid === 2).className === 'agy', 'leak class tagged');
  console.log('✅ Fleet audit classifies + detects leaks passed.');
}

function testSizeJobs() {
  // Simulate 32GB total, 8GB available -> safe 2 jobs at 1536+4096 reserve
  const state = { availableMb: 8192, totalMb: 32768 };
  const safe = computeSafeJobs(state, 1536, 4096);
  assert(safe.parallel === 2, `parallel ${safe.parallel} != 2`);
  assert(safe.budgetableMb === 4096, 'budgetable');
  console.log('✅ computeSafeJobs passed.');
}

function testPressureLabels() {
  assert(pressureLabel(50) === 'calm', 'calm');
  assert(pressureLabel(70) === 'elevated', 'elevated');
  assert(pressureLabel(85) === 'high', 'high');
  assert(pressureLabel(95) === 'critical', 'critical');
  console.log('✅ pressure labels passed.');
}

function testVerifiedVmStat() {
  // Real vm_stat-shaped fixture on this Mac (page size 16k)
  const vm = {
    'Pages free': 3706,
    'Pages active': 230307,
    'Pages inactive': 220279,
    'Pages speculative': 9095,
    'Pages wired down': 414718,
    'Pages occupied by compressor': 0,
  };
  const state = getMemoryState(vm);
  assert(state.availableMb > 0, 'availableMb positive');
  assert(state.wiredMb >= 4000, `wired ${state.wiredMb}`);
  const sized = sizeJobs({ vmOverride: vm, jobBudgetMb: 1536, reserveMb: 4096 });
  assert(sized.safeParallelJobs >= 1, 'optimistic parallel >= 1');
  assert(typeof sized.verdict === 'string', 'verdict string');
  console.log('✅ getMemoryState with fixture passed.');
}

function run() {
  console.log('=== Testing jcode Fleet RAM Auditor + Adaptive Job Sizer ===');
  testParseEtime();
  testAuditClassifiesAndDetectsLeaks();
  testSizeJobs();
  testPressureLabels();
  testVerifiedVmStat();
  console.log('🎉 All jcode fleet/sizer tests PASSED!');
}

if (require.main === module) {
  run();
}