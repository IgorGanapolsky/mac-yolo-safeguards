'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ALWAYS_ON_PATHS,
  checkMergeConflictMarkers,
  scanFile,
} = require('../tools/check-merge-conflict-markers');

assert.ok(ALWAYS_ON_PATHS.includes('AGENTS.md'));
assert.ok(ALWAYS_ON_PATHS.includes('plan.md'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conflict-gate-'));
fs.writeFileSync(path.join(tmp, 'AGENTS.md'), '# clean\nNo markers here.\n');
fs.writeFileSync(path.join(tmp, 'plan.md'), '# plan\nclean\n');
fs.writeFileSync(path.join(tmp, 'CLAUDE.md'), 'see AGENTS\n');
fs.writeFileSync(path.join(tmp, 'GEMINI.md'), 'see AGENTS\n');
fs.mkdirSync(path.join(tmp, 'hermes-mobile'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'hermes-mobile/AGENTS.md'), 'ok\n');
fs.writeFileSync(path.join(tmp, 'hermes-mobile/CLAUDE.md'), 'ok\n');
fs.mkdirSync(path.join(tmp, 'docs/agent-field-guide'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'docs/agent-field-guide/index.md'), 'ok\n');
fs.mkdirSync(path.join(tmp, 'docs/agents'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'docs/agents/coordination.md'), 'ok\n');

const clean = checkMergeConflictMarkers({ repo: tmp });
assert.strictEqual(clean.ok, true, 'clean tree must pass');
assert.ok(clean.scanned >= 1);

// Incident shape: unresolved merge left in AGENTS.md (PR #1191 class).
fs.writeFileSync(
  path.join(tmp, 'AGENTS.md'),
  [
    '# AGENTS',
    '<<<<<<< HEAD',
    'short line',
    '||||||| parent of fbd788340',
    'parent body',
    '=======',
    'incoming body',
    '>>>>>>> fbd788340 (docs: add mandatory self-automated full E2E instrumentation directive)',
    '',
  ].join('\n'),
);

const dirty = checkMergeConflictMarkers({ repo: tmp });
assert.strictEqual(dirty.ok, false, 'conflict markers must fail closed');
assert.ok(dirty.violations.some((v) => v.file === 'AGENTS.md'));
assert.ok(dirty.violations[0].hitCount >= 3);

const hit = scanFile('AGENTS.md', tmp);
assert.ok(hit);
assert.ok(hit.hits.some((h) => h.text.includes('<<<<<<<')));

console.log('PASS check-merge-conflict-markers (clean + AGENTS.md incident shape)');
