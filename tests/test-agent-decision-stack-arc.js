'use strict';

const assert = require('assert');
const path = require('path');
const {
  parseArgs,
  shouldRunArcProbe,
  runArcSkillProbe,
  recommendNextAction,
  buildBrief,
} = require('../tools/agent-decision-stack');

assert.strictEqual(parseArgs(['--task', 'x', '--with-arc']).withArc, true);
assert.strictEqual(parseArgs(['--task', 'x', '--skip-arc']).skipArc, true);

assert.strictEqual(shouldRunArcProbe({ task: 'fix typo', withArc: false, skipArc: false }), false);
assert.strictEqual(shouldRunArcProbe({ task: 'promote fleet model', withArc: false, skipArc: false }), true);
assert.strictEqual(shouldRunArcProbe({ task: 'ARC-AGI check', withArc: false, skipArc: false }), true);
assert.strictEqual(shouldRunArcProbe({ task: 'promote fleet model', withArc: false, skipArc: true }), false);
assert.strictEqual(shouldRunArcProbe({ task: 'noop', withArc: true, skipArc: false }), true);

const probe = runArcSkillProbe();
assert.strictEqual(probe.overallStatus, 'pass');
assert.ok(probe.metrics.holdoutAccuracy >= 0.8);

assert.match(
  recommendNextAction({
    telemetry: { arcSkillEfficiency: { overallStatus: 'fail', skipped: false } },
  }),
  /ARC skill-acquisition/,
);

const brief = buildBrief({
  task: 'benchmark intelligence before model promote',
  skipThumbgate: true,
  skipGraphify: true,
  skipLocalRetrieval: true,
  withArc: false,
  skipArc: false,
  ghRun: '',
});
assert.ok(brief.telemetry.arcSkillEfficiency);
assert.strictEqual(brief.telemetry.arcSkillEfficiency.overallStatus, 'pass');

console.log('ok', path.basename(__filename));
