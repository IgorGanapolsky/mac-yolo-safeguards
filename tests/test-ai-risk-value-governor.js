#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AIRiskValueGovernor, passesLuhn } = require('../tools/ai-risk-value-governor');
const {
  inspectOmpHerdrHydrogenSetup,
  normalizeV1BetaThinkingLevel,
  HYDROGEN_MODELS,
} = require('../tools/gemini-4-hydrogen-bridge');
const { MODEL_REGISTRY } = require('../tools/agent-harness-router');
const { SPLIT_MODEL_MATRIX, CROSS_PROVIDER_PARITY_CHAINS } = require('../tools/split-moa-hypergraph-engine');

test('Source tokenization redacts GitHub PATs, Stripe/Google/AWS keys, SSNs, Luhn PANs, and nested objects without corrupting structure', () => {
  const gov = new AIRiskValueGovernor({ salt: 'unit-test-salt-64bit' });
  const fakeGhPat = ['gh', 'p_0123456789abcdef0123456789abcdef012345'].join('');
  const fakeStripe = ['sk', 'live', '51RNcJ1GGBpd520QYabcdefghijklmnop'].join('_');
  const fakeGoogleKey = ['AIza', 'SyA1234567890abcdefGHIJKLMNOPQRSTUV'].join('');
  const fakeAws = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');

  const payload = {
    nested: [
      `token=${fakeGhPat} stripe=${fakeStripe} gkey=${fakeGoogleKey} aws=${fakeAws}`,
      'ssn=123-45-6789 card=4532-0151-1283-0366',
      'non_pan_20_digits=4532-0151-1283-0366-9999 order_id=1234-5678-9012-3456',
      'owner=igor@example.com',
    ],
  };

  const res = gov.tokenizeSource(payload, { detailed: true });
  assert.equal(res.redactionCount, 7);
  assert.equal(res.highRiskCount, 6);
  assert.ok(Array.isArray(res.sanitized.nested), 'Nested array structure must remain intact in detailed mode');
  const joined = res.sanitized.nested.join(' ');
  assert.ok(!joined.includes(fakeGhPat));
  assert.ok(!joined.includes(fakeStripe));
  assert.ok(!joined.includes(fakeGoogleKey));
  assert.ok(!joined.includes(fakeAws));
  assert.ok(!joined.includes('123-45-6789'));
  assert.ok(joined.includes('non_pan_20_digits=4532-0151-1283-0366-9999'), '20-digit hyphenated IDs must not be partially PAN-redacted');
  assert.ok(joined.includes('order_id=1234-5678-9012-3456'));

  // Deterministic 16-hex surrogate enables joins across calls without raw PII exposure
  const second = gov.tokenizeSource('contact igor@example.com');
  const emailTok = res.detections.find((d) => d.kind === 'EMAIL').token;
  assert.match(emailTok, /^\[TOK_EMAIL_[0-9a-f]{16}\]$/);
  assert.equal(second, `contact ${emailTok}`);
});

test('Value-to-risk gate blocks raw secrets, Infinity bypasses, irreversible low-value tasks, and velocity storms while allowing sanitized emails', () => {
  const gov = new AIRiskValueGovernor({ maxActionsPerMinute: 4, minValueToRiskRatio: 1.5, windowMs: 60000 });
  const t0 = 1_700_000_000_000;
  const rawStripe = ['sk', 'live', '51RNcJ1GGBpd520QYabcdefghijklmnop'].join('_');

  // 1) Raw secret in payload -> INTERDICT_RAW_SECRET even with high businessValueScore
  const secretLeak = gov.evaluateRiskValueBalance(
    { agentId: 'worker-a', businessValueScore: 10, blastRadiusRiskScore: 1, payload: `Authorization: Bearer ${rawStripe}` },
    t0,
  );
  assert.equal(secretLeak.allowed, false);
  assert.equal(secretLeak.governanceAction, 'INTERDICT_RAW_SECRET');

  // 2) Benign email in payload does NOT trigger raw-secret interdiction
  const cleanWithEmail = gov.evaluateRiskValueBalance(
    { agentId: 'worker-a', businessValueScore: 6, blastRadiusRiskScore: 2, payload: 'send receipt to customer@example.com' },
    t0 + 50,
  );
  assert.equal(cleanWithEmail.allowed, true);
  assert.equal(cleanWithEmail.governanceAction, 'ALLOW');

  // 3) Infinity businessValueScore fails closed (treated as 0, not infinite pass)
  const infBypass = gov.evaluateRiskValueBalance(
    { agentId: 'worker-a', businessValueScore: Infinity, blastRadiusRiskScore: 2, payload: 'noop' },
    t0 + 100,
  );
  assert.equal(infBypass.allowed, false);

  // 4) Irreversible low-value mutation -> REQUIRE_OWNER_APPROVAL
  const risky = gov.evaluateRiskValueBalance(
    { agentId: 'worker-a', businessValueScore: 2, blastRadiusRiskScore: 3, irreversible: true, payload: 'drop table' },
    t0 + 150,
  );
  assert.equal(risky.allowed, false);
  assert.equal(risky.governanceAction, 'REQUIRE_OWNER_APPROVAL');

  // 5) 5th action within window trips velocity circuit breaker
  const tripped = gov.evaluateRiskValueBalance(
    { agentId: 'worker-a', businessValueScore: 9, blastRadiusRiskScore: 1, payload: 'ping' },
    t0 + 200,
  );
  assert.equal(tripped.allowed, false);
  assert.equal(tripped.governanceAction, 'CIRCUIT_BREAK_VELOCITY');
});

