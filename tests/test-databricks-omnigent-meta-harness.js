'use strict';

/**
 * Unit Tests for Databricks Omnigent Agent Meta-Harness (`tools/databricks-omnigent-meta-harness.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditDatabricksOmnigentMetaHarness, OMNIGENT_META_HARNESS_CAPABILITIES } = require('../tools/databricks-omnigent-meta-harness');

console.log('Running test-databricks-omnigent-meta-harness.js...');

const audit = auditDatabricksOmnigentMetaHarness();
assert.strictEqual(audit.status, 'DATABRICKS_OMNIGENT_HARNESS_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (DATABRICKS_OMNIGENT_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(OMNIGENT_META_HARNESS_CAPABILITIES.length, 4, 'Expected 4 capabilities');

console.log('ok tests/test-databricks-omnigent-meta-harness.js');
