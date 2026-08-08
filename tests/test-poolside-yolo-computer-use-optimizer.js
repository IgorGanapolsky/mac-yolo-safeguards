'use strict';

const assert = require('assert');
const { optimizeComputerUsePayload, auditPoolsideYoloSpeedPosture } = require('../tools/poolside-yolo-computer-use-optimizer');

console.log('=== Testing Poolside-YOLO Computer Use Acceleration Engine ===');

const posture = auditPoolsideYoloSpeedPosture();
assert.strictEqual(posture.status, 'ACTIVE_ACCELERATED', 'Status is ACTIVE_ACCELERATED');
assert.strictEqual(posture.grade, '10/10 (SUB_3S_COMPUTER_USE)', 'Grade matches sub-3s target');

const heavyImagePayload = '{"type":"image","data":"data:image/png;base64,' + 'A'.repeat(50000) + '"}';
const optimized = optimizeComputerUsePayload(heavyImagePayload);

assert.strictEqual(optimized.optimized, true, 'Payload was successfully optimized');
assert.strictEqual(optimized.strategy, 'DOM_AXTREE_ACCELERATION', 'Uses DOM AXTree acceleration');
assert.ok(optimized.tokensSaved > 5000, 'Saved thousands of tokens');

console.log('✅ Poolside-YOLO Computer Use Acceleration Test PASSED!');
