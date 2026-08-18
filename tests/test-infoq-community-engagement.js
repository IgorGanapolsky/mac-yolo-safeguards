#!/usr/bin/env node
'use strict';

/**
 * test-infoq-community-engagement.js
 * ----------------------------------
 * Verifies the InfoQ autonomous community engagement and monetization engine:
 *   - Catalog parsing & active topic tracking
 *   - Value-first technical comment drafting (anti-slop, grounded insights)
 *   - Organic ThumbGate monetization & attribution UTM link injection
 *   - Safe staging into coordination/ready-to-post
 */

const assert = require('assert');
const fs = require('fs');
const {
  INFOQ_ARTICLES_CATALOG,
  draftComment,
  stageCommentDrafts,
  runDoctor,
} = require('../tools/infoq-community-engagement');

console.log('🧪 Running InfoQ Community Engagement Test Suite...');

// 1. Catalog Integrity
{
  assert.ok(INFOQ_ARTICLES_CATALOG.length >= 4, 'Should track at least 4 key InfoQ articles');
  for (const article of INFOQ_ARTICLES_CATALOG) {
    assert.ok(article.id.length > 0);
    assert.ok(article.title.length > 0);
    assert.ok(article.url.startsWith('https://'));
    assert.ok(article.ctaLink.length > 0);
  }
  console.log('  ✓ Catalog integrity and active article tracking passes');
}

// 2. Value-First Comment Drafting
{
  const sample = INFOQ_ARTICLES_CATALOG[0];
  const draft = draftComment(sample);
  assert.ok(draft.includes(sample.title), 'Draft must reference exact article title');
  assert.ok(draft.includes('precision context curation'), 'Draft must contain substantive engineering insights');
  assert.ok(draft.includes(sample.ctaLink), 'Draft must include organic attribution CTA link');
  assert.ok(!draft.includes('As an AI language model'), 'Draft must not contain conversational AI slop');
  console.log('  ✓ Value-first comment drafting passes');
}

// 3. Staging Drafts
{
  const staged = stageCommentDrafts();
  assert.strictEqual(staged.length, INFOQ_ARTICLES_CATALOG.length, 'All articles should be staged');
  for (const s of staged) {
    assert.ok(fs.existsSync(s.filePath), `Staged file should exist: ${s.filePath}`);
    const content = fs.readFileSync(s.filePath, 'utf8');
    assert.ok(content.length > 100);
  }
  console.log('  ✓ Staging drafts into coordination/ready-to-post passes');
}

// 4. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.ok(doc.activeArticlesTracked >= 4);
  console.log('  ✓ Doctor status passes');
}

console.log('\n✅ All InfoQ Community Engagement tests passed successfully!');
process.exit(0);
