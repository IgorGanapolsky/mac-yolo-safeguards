'use strict';

const assert = require('assert');
const {
  ModelInternalVadInterrupter,
  ByteDanceSeedRealtimeEngine,
} = require('../tools/bytedance-seedrealtime-harness');

console.log('=== Testing ByteDance SeedRealtime Full-Duplex Multimodal Harness ===');

const lowAudio = [0.1, 0.2, 0.1, 0.05];
const lowCheck = ModelInternalVadInterrupter.evaluateInterruptionSignal(lowAudio, true);
assert.strictEqual(lowCheck.interruptTriggered, false);

const highAudio = [0.9, 0.8, 0.95, 0.7];
const highCheck = ModelInternalVadInterrupter.evaluateInterruptionSignal(highAudio, true);
assert.strictEqual(highCheck.interruptTriggered, true);
assert.strictEqual(highCheck.action, 'HALT_EXPRESSION_IMMEDIATELY');
console.log('  ✓ In-Model VAD Interrupter correctly halted expression on high-energy audio overlap.');

const engine = new ByteDanceSeedRealtimeEngine();
let frameCount = 0;
engine.on('frame_processed', (data) => {
  assert.strictEqual(data.fullDuplexZeroCascade, true);
  frameCount++;
});

const res = engine.processFullDuplexStream([0.1, 0.1], { width: 1920, height: 1080 }, 'Describe live screen');
assert.strictEqual(res.status, 'STREAMING_DUPLEX');
assert.strictEqual(res.perceivedVideoFrame, true);
assert.strictEqual(frameCount, 1);
console.log('  ✓ Full-Duplex Multimodal Engine processed audio-visual frame without cascade latency.');

console.log('✅ ByteDance SeedRealtime Full-Duplex Multimodal Harness Unit Tests PASSED!');
