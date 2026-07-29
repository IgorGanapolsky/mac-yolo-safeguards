const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { findUnresolvedReferences, jobWorkingDirectory } = require('./lib/workflow-file-references');

const root = path.resolve(__dirname, '..');
const workflowDir = path.join(root, '.github/workflows');

test('every workflow file reference resolves from its job working directory', () => {
  const problems = findUnresolvedReferences(workflowDir, root);
  const rendered = problems
    .map((p) => `${p.workflow}:${p.job} reads '${p.ref}' from '${p.workingDirectory}' -> ${p.resolved} (missing)`)
    .join('\n  ');
  assert.equal(problems.length, 0, problems.length ? `unresolved workflow file references:\n  ${rendered}` : '');
});

test('catches the real store-release regression it was written for', () => {
  // The failure this exists to prevent: the iOS job runs with
  // working-directory: hermes-mobile and loaded './hermes-mobile/app.json'.
  // A text-matching test asserted that exact broken string and stayed green
  // while every iOS submit failed. Rebuild that situation and require a catch.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wfrefs-'));
  try {
    fs.mkdirSync(path.join(tmp, '.github/workflows'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'hermes-mobile'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'hermes-mobile/app.json'), '{"expo":{"version":"1.4"}}');
    fs.writeFileSync(
      path.join(tmp, '.github/workflows/store-release.yml'),
      [
        'name: Store Release',
        'on: workflow_dispatch',
        'jobs:',
        '  ios-production:',
        '    runs-on: ubuntu-latest',
        '    defaults:',
        '      run:',
        '        working-directory: hermes-mobile',
        '    steps:',
        '      - name: Read version',
        '        run: |',
        '          APP_VERSION="$(node -p "require(\'./hermes-mobile/app.json\').expo.version")"',
        '',
      ].join('\n'),
    );

    const problems = findUnresolvedReferences(path.join(tmp, '.github/workflows'), tmp);
    assert.equal(problems.length, 1, 'expected exactly the nested-path bug');
    assert.equal(problems[0].job, 'ios-production');
    assert.equal(problems[0].ref, './hermes-mobile/app.json');
    assert.equal(problems[0].workingDirectory, 'hermes-mobile');
    assert.match(problems[0].resolved, /hermes-mobile\/hermes-mobile\/app\.json/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('accepts the corrected form', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wfrefs-ok-'));
  try {
    fs.mkdirSync(path.join(tmp, '.github/workflows'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'hermes-mobile'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'hermes-mobile/app.json'), '{}');
    fs.writeFileSync(
      path.join(tmp, '.github/workflows/ok.yml'),
      [
        'name: OK',
        'on: workflow_dispatch',
        'jobs:',
        '  ios-production:',
        '    runs-on: ubuntu-latest',
        '    defaults:',
        '      run:',
        '        working-directory: hermes-mobile',
        '    steps:',
        '      - run: |',
        '          APP_VERSION="$(node -p "require(\'./app.json\').expo.version")"',
        '',
      ].join('\n'),
    );
    assert.deepEqual(findUnresolvedReferences(path.join(tmp, '.github/workflows'), tmp), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('reads the working directory a job actually declares', () => {
  const block = [
    '  ios-production:',
    '    runs-on: ubuntu-latest',
    '    defaults:',
    '      run:',
    '        working-directory: hermes-mobile',
  ].join('\n');
  assert.equal(jobWorkingDirectory(block), 'hermes-mobile');
  assert.equal(jobWorkingDirectory('  gate:\n    runs-on: ubuntu-latest'), '.');
});
