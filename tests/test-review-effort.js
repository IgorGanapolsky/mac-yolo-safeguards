#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tool = path.join(root, 'tools/review-effort.js');
const {
  chooseEffort,
  commentBody,
  decideReviewRequest,
  effortFromComment,
  highestRequested,
} = require(tool);

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
}

check('empty file list is balanced', () => {
  assert.deepEqual(chooseEffort([]), {
    effort: 'balanced',
    reasons: ['no changed files listed'],
  });
  assert.deepEqual(chooseEffort(null), {
    effort: 'balanced',
    reasons: ['no changed files listed'],
  });
  assert.equal(chooseEffort(['', '   ']).effort, 'balanced');
});

check('documentation paths are lite', () => {
  const result = chooseEffort([
    'README.md',
    'plan.md',
    'SKILLS.md',
    'docs/guide.md',
    './notes/overview.md',
    'nested/README.md',
  ]);
  assert.equal(result.effort, 'lite');
  assert.deepEqual(result.reasons, ['documentation-only diff']);
});

check('markdown under tools or workflows is not lite', () => {
  assert.equal(chooseEffort(['tools/README.md']).effort, 'balanced');
  assert.equal(chooseEffort(['.github/PULL_REQUEST_TEMPLATE.md']).effort, 'balanced');
  assert.equal(chooseEffort(['tools/revenue.js']).effort, 'balanced');
  assert.equal(chooseEffort(['hermes-mobile/src/App.tsx']).effort, 'balanced');
  assert.equal(chooseEffort(['hermes-mobile/src/package.json']).effort, 'balanced');
  assert.equal(chooseEffort(['nottools/lib/x.js']).effort, 'balanced');
  assert.equal(chooseEffort(['nottools/revenue-loop.js']).effort, 'balanced');
});

check('security-sensitive paths are max and outrank docs', () => {
  const cases = [
    ['.github/workflows/ci.yml', 'workflow'],
    ['tools/lib/safe-url-host.js', 'tools-lib'],
    ['tools\\lib\\path-normalizer.js', 'tools-lib'],
    ['src/auth/login.js', 'auth-or-payment'],
    ['src/tokenizer.js', 'auth-or-payment'],
    ['tools/revenue-autonomous-loop.js', 'revenue-tool'],
    ['scripts/security-audit.mjs', 'security-audit'],
    ['tests/test-path-normalizer.js', 'path-normalizer'],
    ['hermes-mobile/package.json', 'mobile-package-pin'],
    ['hermes-mobile/package-lock.json', 'mobile-package-pin'],
    ['docs/stripe-notes.md', 'auth-or-payment'],
  ];
  for (const [file, rule] of cases) {
    const result = chooseEffort([file]);
    assert.equal(result.effort, 'max', file);
    assert.equal(result.reasons.some((reason) => reason.includes(rule)), true, file);
  }
});

check('one sensitive path lifts a docs diff to max', () => {
  const result = chooseEffort(['README.md', '.github/workflows/copilot-pr-review.yml']);
  assert.equal(result.effort, 'max');
  assert.equal(result.reasons[0].includes('workflow'), true);
});

check('reasons cap at 8', () => {
  const files = Array.from({ length: 9 }, (_, i) => `.github/workflows/job-${i}.yml`);
  const result = chooseEffort(files);
  assert.equal(result.effort, 'max');
  assert.equal(result.reasons.length, 8);
});

check('a tools/lib path can record more than one rule', () => {
  const result = chooseEffort(['tools/lib/path-normalizer.js']);
  assert.equal(result.effort, 'max');
  assert.equal(result.reasons.some((reason) => reason.includes('tools-lib')), true);
  assert.equal(result.reasons.some((reason) => reason.includes('path-normalizer')), true);
});

check('unmarked @copilot review counts as balanced', () => {
  assert.equal(effortFromComment('please @Copilot Review this'), 'balanced');
  assert.equal(effortFromComment('<!-- review-effort:lite -->\n@copilot review'), 'lite');
  assert.equal(effortFromComment('<!-- review-effort:MAX -->\nlater'), 'max');
  assert.equal(effortFromComment('no request here'), null);
  assert.equal(highestRequested([
    '<!-- review-effort:lite -->',
    '@copilot review',
    '<!-- review-effort:max -->',
  ]), 'max');
});

