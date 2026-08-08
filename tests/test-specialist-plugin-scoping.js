'use strict';

/**
 * Unit Tests for Specialist Plugin Scoping Engine (`tools/specialist-plugin-scoping-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditSpecialistPluginScoping, SPECIALIST_ROLES } = require('../tools/specialist-plugin-scoping-engine');

console.log('Running test-specialist-plugin-scoping.js...');

// Test 1: Reviewer role access
const reviewerFilesystem = auditSpecialistPluginScoping('Reviewer', 'Filesystem');
assert.strictEqual(reviewerFilesystem.allowed, true, 'Reviewer should access Filesystem');

const reviewerDocker = auditSpecialistPluginScoping('Reviewer', 'Docker');
assert.strictEqual(reviewerDocker.allowed, false, 'Reviewer should be denied Docker');

// Test 2: Planner role access
const plannerObsidian = auditSpecialistPluginScoping('Planner', 'Obsidian');
assert.strictEqual(plannerObsidian.allowed, true, 'Planner should access Obsidian');

const plannerDocker = auditSpecialistPluginScoping('Planner', 'Docker');
assert.strictEqual(plannerDocker.allowed, false, 'Planner should be denied Docker');

// Test 3: Builder role access
const builderDocker = auditSpecialistPluginScoping('Builder', 'Docker');
assert.strictEqual(builderDocker.allowed, true, 'Builder should access Docker');

console.log('ok tests/test-specialist-plugin-scoping.js');
