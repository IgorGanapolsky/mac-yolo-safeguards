#!/usr/bin/env node
'use strict';

/**
 * test-thumbgate-chrome-extension.js
 * ----------------------------------
 * Verifies ThumbGate Manifest V3 Chrome Extension:
 *   - Manifest V3 schema and permission boundary validation
 *   - Asset and script bundle integrity
 *   - ZIP package generation
 *   - Doctor check
 */

const assert = require('assert');
const fs = require('fs');
const {
  validateExtension,
  packageExtension,
  runDoctor,
} = require('../tools/thumbgate-extension-packager');

console.log('🧪 Running ThumbGate Chrome Extension Test Suite...');

// 1. Manifest V3 Validation
{
  const val = validateExtension();
  assert.strictEqual(val.valid, true, `Validation failed: ${val.errors.join(', ')}`);
  assert.strictEqual(val.manifest.manifest_version, 3);
  assert.ok(val.manifest.name.includes('ThumbGate'));
  assert.strictEqual(val.verifiedFiles.length, 6);
  console.log('  ✓ Manifest V3 schema & asset presence passes');
}

// 2. Packaging Build
{
  const res = packageExtension();
  assert.strictEqual(res.success, true);
  assert.ok(fs.existsSync(res.outputPath));
  assert.ok(res.sizeBytes > 1000, 'ZIP bundle should be >1KB');
  console.log(`  ✓ Extension packaging passes (${(res.sizeBytes / 1024).toFixed(1)} KB ZIP generated)`);
}

// 3. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.strictEqual(doc.manifestVersion, 3);
  console.log('  ✓ Doctor check passes');
}

console.log('\n✅ All ThumbGate Chrome Extension tests passed successfully!');
process.exit(0);
