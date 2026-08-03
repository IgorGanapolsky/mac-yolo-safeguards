#!/usr/bin/env node
'use strict';

/**
 * reasoning-proof-ladder.js — Structure for hard claims, stolen from OpenAI's
 * "reasoning walkthroughs" methodology (cdn.openai.com/pdf/reasoning-walkthroughs.pdf)
 * and the ten-proofs formalization discipline (github.com/openai/ten-proofs).
 *
 * Walkthrough lessons operationalized (not the math content):
 *  1. Record failed detours that taught structure (not only the winning path)
 *  2. Dual / independent witness before claiming the result
 *  3. Hierarchy of checks, not one informal identification
 *  4. Machine-checkable command for "done" (Lean analog: lake build)
 *  5. Residual risks explicit — informal claim ≠ formal proof
 *
 * Usage:
 *   node tools/reasoning-proof-ladder.js validate --file packet.json [--json]
 *   node tools/reasoning-proof-ladder.js scaffold --problem "..." [--json]
 *   node tools/reasoning-proof-ladder.js grade --file packet.json [--json]
 *   node tools/reasoning-proof-ladder.js --self-test
 *
 * Packet schema (JSON):
 * {
 *   "problem": string,
 *   "detours": [{ "approach": string, "whyFailed": string, "lesson": string }],
 *   "winningPath": string,
 *   "dualWitness": string,          // independent check description
 *   "machineCheck": string,         // shell command that must exit 0
 *   "residualRisks": [string],
 *   "claim": string                 // optional ship claim text
 * }
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const MIN_DETOURS = 1;
const SOURCES = {
  walkthroughs: 'https://cdn.openai.com/pdf/reasoning-walkthroughs.pdf',
  tenProofs: 'https://github.com/openai/ten-proofs',
  arxivCounting: 'https://arxiv.org/abs/2410.19730',
};

function scaffold(problem) {
  return {
    problem: problem || 'STATE THE PROBLEM PRECISELY',
    detours: [
      {
        approach: 'First plausible approach',
        whyFailed: 'What broke (not "did not work")',
        lesson: 'What structure this revealed',
      },
    ],
    winningPath: 'Decisive insight and how it closes the gap',
    dualWitness: 'Independent check that does not reuse the same construction',
    machineCheck: 'node tests/test-….js',
    residualRisks: ['What remains informal or unproven'],
    claim: '',
    sources: SOURCES,
  };
}

function validatePacket(packet) {
  const errors = [];
  const warnings = [];
  if (!packet || typeof packet !== 'object') {
    return { ok: false, errors: ['packet must be an object'], warnings: [] };
  }
  if (!String(packet.problem || '').trim() || /STATE THE PROBLEM/i.test(packet.problem)) {
    errors.push('problem: required, concrete statement');
  }
  if (!Array.isArray(packet.detours) || packet.detours.length < MIN_DETOURS) {
    errors.push(`detours: need ≥${MIN_DETOURS} failed approach(es) with lessons (walkthrough discipline)`);
  } else {
    packet.detours.forEach((d, i) => {
      if (!d || !String(d.approach || '').trim()) errors.push(`detours[${i}].approach required`);
      if (!d || !String(d.whyFailed || '').trim()) errors.push(`detours[${i}].whyFailed required`);
      if (!d || !String(d.lesson || '').trim()) errors.push(`detours[${i}].lesson required`);
      if (d && /did not work|failed$/i.test(String(d.whyFailed)) && String(d.whyFailed).length < 24) {
        warnings.push(`detours[${i}].whyFailed looks shallow — name the structural obstruction`);
      }
    });
  }
  if (!String(packet.winningPath || '').trim()) {
    errors.push('winningPath: required');
  }
  if (!String(packet.dualWitness || '').trim()) {
    errors.push('dualWitness: required (independent check — ten-proofs / dual witness pattern)');
  }
  if (!String(packet.machineCheck || '').trim()) {
    errors.push('machineCheck: required shell command (Lean analog)');
  } else if (/^echo\b|true$|exit 0/i.test(packet.machineCheck.trim())) {
    errors.push('machineCheck: refuse no-op commands (echo/true/exit 0)');
  }
  if (!Array.isArray(packet.residualRisks) || packet.residualRisks.length < 1) {
    errors.push('residualRisks: at least one explicit residual (informal ≠ proven)');
  }
  // Anti "informal identification as proof" — claim without machine check run
  if (packet.claim && /\b(proven|proved|formally|theorem|q\.?e\.?d)\b/i.test(packet.claim)) {
    warnings.push('claim uses formal language — ensure machineCheck actually ran (grade mode)');
  }
  return { ok: errors.length === 0, errors, warnings, sources: SOURCES };
}

function runMachineCheck(cmd, timeoutMs = 120_000) {
  const r = spawnSync('bash', ['-lc', cmd], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || '').slice(0, 2000),
    stderr: (r.stderr || '').slice(0, 1000),
    cmd,
  };
}

/**
 * Grade: validate structure + run machineCheck.
 * dualWitness is human/agent text — we only require it present (independent of construction).
 */