test('Gemini 4 Hydrogen & Carbon are wired across MODEL_REGISTRY, SPLIT_MODEL_MATRIX, CROSS_PROVIDER_PARITY_CHAINS, and hermetic OMP/Herdr doctor', () => {
  assert.ok(MODEL_REGISTRY['google/gemini-4-hydrogen']);
  assert.ok(SPLIT_MODEL_MATRIX['google/gemini-4-hydrogen']);
  assert.ok(SPLIT_MODEL_MATRIX['google/gemini-4-carbon']);
  assert.deepEqual(CROSS_PROVIDER_PARITY_CHAINS['google/gemini-4-hydrogen'], [
    'anthropic/claude-sonnet-4.6',
    'zai-org/glm-5.3-coder',
  ]);
  assert.equal(normalizeV1BetaThinkingLevel('xhigh'), 'HIGH');
  assert.equal(HYDROGEN_MODELS.high, 'google-antigravity/gemini-4-hydrogen-high');

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'h2-doctor-'));
  try {
    fs.mkdirSync(path.join(tmpHome, '.omp', 'agent', 'extensions'), { recursive: true });
    fs.mkdirSync(path.join(tmpHome, '.hermes', 'gurobi'), { recursive: true });
    fs.mkdirSync(path.join(tmpHome, '.local', 'bin'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, '.omp', 'agent', 'config.yml'),
      [
        'modelRoles:',
        '  task: google-antigravity/gemini-4-hydrogen-high',
        '  smol: google-antigravity/gemini-4-hydrogen-low',
        'retry:',
        '  fallbackChains:',
        '    google-antigravity/gemini-4-hydrogen-xhigh:',
        '      - google-antigravity/gemini-4-hydrogen-high',
        '    google-antigravity/gemini-4-hydrogen-medium:',
        '      - google-antigravity/gemini-4-hydrogen-high',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(tmpHome, '.omp', 'agent', 'extensions', 'herdr-fork-in.ts'),
      'pi.registerCommand("review-pane", {}); // google-antigravity/gemini-4-hydrogen-high\npi.registerCommand("hydrogen", {});\n',
    );
    fs.writeFileSync(
      path.join(tmpHome, '.hermes', 'gurobi', 'gurobi-mcp-server.py'),
      'SCHEMA = {"type": "array", "items": {"type": "object"}}\n',
    );
    fs.writeFileSync(
      path.join(tmpHome, '.local', 'bin', 'hermes-model-bridge.py'),
      'ASSIST_LADDER = ["gemini-4-hydrogen-high"]\n',
    );

    const hermetic = inspectOmpHerdrHydrogenSetup({ homeDir: tmpHome });
    assert.equal(hermetic.ok, true, JSON.stringify(hermetic.checks));

    // Verify broken array schema is caught
    fs.writeFileSync(
      path.join(tmpHome, '.hermes', 'gurobi', 'gurobi-mcp-server.py'),
      'SCHEMA = {"type": "array", "description": "missing items"}\n',
    );
    assert.equal(inspectOmpHerdrHydrogenSetup({ homeDir: tmpHome }).ok, false);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('Luhn check distinguishes valid payment cards from arbitrary numbers', () => {
  assert.equal(passesLuhn('4532015112830366'), true);
  assert.equal(passesLuhn('1234567890123456'), false);
  assert.equal(passesLuhn('0000000000000000'), false);
});
