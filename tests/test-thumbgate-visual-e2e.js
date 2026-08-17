const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BANNED_PATTERNS,
  REQUIRED_PROD_ENDPOINTS,
  auditCopySanity,
  auditLiveEndpoints,
} = require('../tools/thumbgate-visual-e2e-auditor');

test('auditCopySanity detects banned legacy patterns and passes clean copy', () => {
  const dirty = `
    Some copy where closing the lid kills the agent and If a stranger has not paid we stop.
    Also has <option>Manage machines…</option> in the select.
  `;
  const report = auditCopySanity(dirty);
  assert.equal(report.clean, false);
  assert.equal(report.violations.length, 3);

  const clean = `
    ThumbGate 24/7 Fenced Cloud VPS Continuity.
    Deterministic 90-second renewable leases under LLM-as-a-Judge pre-action safety gates.
    All tool executions run within an isolated cloud VM sandbox.
  `;
  const cleanReport = auditCopySanity(clean);
  assert.equal(cleanReport.clean, true);
  assert.equal(cleanReport.violations.length, 0);
});

test('REQUIRED_PROD_ENDPOINTS defines mandatory production routes', () => {
  assert.ok(REQUIRED_PROD_ENDPOINTS.length >= 6);
  const paths = REQUIRED_PROD_ENDPOINTS.map((e) => e.path);
  assert.ok(paths.includes('/api/health'));
  assert.ok(paths.includes('/api/billing/plan'));
  assert.ok(paths.includes('/api/expertise/stats'));
  assert.ok(paths.includes('/llms.txt'));
  assert.ok(paths.includes('/go/android'));
  assert.ok(paths.includes('/go/ios'));
});