check('re-comment only when the new depth is higher', () => {
  const lite = { effort: 'lite', reasons: ['documentation-only diff'] };
  const balanced = { effort: 'balanced', reasons: ['default balanced review'] };
  const max = { effort: 'max', reasons: ['a.yml: workflow'] };
  assert.equal(decideReviewRequest(lite, []).request, true);
  assert.equal(decideReviewRequest(balanced, ['@copilot review']).request, false);
  assert.equal(decideReviewRequest(max, ['@copilot review']).request, true);
  assert.equal(decideReviewRequest(max, ['<!-- review-effort:max -->\n@copilot review']).request, false);
  assert.equal(decideReviewRequest(lite, ['<!-- review-effort:max -->']).request, false);
  assert.equal(decideReviewRequest(balanced, ['<!-- review-effort:lite -->\n@copilot review']).request, true);
  const fallback = decideReviewRequest({ effort: 'extreme' }, []);
  assert.equal(fallback.effort, 'balanced');
  assert.equal(fallback.request, true);
});

check('comment states the depth and the missing API field', () => {
  const body = commentBody({
    effort: 'max',
    reasons: ['tools/lib/safe-url-host.js: tools-lib', 'line\nbreak'],
  });
  assert.match(body, /^<!-- review-effort:max -->\n@copilot review\n/);
  assert.match(body, /Max is for security-sensitive diffs/);
  assert.match(body, /The review-request API has no effort field, so this comment is the request\./);
  assert.equal(body.includes('line break'), true);
  assert.equal(body.includes('line\nbreak'), false);
});

check('cli classifies a file list without writing a request', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-effort-'));
  const list = path.join(dir, 'files.txt');
  fs.writeFileSync(list, 'README.md\ndocs/guide.md\n');
  const run = spawnSync(process.execPath, [tool, '--files-from', list, '--files', 'plan.md'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {
    effort: 'lite',
    reasons: ['documentation-only diff'],
  });
  assert.equal(fs.existsSync(path.join(dir, 'request.txt')), false);
});

check('cli decide writes the comment only when escalating', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-effort-decide-'));
  const classification = path.join(dir, 'review-effort.json');
  const comments = path.join(dir, 'comments.jsonl');
  fs.writeFileSync(classification, JSON.stringify({
    effort: 'max',
    reasons: [' .github/workflows/ci.yml: workflow'],
  }));
  fs.writeFileSync(comments, `${JSON.stringify('@copilot review')}\n`);
  const run = spawnSync(process.execPath, [tool, '--decide', classification, comments], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).request, true);
  assert.equal(fs.readFileSync(path.join(dir, 'request.txt'), 'utf8'), 'yes\n');
  const body = fs.readFileSync(path.join(dir, 'comment.md'), 'utf8');
  assert.match(body, /^<!-- review-effort:max -->\n@copilot review\n/);
  assert.match(body, /review-request API has no effort field/);

  fs.writeFileSync(comments, `${JSON.stringify('<!-- review-effort:max -->\n@copilot review')}\n`);
  const again = spawnSync(process.execPath, [tool, '--decide', classification, comments], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(again.status, 0, again.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'request.txt'), 'utf8'), 'no\n');
});

check('workflow posts from the comment and does not run classifier code with the token', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/copilot-pr-review.yml'), 'utf8');
  assert.equal(workflow.includes('pull_request_target'), false);
  assert.equal(workflow.includes('persist-credentials: false'), true);
  assert.equal(workflow.includes('actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0'), true);
  assert.equal(workflow.includes('unset GH_TOKEN GITHUB_TOKEN'), true);
  assert.equal(workflow.includes('requested_reviewers'), false);
  assert.equal(workflow.includes('<!-- review-effort:lite -->'), false);
  assert.equal(workflow.includes('<!-- review-effort:balanced -->'), false);
  assert.equal(workflow.includes('<!-- review-effort:max -->'), false);
  assert.match(workflow, /review-effort:\(lite\|balanced\|max\)/);
  assert.match(workflow, /opened, reopened, synchronize, ready_for_review/);
  assert.match(workflow, /grep -q '403'/);
  const classify = workflow.indexOf('Classify review effort');
  const decide = workflow.indexOf('Decide whether to request review');
  const comment = workflow.indexOf('Comment @copilot review');
  assert.equal(classify < decide && decide < comment, true);
  const decideStep = workflow.slice(decide, comment);
  const unsetAt = decideStep.lastIndexOf('unset GH_TOKEN GITHUB_TOKEN');
  const nodeAt = decideStep.lastIndexOf('node tools/review-effort.js --decide');
  assert.equal(unsetAt !== -1 && unsetAt < nodeAt, true);
});

console.log(`review-effort: ${passed} checks passed`);
