#!/usr/bin/env node
/**
 * Pre-OTA / release gate: refuse (or warn) when the brand-new-user merge proof is missing.
 *
 * Soft by default (exit 0 + WARN). Hard-fail when:
 *   HERMES_OTA_REQUIRE_STRANGER_PROOF=1
 *   or --hard / --require CLI flag
 *
 * Structural checks always run (workflow + Maestro flow contract). Proof artifact is
 * optional until the hard gate is flipped.
 *
 * Soft→hard: set HERMES_OTA_REQUIRE_STRANGER_PROOF=1 in mobile-ota.yml after the
 * stranger CI job is a required branch-protection check for ~1 week of green runs.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const mobileRoot = path.resolve(__dirname, '..');
const hard =
  process.argv.includes('--hard') ||
  process.argv.includes('--require') ||
  process.env.HERMES_OTA_REQUIRE_STRANGER_PROOF === '1' ||
  process.env.HERMES_OTA_REQUIRE_STRANGER_PROOF === 'true';
const jsonMode = process.argv.includes('--json');

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

const workflowPath = '.github/workflows/mobile-e2e.yml';
const flowPath = 'hermes-mobile/.maestro/stranger-cold-start.yaml';

let workflow = '';
let flow = '';
try {
  workflow = read(workflowPath);
  flow = read(flowPath);
} catch (err) {
  fail(`missing required file: ${err.message}`);
}

if (workflow) {
  if (!workflow.includes('Maestro stranger cold-start (Android emulator)')) {
    fail('mobile-e2e.yml must define job "Maestro stranger cold-start (Android emulator)"');
  }
  if (!workflow.includes('stranger-cold-start.yaml')) {
    fail('mobile-e2e.yml must run stranger-cold-start.yaml');
  }
  if (!workflow.includes('STRANGER_COLD_START_ASSEMBLE')) {
    fail('mobile-e2e.yml must mark the stranger assemble step (STRANGER_COLD_START_ASSEMBLE)');
  }
  // Stranger assemble block: from marker through next top-level job step that runs Maestro.
  const assembleIdx = workflow.indexOf('STRANGER_COLD_START_ASSEMBLE');
  const assembleSlice = workflow.slice(assembleIdx, assembleIdx + 800);
  if (!/EXPO_PUBLIC_E2E_AUTOMATION:\s*["']0["']/.test(assembleSlice)) {
    fail('stranger cold-start CI assemble must set EXPO_PUBLIC_E2E_AUTOMATION=0');
  }
  if (/EXPO_PUBLIC_E2E_AUTOMATION:\s*["']1["']/.test(assembleSlice)) {
    fail('stranger cold-start CI assemble must NOT set EXPO_PUBLIC_E2E_AUTOMATION=1');
  }
}

if (flow) {
  if (!/clearState:\s*true/.test(flow)) {
    fail('stranger-cold-start.yaml must launch with clearState: true');
  }
  if (/openLink:.*demo=1|hermes:\/\/setup\?demo=1/.test(flow)) {
    fail('stranger-cold-start.yaml must NOT open the demo setup deep link');
  }
  if (!flow.includes('connect-mac-gate')) {
    fail('stranger-cold-start.yaml must assert connect-mac-gate');
  }
  if (!/assertNotVisible:\s*"Reconnecting/.test(flow)) {
    fail('stranger-cold-start.yaml must assertNotVisible Reconnecting');
  }
}

// Optional runtime proof from continuous E2E / CI artifact mirror.
const proofCandidates = [
  path.join(mobileRoot, 'docs/proofs/continuous/latest.json'),
  path.join(mobileRoot, 'docs/proofs/stranger-cold-start/latest.json'),
  process.env.HERMES_STRANGER_PROOF_JSON || '',
].filter(Boolean);

let proofOk = false;
let proofDetail = 'no proof artifact found';
for (const proofPath of proofCandidates) {
  if (!fs.existsSync(proofPath)) {
    continue;
  }
  try {
    const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
    const stranger =
      proof.strangerColdStart ||
      proof.stranger_cold_start ||
      proof.flows?.['stranger-cold-start'] ||
      proof.flows?.strangerColdStart;
    const e2e = proof.e2e || proof.status;
    if (stranger === 'pass' || stranger?.status === 'pass') {
      proofOk = true;
      proofDetail = `${proofPath}: strangerColdStart=pass`;
      break;
    }
    if (e2e === 'pass' && Array.isArray(proof.flows)) {
      const hit = proof.flows.find(
        (f) =>
          typeof f === 'string'
            ? f.includes('stranger-cold-start')
            : String(f?.name || f?.flow || '').includes('stranger-cold-start'),
      );
      if (hit && (hit === 'pass' || hit.status === 'pass' || typeof hit === 'string')) {
        // String-only hit in a pass list is weak; require explicit pass when object.
        if (typeof hit === 'string' || hit.status === 'pass') {
          proofOk = true;
          proofDetail = `${proofPath}: flows include stranger-cold-start under e2e=pass`;
          break;
        }
      }
    }
    proofDetail = `${proofPath}: present but stranger cold-start not marked pass`;
  } catch (err) {
    proofDetail = `${proofPath}: unreadable (${err.message})`;
  }
}

if (!proofOk) {
  const msg =
    `fresh-user / stranger cold-start runtime proof missing (${proofDetail}). ` +
    `Merge gate is the CI job "Maestro stranger cold-start (Android emulator)". ` +
    `Ship-guard alone is insufficient (demo=1 + E2E hide-gate).`;
  if (hard) {
    fail(msg);
  } else {
    warn(`${msg} Soft gate — set HERMES_OTA_REQUIRE_STRANGER_PROOF=1 to refuse publish.`);
  }
}

const result = {
  ok: failures.length === 0,
  hard,
  failures,
  warnings,
  proofOk,
  proofDetail,
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  if (warnings.length) {
    console.warn('Hermes stranger cold-start proof: WARN');
    for (const w of warnings) {
      console.warn(`- ${w}`);
    }
  }
  if (failures.length) {
    console.error('Hermes stranger cold-start proof: FAIL');
    for (const f of failures) {
      console.error(`- ${f}`);
    }
  } else if (!warnings.length) {
    console.log('Hermes stranger cold-start proof: PASS');
  } else {
    console.log('Hermes stranger cold-start proof: PASS (with soft warnings)');
  }
}

process.exit(failures.length === 0 ? 0 : 1);
