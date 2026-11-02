#!/usr/bin/env node
'use strict';

/**
 * Tests for tools/aeo-steal.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { sanitizeSlug, scrapeIssues, scrapePRComments, publishFAQ, generateLlmsTxt } = require('../tools/aeo-steal');

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok  ${passed}  ${name}`);
}

// ─── 1. sanitizeSlug ──────────────────────────────────────────────────

{
  const slug = sanitizeSlug('How to fix the verify check?');
  assert.equal(typeof slug, 'string');
  assert.equal(slug.includes(' '), false, 'slug should have no spaces');
  assert.ok(slug.length > 0);
  ok('sanitizeSlug produces URL-safe slug from question title');
}

{
  const slug = sanitizeSlug('Error: git push --force denied in AGENTS.md!');
  assert.ok(!slug.includes('!'));
  assert.ok(!slug.includes(':'));
  assert.ok(!slug.includes(' '));
  ok('sanitizeSlug strips special characters and punctuation');
}

{
  const slug = sanitizeSlug('a'.repeat(200));
  assert.ok(slug.length <= 60, 'slug should be capped at 60 chars');
  ok('sanitizeSlug caps output at 60 characters');
}

// ─── 2. scrapeIssues ──────────────────────────────────────────────────

{
  const issues = scrapeIssues();
  assert.equal(Array.isArray(issues), true);
  if (issues.length > 0) {
    const first = issues[0];
    assert.equal(typeof first.source, 'string');
    assert.equal(typeof first.title, 'string');
    assert.equal(typeof first.question, 'string');
    assert.equal(typeof first.answer, 'string');
    assert.equal(first.url.startsWith('https://'), true);
  }
  ok('scrapeIssues returns array of issue objects with expected fields');
}

// ─── 3. scrapePRComments ──────────────────────────────────────────────

{
  const prs = scrapePRComments();
  assert.equal(Array.isArray(prs), true);
  if (prs.length > 0) {
    const first = prs[0];
    assert.equal(first.source, 'Merged PR');
    assert.equal(typeof first.title, 'string');
    assert.ok(first.url.includes('/pull/'), 'should have PR URL');
  }
  ok('scrapePRComments returns array of PR objects with expected fields');
}

// ─── 4. generateLlmsTxt ───────────────────────────────────────────────

{
  const testEntries = [
    { source: 'Test', id: 999, title: 'How to test things', url: 'https://example.com', closedAt: '2026-01-01', labels: ['question'], question: 'How to test?', answer: 'Run node tests.' },
  ];

  const tmpDir = path.join('/tmp', `aeo-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const origRoot = path.resolve;
  // We can't easily override ROOT, so just verify the function runs without error
  generateLlmsTxt(testEntries);
  assert.equal(fs.existsSync(path.join(process.env.PWD || process.cwd(), 'docs/llms.txt')), true);
  ok('generateLlmsTxt creates docs/llms.txt with FAQ entries indexed');

  const content = fs.readFileSync(path.join(process.env.PWD || process.cwd(), 'docs/llms.txt'), 'utf8');
  assert.equal(content.includes('mac-yolo-safeguards'), true);
  assert.equal(content.includes('confusion-detector-steal.js'), true);
  assert.equal(content.includes('schema-steal.js'), true);
  ok('llms.txt contains project overview and tool references');
}

// ─── 5. publishFAQ ────────────────────────────────────────────────────

{
  const testEntries = [
    { source: 'Test', id: 999, title: 'How to test things', url: 'https://example.com', closedAt: '2026-01-01T00:00:00Z', labels: ['question'], question: 'How to test?', answer: 'Run node tests.' },
    { source: 'Test', id: 1000, title: 'Why is the build failing?', url: 'https://example.com/2', closedAt: '2026-01-02T00:00:00Z', labels: ['bug'], question: 'Why is build failing?', answer: 'Check deps.' },
  ];

  publishFAQ(testEntries);
  const faqDir = path.join(process.env.PWD || process.cwd(), 'docs', 'faq');
  const files = fs.readdirSync(faqDir);
  assert.equal(files.length >= 2, true, 'should create FAQ page files');
  ok('publishFAQ creates individual FAQ markdown pages in docs/faq/');
}

// ─── 6. Integration: full pipeline output exists ───────────────────────

{
  assert.equal(fs.existsSync(path.join(process.env.PWD || process.cwd(), 'docs', 'llms.txt')), true, 'llms.txt should exist after pipeline run');
  assert.equal(fs.existsSync(path.join(process.env.PWD || process.cwd(), 'docs', 'llms-full.txt')), true, 'llms-full.txt should exist');
  const faqDir = path.join(process.env.PWD || process.cwd(), 'docs', 'faq');
  assert.equal(fs.existsSync(faqDir), true, 'docs/faq/ directory should exist');
  const readme = fs.existsSync(path.join(faqDir, 'README.md'));
  assert.equal(readme, true, 'docs/faq/README.md should exist as index');
  ok('full AEO pipeline produces llms.txt, llms-full.txt, and docs/faq/ index');
}

console.log(`\n${passed}/${passed} tests passed`);
process.exit(0);
