#!/usr/bin/env node
/**
 * Test suite for jcode high-ROI harness tools
 */

const { measureRamFootprint, optimizeSubagentMemory } = require('../tools/jcode-ram-efficiency-harness');
const { checkFileConflict } = require('../tools/jcode-swarm-conflict-detector');
const { validateAndSelfDev } = require('../tools/jcode-self-dev-engine');

function testJcodeSuite() {
  console.log('=== Testing jcode High-ROI Harness Suite ===');

  // Test RAM efficiency
  const ram = measureRamFootprint();
  if (typeof ram.heapUsedMb !== 'number') throw new Error('Invalid RAM measurement');
  console.log('✅ RAM Footprint measurement passed.');

  const opt = optimizeSubagentMemory({ context: 'hello world' });
  if (!opt.success) throw new Error('RAM optimization failed');
  console.log('✅ Subagent RAM optimization passed.');

  // Test Swarm Conflict
  const conflict = checkFileConflict('package.json');
  if (typeof conflict.hasConflict !== 'boolean') throw new Error('Conflict check failed');
  console.log('✅ Swarm conflict detection passed.');

  // Test Self-Dev Engine
  const selfDev = validateAndSelfDev('tools/jcode-ram-efficiency-harness.js');
  if (!selfDev.success) throw new Error('Self-Dev engine failed');
  console.log('✅ Self-Dev hot-reload engine passed.');

  console.log('🎉 All jcode High-ROI Harness Tests PASSED!');
}

if (require.main === module) {
  testJcodeSuite();
}
