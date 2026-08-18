#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  blastRadius,
  contextForPath,
  flattenAcceptanceCriteria,
  gradeAc,
  loadContract,
  main,
  runCheck,
} = require('../scripts/intent-check');

const repoRoot = path.resolve(__dirname, '..');
let passed = 0;

function ok(name) {
  passed += 1;
  console.log(`ok  ${passed}  ${name}`);
}

const fixtureAc = {
  capability: 'DEMO',
  story: 'DEMO-001',
  key: 'DEMO-001-AC1',
  criterion: 'Demo file must exist.',
  implements: ['src/app.js'],
  tests: ['tests/app.test.js'],
  must_contain: [{ in: 'src/app.js', pattern: 'hello' }],
  must_not_contain: [{ in: 'src/app.js', pattern: 'WAKE-SKU' }],
};

const files = {
  'src/app.js': 'module.exports = "hello";\n',
  'tests/app.test.js': 'assert.ok(true);\n',
};

function withFiles(map) {
  return {
    root: '/tmp/intent-check-fixture',
    existsFn: (rel) => Object.prototype.hasOwnProperty.call(map, rel),
    readFn: (rel) => {
      if (!Object.prototype.hasOwnProperty.call(map, rel)) throw new Error(`missing ${rel}`);
      return map[rel];
    },
  };
}

{
  const row = gradeAc(fixtureAc, withFiles(files));
  assert.equal(row.grade, 'supported');
  assert.equal(row.missing.length, 0);
  assert.equal(row.contentFails.length, 0);
  ok('grades supported when links exist and content matches');
}

{
  const row = gradeAc(fixtureAc, withFiles({ 'src/app.js': files['src/app.js'] }));
  assert.equal(row.grade, 'broken');
  assert.deepEqual(row.missing, [{ kind: 'test', path: 'tests/app.test.js' }]);
  ok('grades broken when a linked test is missing');
}

{
  const row = gradeAc(fixtureAc, withFiles({
    'src/app.js': 'module.exports = "nope";\n',
    'tests/app.test.js': files['tests/app.test.js'],
  }));
  assert.equal(row.grade, 'unsupported');
  assert.equal(row.contentFails[0].type, 'must_contain');
  ok('grades unsupported when must_contain misses');
}

{
  const row = gradeAc(fixtureAc, withFiles({
    'src/app.js': 'hello WAKE-SKU\n',
    'tests/app.test.js': files['tests/app.test.js'],
  }));
  assert.equal(row.grade, 'unsupported');
  assert.equal(row.contentFails[0].type, 'must_not_contain');
  ok('grades unsupported when must_not_contain hits');
}

{
  const noTests = { ...fixtureAc, tests: [], must_contain: [], must_not_contain: [] };
  const row = gradeAc(noTests, withFiles({ 'src/app.js': 'x' }));
  assert.equal(row.grade, 'partial');
  ok('grades partial when code exists but no test locator is authored');
}

{
  const acs = flattenAcceptanceCriteria({
    capabilities: [{
      key: 'OFFER',
      stories: [{
        key: 'OFFER-001',
        acceptance_criteria: [fixtureAc],
      }],
    }],
  });
  const blast = blastRadius(acs, ['src/app.js', 'README.md']);
  assert.equal(blast.affected.length, 1);
  assert.equal(blast.affected[0].key, 'DEMO-001-AC1');
  assert.deepEqual(blast.unclaimed, ['README.md']);
  ok('blast radius maps changed files to ACs and leaves unclaimed paths');
}

{
  const ctx = contextForPath([fixtureAc], 'src/app.js');
  assert.equal(ctx.status, 'has_criteria');
  assert.equal(ctx.acceptance_criteria[0].key, 'DEMO-001-AC1');
  const empty = contextForPath([fixtureAc], 'docs/notes.md');
  assert.equal(empty.status, 'no_criteria');
  ok('path context reports has_criteria vs no_criteria');
}

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'intent-yaml-'));
  const yamlPath = path.join(tmp, 'contract.yaml');
  fs.writeFileSync(yamlPath, [
    'version: 1',
    'capabilities:',
    '  - key: T',
    '    stories:',
    '      - key: T-001',
    '        acceptance_criteria:',
    '          - key: T-001-AC1',
    '            criterion: Loaded from YAML.',
    '            implements:',
    '              - src/app.js',
    '',
  ].join('\n'));
  const contract = loadContract(yamlPath);
  const acs = flattenAcceptanceCriteria(contract);
  assert.equal(acs[0].key, 'T-001-AC1');
  assert.deepEqual(acs[0].implements, ['src/app.js']);
  fs.rmSync(tmp, { recursive: true, force: true });
  ok('loads Capability → Story → AC YAML via ruby');
}

{
  const live = loadContract(path.join(repoRoot, '.intent', 'contract.yaml'));
  const report = runCheck({ root: repoRoot, contract: live, changedFiles: [] });
  assert.equal(report.ok, true, `live contract failed: ${JSON.stringify(report.fail)}`);
  assert.ok(report.ac_count >= 6);
  assert.ok(report.grades.every((row) => row.grade === 'supported' || row.grade === 'partial'));
  assert.equal(report.affiliation, 'not affiliated');
  ok('live .intent/contract.yaml grades clean on this checkout');
}

{
  const live = loadContract(path.join(repoRoot, '.intent', 'contract.yaml'));
  const report = runCheck({
    root: repoRoot,
    contract: live,
    changedFiles: [
      'apps/hermes-control-plane/app/page.tsx',
      'docs/NO-DESKTOP-HIJACK.md',
    ],
  });
  const keys = report.blast.affected.map((row) => row.key);
  assert.ok(keys.includes('OFFER-001-AC1'));
  assert.ok(report.blast.unclaimed.includes('docs/NO-DESKTOP-HIJACK.md'));
  ok('--base analog flags offer ACs for page.tsx and leaves unmapped docs unclaimed');
}

{
  const chunks = [];
  const code = main(['--path', 'apps/hermes-control-plane/app/HostingSelector.tsx', '--json'], {
    stdout: { write: (s) => chunks.push(s) },
    stderr: { write: () => {} },
  });
  assert.equal(code, 0);
  const ctx = JSON.parse(chunks.join(''));
  assert.equal(ctx.status, 'has_criteria');
  assert.ok(ctx.acceptance_criteria.some((ac) => ac.key === 'HOST-001-AC1'));
  ok('CLI --path returns hosting AC context');
}

{
  const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'intent-check.js'), 'utf8');
  assert.match(source, /not affiliated/);
  assert.doesNotMatch(source, /npx -y tieline/);
  assert.doesNotMatch(source, /require\(['"]pg['"]\)/);
  ok('checker does not vendor Tieline CLI or Postgres');
}

{
  const chunks = [];
  const err = [];
  const code = main(['--ac', 'PROCESS-001-AC1', '--json'], {
    stdout: { write: (s) => chunks.push(s) },
    stderr: { write: (s) => err.push(s) },
  });
  assert.equal(code, 0, err.join(''));
  const report = JSON.parse(chunks.join(''));
  assert.equal(report.grades[0].key, 'PROCESS-001-AC1');
  assert.equal(report.grades[0].grade, 'supported');
  ok('CLI --ac PROCESS-001-AC1 is supported');
}

console.log(`\n${passed} intent-check tests passed`);