function gradePacket(packet, { runCheck = true } = {}) {
  const v = validatePacket(packet);
  const result = {
    ok: v.ok,
    validation: v,
    machine: null,
    level: 'invalid',
  };
  if (!v.ok) return result;

  // Levels inspired by ten-proofs formalization depth
  // informal: structure only
  // dual_witness: structure + dualWitness filled
  // machine_checked: + machineCheck exit 0
  result.level = 'dual_witness';
  if (runCheck) {
    result.machine = runMachineCheck(packet.machineCheck);
    if (!result.machine.ok) {
      result.ok = false;
      result.validation.errors.push(
        `machineCheck failed (exit ${result.machine.status}): ${packet.machineCheck}`,
      );
      result.level = 'structure_only_failed_check';
    } else {
      result.level = 'machine_checked';
    }
  } else {
    result.level = 'structure_only';
  }
  return result;
}

function selfTest() {
  const assert = require('assert');
  const bad = validatePacket({});
  assert.strictEqual(bad.ok, false);
  const sc = scaffold('Count open CodeQL alerts without LLM arithmetic');
  sc.detours = [
    {
      approach: 'Ask the model how many Highs are open',
      whyFailed: 'BPE tokenization + constant-depth Transformers mis-count (arXiv:2410.19730)',
      lesson: 'Use deterministic-count + gh API, never estimate',
    },
  ];
  sc.winningPath = 'gh api code-scanning/alerts + compareClaimToResults';
  sc.dualWitness = 'Second process: node tools/codeql-alert-sync.js --json open count';
  sc.machineCheck = 'node tools/deterministic-count.js --self-test';
  sc.residualRisks = ['API pagination edge cases'];
  const g = gradePacket(sc, { runCheck: true });
  assert.strictEqual(g.ok, true, JSON.stringify(g.validation.errors));
  assert.strictEqual(g.level, 'machine_checked');
  console.log('PASS reasoning-proof-ladder self-test');
}

function parseArgs(argv) {
  const out = {
    cmd: 'validate',
    file: null,
    problem: '',
    json: false,
    selfTest: false,
    help: false,
    noRun: false,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--self-test') out.selfTest = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--file') out.file = argv[++i];
    else if (a === '--problem') out.problem = argv[++i];
    else if (a === '--no-run') out.noRun = true;
    else rest.push(a);
  }
  if (rest[0] && ['validate', 'scaffold', 'grade'].includes(rest[0])) out.cmd = rest.shift();
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`reasoning-proof-ladder — OpenAI walkthrough + ten-proofs discipline

  validate --file packet.json
  scaffold --problem "..."
  grade --file packet.json [--no-run]
  --self-test
`);
    process.exit(0);
  }
  if (args.selfTest) {
    selfTest();
    process.exit(0);
  }
  if (args.cmd === 'scaffold') {
    const p = scaffold(args.problem);
    if (args.json) console.log(JSON.stringify(p, null, 2));
    else console.log(JSON.stringify(p, null, 2));
    process.exit(0);
  }
  if (!args.file) {
    console.error('--file required');
    process.exit(2);
  }
  const packet = JSON.parse(fs.readFileSync(path.resolve(args.file), 'utf8'));
  if (args.cmd === 'validate') {
    const v = validatePacket(packet);
    if (args.json) console.log(JSON.stringify(v, null, 2));
    else {
      console.log(v.ok ? 'PASS validate' : 'FAIL validate');
      for (const e of v.errors) console.log('  ERROR:', e);
      for (const w of v.warnings) console.log('  WARN:', w);
    }
    process.exit(v.ok ? 0 : 1);
  }
  if (args.cmd === 'grade') {
    const g = gradePacket(packet, { runCheck: !args.noRun });
    if (args.json) console.log(JSON.stringify(g, null, 2));
    else {
      console.log(g.ok ? `PASS grade level=${g.level}` : `FAIL grade level=${g.level}`);
      for (const e of g.validation.errors) console.log('  ERROR:', e);
      if (g.machine) console.log(`  machineCheck exit=${g.machine.status}`);
    }
    process.exit(g.ok ? 0 : 1);
  }
}

module.exports = {
  scaffold,
  validatePacket,
  gradePacket,
  runMachineCheck,
  SOURCES,
  MIN_DETOURS,
};

if (require.main === module) main();
