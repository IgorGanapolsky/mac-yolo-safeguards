'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  generateBlog,
  validateBlogContent,
  stageBlog,
  CANONICAL_URL,
  DOCS_URL,
} = require('../tools/thumbgate-blog-engine.js');

test('generateBlog produces non-empty markdown with required architecture sections', () => {
  const content = generateBlog();
  assert.ok(typeof content === 'string');
  assert.ok(content.length > 500);
  assert.match(content, /# How We Built Cloud Continuity for Local AI Agents/);
  assert.match(content, /The Laptop Lid Problem/);
  assert.match(content, /Signed Machine Pairing/);
  assert.match(content, /Fenced Continuity VPS/);
  assert.match(content, /Remote Web Leash/);
  assert.match(content, /mermaid/);
  assert.match(content, /https:\/\/thumbgate\.app/);
});

test('validateBlogContent accepts compliant content', () => {
  const content = generateBlog();
  const res = validateBlogContent(content);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
});

test('validateBlogContent rejects content missing required architecture patterns', () => {
  const res = validateBlogContent('# Just a title\nSome random text');
  assert.equal(res.valid, false);
  assert.ok(res.errors.length > 0);
});

test('validateBlogContent rejects forbidden claims (e.g. seamless failover, drive my Chrome)', () => {
  const contentWithForbidden = generateBlog() + '\nWe provide seamless failover and drive my Chrome directly.';
  const res = validateBlogContent(contentWithForbidden);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some(e => e.includes('seamless failover')));
  assert.ok(res.errors.some(e => e.includes('drive my Chrome')));
});

test('stageBlog writes valid file to disk', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbgate-blog-test-'));
  try {
    const dest = path.join(tmpDir, 'blog.md');
    const res = stageBlog(dest);
    assert.equal(res.fullPath, dest);
    assert.ok(res.bytes > 0);
    assert.ok(fs.existsSync(dest));
    const readBack = fs.readFileSync(dest, 'utf8');
    assert.match(readBack, /How We Built Cloud Continuity for Local AI Agents/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
