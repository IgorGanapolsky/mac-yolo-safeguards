#!/usr/bin/env node
/**
 * Fail when a safety-critical workflow has been disabled.
 *
 * On 2026-07-27 a production Android release was blocked because "Internal Distribution" was
 * `disabled_manually` — the ONLY sanctioned way to earn the `internal-signoff/*` statuses the
 * release gate requires. Nobody knew until a release needed it. No commit disabled it; it was
 * toggled in the GitHub UI, so code review could never have caught it.
 *
 * Same failure shape as OTA being compiled out of the shipped binary: a safety net switched
 * off silently, discovered only at the moment it was needed.
 *
 * Usage: node tools/assert-critical-workflows-enabled.js [--json]
 * Requires: gh CLI authenticated.
 */
const { execFileSync } = require('child_process');

// Workflows whose absence silently removes a guarantee. Keep this list SHORT and load-bearing.
const CRITICAL = [
  'Internal Distribution',      // earns internal-signoff/* — without it, no production release
  'Hermes Mobile Continuous',   // iOS + Android e2e on PRs
  'Release health',             // crash-free rate paging
  'CI',                         // unit/contract/coverage gates
];

function evaluate(workflows, critical = CRITICAL) {
  const byName = new Map(workflows.map((w) => [w.name, w.state]));
  const problems = [];
  for (const name of critical) {
    if (!byName.has(name)) {
      problems.push({ name, state: 'MISSING', reason: 'workflow not found — renamed or deleted' });
      continue;
    }
    const state = byName.get(name);
    if (state !== 'active') {
      problems.push({ name, state, reason: 'disabled — the guarantee it provides is silently gone' });
    }
  }
  return problems;
}

function main() {
  const raw = execFileSync('gh', ['workflow', 'list', '--all', '--json', 'name,state'], {
    encoding: 'utf8',
  });
  const problems = evaluate(JSON.parse(raw));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ problems }, null, 2));
    return problems.length ? 1 : 0;
  }
  if (!problems.length) {
    console.log(`all ${CRITICAL.length} safety-critical workflows are active`);
    return 0;
  }
  for (const p of problems) {
    console.error(`  ${p.state.padEnd(18)} ${p.name}`);
    console.error(`  ${''.padEnd(18)} ${p.reason}`);
  }
  console.error(`\n::error::${problems.length} safety-critical workflow(s) not active`);
  console.error('Re-enable: gh workflow enable "<name>"');
  console.error('Page: Igor Ganapolsky — iganapolsky@gmail.com, (201) 639-1534');
  return 1;
}

module.exports = { evaluate, CRITICAL };
if (require.main === module) process.exit(main());
