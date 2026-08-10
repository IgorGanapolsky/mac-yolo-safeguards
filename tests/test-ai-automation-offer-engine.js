'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { AIAutomationOfferEngine } = require('../tools/ai-automation-offer-engine');

console.log('=== Testing AI Automation Offer Engine ===');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offer-test-'));
try {
  const engine = new AIAutomationOfferEngine({ offersDir: tmpDir });
  const res = engine.generateMvpSpec('Lead Response Copilot', {
    userInput: 'Inbound lead form payload',
    transformation: 'Enrich lead context & generate proposal draft',
    output: 'Reviewable email response & CRM task draft',
  });

  assert.strictEqual(res.spec.title, 'AI Automation Offer — Lead Response Copilot');
  assert.strictEqual(res.spec.nonNegotiables.length, 5);
  assert.strictEqual(fs.existsSync(res.filePath), true);

  console.log('✅ AI Automation Offer Engine Tests PASSED!');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
