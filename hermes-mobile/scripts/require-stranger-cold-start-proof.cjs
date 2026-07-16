#!/usr/bin/env node
/**
 * Pre-OTA / release gate: refuse when brand-new-user stranger cold-start proof is missing.
 *
 * HARD by default (exit 1 on missing runtime proof). Soft-warn only when:
 *   --soft / --warn-only
 *   or HERMES_OTA_REQUIRE_STRANGER_PROOF=0|false|soft
 *
 * Structural checks always run (workflow + Maestro flow contract).
 *
 * Runtime proof sources (any one succeeds):
 *   1. docs/proofs/continuous/latest.json or docs/proofs/stranger-cold-start/latest.json
 *      (or HERMES_STRANGER_PROOF_JSON path) with strangerColdStart=pass
 *   2. GitHub Checks API: "Maestro stranger cold-start (Android emulator)" = success
 *      on GITHUB_SHA (polls when HERMES_STRANGER_PROOF_WAIT_SEC > 0; CI default waits)
 *
 * Production OTA (mobile-ota.yml / ota:publish) must stay hard — no opt-in env.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const repoRoot = path.resolve(__dirname, '../..');
const mobileRoot = path.resolve(__dirname, '..');

const soft =
  process.argv.includes('--soft') ||
  process.argv.includes('--warn-only') ||
  process.env.HERMES_OTA_REQUIRE_STRANGER_PROOF === '0' ||
  process.env.HERMES_OTA_REQUIRE_STRANGER_PROOF === 'false' ||
  process.env.HERMES_OTA_REQUIRE_STRANGER_PROOF === 'soft';
// --hard / --require kept for back-compat; hard is already the default.
const hard = !soft;
const jsonMode = process.argv.includes('--json');

const STRANGER_CHECK_NAME = 'Maestro stranger cold-start (Android emulator)';
const defaultWaitSec = process.env.GITHUB_ACTIONS === 'true' ? 2100 : 0;
const waitSec = Math.max(
  0,
  Number.parseInt(process.env.HERMES_STRANGER_PROOF_WAIT_SEC ?? String(defaultWaitSec), 10) || 0,
);

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
  if (!workflow.includes(STRANGER_CHECK_NAME)) {
    fail(`mobile-e2e.yml must define job "${STRANGER_CHECK_NAME}"`);
  }
  if (!workflow.includes('stranger-cold-start.yaml')) {
    fail('mobile-e2e.yml must run stranger-cold-start.yaml');
  }
  if (!workflow.includes('STRANGER_COLD_START_ASSEMBLE')) {
    fail('mobile-e2e.yml must mark the stranger assemble step (STRANGER_COLD_START_ASSEMBLE)');
  }
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

function evaluateProofFile(proofPath) {
  if (!fs.existsSync(proofPath)) {
    return null;
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
      return { ok: true, detail: `${proofPath}: strangerColdStart=pass` };
    }
    if (e2e === 'pass' && Array.isArray(proof.flows)) {
      const hit = proof.flows.find((f) =>
        typeof f === 'string'
          ? f.includes('stranger-cold-start')
          : String(f?.name || f?.flow || '').includes('stranger-cold-start'),
      );
      if (hit && (typeof hit === 'string' || hit.status === 'pass')) {
        return {
          ok: true,
          detail: `${proofPath}: flows include stranger-cold-start under e2e=pass`,
        };
      }
    }
    return { ok: false, detail: `${proofPath}: present but stranger cold-start not marked pass` };
  } catch (err) {
    return { ok: false, detail: `${proofPath}: unreadable (${err.message})` };
  }
}

const proofCandidates = [
  path.join(mobileRoot, 'docs/proofs/continuous/latest.json'),
  path.join(mobileRoot, 'docs/proofs/stranger-cold-start/latest.json'),
  process.env.HERMES_STRANGER_PROOF_JSON || '',
].filter(Boolean);

let proofOk = false;
let proofDetail = 'no proof artifact found';
for (const proofPath of proofCandidates) {
  const evaluated = evaluateProofFile(proofPath);
  if (!evaluated) {
    continue;
  }
  proofDetail = evaluated.detail;
  if (evaluated.ok) {
    proofOk = true;
    break;
  }
}

function ghGetJson(urlPath, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: urlPath,
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'hermes-require-stranger-cold-start-proof',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`GitHub API ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkGithubStrangerProof() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const repo = process.env.GITHUB_REPOSITORY || '';
  const sha =
    process.env.HERMES_STRANGER_PROOF_SHA ||
    process.env.GITHUB_SHA ||
    '';
  if (!token || !repo || !sha) {
    return {
      ok: false,
      detail:
        'GitHub Checks proof skipped (need GITHUB_TOKEN + GITHUB_REPOSITORY + GITHUB_SHA)',
    };
  }

  const deadline = Date.now() + waitSec * 1000;
  let lastDetail = 'no stranger check observed yet';
  while (true) {
    const urlPath = `/repos/${repo}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`;
    let payload;
    try {
      payload = await ghGetJson(urlPath, token);
    } catch (err) {
      return { ok: false, detail: `GitHub Checks query failed: ${err.message}` };
    }
    const runs = Array.isArray(payload.check_runs) ? payload.check_runs : [];
    const strangerRuns = runs.filter((r) => r?.name === STRANGER_CHECK_NAME);
    if (strangerRuns.length === 0) {
      lastDetail = `${STRANGER_CHECK_NAME}: not reported yet on ${sha.slice(0, 12)}`;
    } else {
      const success = strangerRuns.find((r) => r.conclusion === 'success');
      if (success) {
        return {
          ok: true,
          detail: `GitHub check "${STRANGER_CHECK_NAME}"=success on ${sha.slice(0, 12)}`,
        };
      }
      const failed = strangerRuns.find((r) =>
        ['failure', 'timed_out', 'cancelled', 'action_required', 'stale', 'neutral'].includes(
          String(r.conclusion || ''),
        ),
      );
      if (failed) {
        return {
          ok: false,
          detail: `GitHub check "${STRANGER_CHECK_NAME}"=${failed.conclusion} on ${sha.slice(0, 12)}`,
        };
      }
      const statuses = strangerRuns.map((r) => `${r.status}/${r.conclusion || 'null'}`).join(', ');
      lastDetail = `GitHub check "${STRANGER_CHECK_NAME}" still running (${statuses}) on ${sha.slice(0, 12)}`;
    }

    if (Date.now() >= deadline) {
      return { ok: false, detail: `${lastDetail}; waited ${waitSec}s` };
    }
    await sleep(20000);
  }
}

async function main() {
  if (!proofOk) {
    const gh = await checkGithubStrangerProof();
    if (gh.ok) {
      proofOk = true;
      proofDetail = gh.detail;
    } else if (gh.detail && !gh.detail.includes('skipped')) {
      proofDetail = gh.detail;
    } else if (proofDetail === 'no proof artifact found') {
      proofDetail = `${proofDetail}; ${gh.detail}`;
    }
  }

  if (!proofOk) {
    const msg =
      `fresh-user / stranger cold-start runtime proof missing (${proofDetail}). ` +
      `Merge gate is the CI job "${STRANGER_CHECK_NAME}". ` +
      `Ship-guard alone is insufficient (demo=1 + E2E hide-gate).`;
    if (hard) {
      fail(msg);
    } else {
      warn(`${msg} Soft gate — omit --soft / unset HERMES_OTA_REQUIRE_STRANGER_PROOF=0 for hard refuse.`);
    }
  }

  const result = {
    ok: failures.length === 0,
    hard,
    failures,
    warnings,
    proofOk,
    proofDetail,
    waitSec,
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
      console.log(`Hermes stranger cold-start proof: PASS (${proofDetail})`);
    } else {
      console.log('Hermes stranger cold-start proof: PASS (with soft warnings)');
    }
  }

  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`Hermes stranger cold-start proof: FAIL\n- ${err.message}`);
  process.exit(1);
});
