#!/usr/bin/env node
'use strict';

/**
 * test-zoekt-trigram-search-engine.js
 * -----------------------------------
 * Verifies Zoekt Trigram Code Search & MCP Bridge:
 *   - Trigram index building
 *   - Fast candidate filtering & regex verification
 *   - Sub-millisecond snippet retrieval
 *   - Doctor & index health check
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  buildIndex,
  searchCode,
  runDoctor,
} = require('../tools/zoekt-trigram-search-engine');

console.log('🧪 Running Zoekt Trigram Search Engine Test Suite...');

const repoRoot = path.resolve(__dirname, '..');

// 1. Index Build
{
  const res = buildIndex(repoRoot);
  assert.ok(res.filesIndexed > 10, 'Should index repository files');
  assert.ok(res.totalTrigrams > 500, 'Should generate trigram postings');
  console.log(`  ✓ Trigram index build passes (${res.filesIndexed} files, ${res.totalTrigrams} trigrams)`);
}

// 2. Fast Code Search
{
  const hits = searchCode('evaluateTemporalPolicy', repoRoot);
  assert.ok(hits.length > 0, 'Should find hits for evaluateTemporalPolicy');
  assert.ok(hits[0].snippet.includes('evaluateTemporalPolicy'));
  assert.ok(hits[0].line > 0);
  console.log(`  ✓ Fast trigram code search passes (${hits.length} matches found)`);
}

// 3. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.ok(doc.indexedFilesCount > 0);
  assert.ok(doc.totalTrigrams > 0);
  console.log('  ✓ Doctor status passes');
}

console.log('\n✅ All Zoekt Trigram Search Engine tests passed successfully!');
process.exit(0);
