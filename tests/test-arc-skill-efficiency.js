'use strict';

const assert = require('assert');
const path = require('path');

const {
  buildBattery,
  efficiencyScore,
  gridsEqual,
  induceAndApply,
  parseArgs,
  programFits,
  rotate90,
  runProbe,
  PROGRAMS,
} = require('../tools/arc-skill-efficiency');

assert.strictEqual(parseArgs(['--json']).json, true);
assert.strictEqual(parseArgs(['--min-holdout', '0.75']).minHoldout, 0.75);
assert.throws(() => parseArgs(['--min-holdout', '2']), /min-holdout/);
assert.throws(() => parseArgs(['--nope']), /Unknown/);

const rotated = rotate90([
  [1, 2],
  [3, 4],
]);
assert.ok(
  gridsEqual(rotated, [
    [3, 1],
    [4, 2],
  ]),
);

const colorProg = PROGRAMS.find((p) => p.id === 'color_1_to_2');
assert.ok(
  programFits(colorProg, [
    { input: [[1]], output: [[2]] },
    { input: [[1, 0]], output: [[2, 0]] },
  ]),
);

const induced = induceAndApply(
  [
    { input: [[1, 0], [0, 1]], output: [[2, 0], [0, 2]] },
    { input: [[1]], output: [[2]] },
  ],
  [[1, 1]],
);
assert.strictEqual(induced.ok, true);
assert.strictEqual(induced.programId, 'color_1_to_2');
assert.ok(gridsEqual(induced.prediction, [[2, 2]]));

assert.strictEqual(efficiencyScore({ success: false, complexity: 1, trainCount: 1 }), 0);
assert.strictEqual(efficiencyScore({ success: true, complexity: 2, trainCount: 2 }), 0.25);

const battery = buildBattery();
assert.ok(battery.length >= 8);
for (const task of battery) {
  assert.ok(task.id && task.train.length >= 1);
  assert.ok(Array.isArray(task.testInput) && Array.isArray(task.testOutput));
}

const report = runProbe({ minHoldout: 0.8 });
assert.strictEqual(report.schema, 'hermes/arc-skill-efficiency-v1');
assert.ok(report.metrics.totalTasks >= 8);
assert.ok(report.metrics.holdoutTasks >= 2);
assert.strictEqual(report.overallStatus, 'pass', JSON.stringify(report.metrics));
assert.ok(report.gates.holdoutPass);
assert.ok(report.gates.trainPass);
assert.ok(report.metrics.holdoutAccuracy >= 0.8);
assert.ok(report.source.philosophy.includes('arcprize.org'));

// Gate-style fail path: empty battery → fail
const empty = runProbe({ battery: [], holdoutIds: [], minHoldout: 0.8 });
assert.strictEqual(empty.overallStatus, 'fail');

console.log('ok', path.basename(__filename));
