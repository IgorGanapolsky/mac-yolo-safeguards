'use strict';

const assert = require('assert');
const {
  MongoDbAtlasVectorVault,
  MongoDbChangeStreamNotifier,
} = require('../tools/mongodb-high-roi-steals');

console.log('=== Testing MongoDB High-ROI Architectural Steals Engine ===');

const vault = new MongoDbAtlasVectorVault();
vault.storeReceipt('hermes-yolo', 'chmod_perm_fix', { target: 'seed-yolo-wrapper.js', mode: 755 }, [0.1, 0.4, 0.8]);
vault.storeReceipt('jcode-yolo', 'provider_failover', { activeProvider: 'openai', model: 'gpt-4.5' }, [0.2, 0.5, 0.9]);

const searchResults = vault.hybridSearch('chmod_perm_fix');
assert.strictEqual(searchResults.length, 2);
assert.strictEqual(searchResults[0].doc.agentId, 'hermes-yolo');
assert(searchResults[0].score > 0.8);

const notifier = new MongoDbChangeStreamNotifier();
let changeReceived = false;

notifier.on('change', (evt) => {
  assert.strictEqual(evt.agentId, 'seed-yolo');
  assert.strictEqual(evt.state, 'EXECUTION_SUCCESS');
  changeReceived = true;
});

notifier.emitStateChange('seed-yolo', 'EXECUTION_SUCCESS', { latencyMs: 42 });
assert.strictEqual(changeReceived, true);

console.log('✅ MongoDB High-ROI Architectural Steals Unit Tests PASSED!');
