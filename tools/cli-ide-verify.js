#!/usr/bin/env node
'use strict';

/**
 * Local-first CLI/IDE proposal grade (The New Stack 2026-08-25 FORMAT).
 * Complementary to Codex #2126 coding-context-pack verification receipts
 * (those require Linear + 40-char SHA). This file never edits that pack.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA = 'cli-ide-verify/v1';
const SOURCE = 'https://thenewstack.io/cli-ide-ai-verification/';

const QUESTIONS = Object.freeze([
  { id: 'behaved', prompt: 'Did the change behave as intended?' },
  { id: 'known_issue', prompt: 'Did it introduce a known security, reliability, or maintainability issue?' },
  { id: 'standards', prompt: 'Does it conform to the project’s standards?' },
  { id: 'reviewable', prompt: 'Is there sufficient context for a developer to review the result efficiently?' },
]);

const LAYERS = Object.freeze([
  { id: 'local', firstLine: true, purpose: 'lint/static/secrets/types/focused tests while the agent still has context' },
  { id: 'pr', firstLine: false, purpose: 'same standards on the bounded diff, environment-agnostic' },
  { id: 'ci', firstLine: false, role: 'backstop', purpose: 'independent backstop — never the first line of defense' },
]);

function honesty() {
  return {
    schema: SCHEMA,
    source: SOURCE,
    clonedSonar: false,
    sonarqubeMcp: false,
    sonarCliSku: false,
    dualEditCodexContextContract2126: false,
    steal: [
      'CLI vs IDE is a preference; verification is the control',
      'agent output is a proposal — a polished diff is not proof',
      'four review questions before the change moves forward',
      'local checks first; CI is a backstop, not the first line',
    ],
    skip: [
      'SonarQube platform / Sonar CLI / Sonar MCP / agent plugins',
      'editing tools/coding-context-pack.js or tools/context-vault.js (#2126)',
    ],
  };
}

function expectedTestNeedle(file) {
  if (!String(file).startsWith('tools/')) return null;
  const base = path.basename(file, path.extname(file));
  return `test-${base}`;
}

function gradeProposal(proposal) {
  const missing = [];
  const questions = {};
  const checksRan = [];

  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    return { schema: SCHEMA, ok: false, missing: ['proposal'], questions, layers: LAYERS, checksRan, remainingUncertain: ['proposal'] };
  }
  if (proposal.schema === 'agent-verification-receipt/v1') {
    return {
      schema: SCHEMA,
      ok: false,
      missing: ['dual_edit_codex_receipt'],
      questions,
      layers: LAYERS,
      checksRan,
      remainingUncertain: ['use_coding_context_pack_verify_receipt'],
    };
  }
  if (proposal.stage && proposal.stage !== 'local_proposal') {
    missing.push('stage_must_be_local_proposal');
  }

  const files = Array.isArray(proposal.changedFiles) ? proposal.changedFiles : [];
  const tests = Array.isArray(proposal.tests) ? proposal.tests : [];
  const why = String(proposal.why || '').trim();
  const uncertainties = proposal.uncertainties;
  const findings = Number(proposal.patternGateFindings || 0);
  const secretsClean = proposal.secretsClean !== false;
  const ciAsFirstLine = Boolean(proposal.ciAsFirstLine);
  const liveClaim = Boolean(proposal.liveClaim);
  const curlAsLiveProof = Boolean(proposal.curlAsLiveProof);

  if (files.length === 0) missing.push('changed_files');
  if (files.some((f) => path.isAbsolute(f) || String(f).includes('..'))) missing.push('changed_files_unsafe');
  if (ciAsFirstLine) missing.push('ci_is_backstop');
  if (liveClaim && curlAsLiveProof) missing.push('curl_is_not_live');
  if (!Array.isArray(uncertainties)) missing.push('uncertainties');

  const testsOk =
    tests.length > 0 &&
    tests.every((t) => t && t.command && Number.isInteger(t.exit) && t.exit === 0);
  if (!testsOk) missing.push('tests');
  if (proposal.hasDiff && tests.length === 0) missing.push('polished_diff_not_proof');
  if (testsOk) checksRan.push('tests');

  const knownOk = findings === 0 && secretsClean;
  if (!knownOk) missing.push('known_issue');
  if (proposal.patternGateFindings != null) checksRan.push('pattern_gate');
  if (proposal.secretsClean != null) checksRan.push('secrets');

  const testBlob = tests.map((t) => String(t.command || '')).join('\n');
  const missingPair = files
    .map(expectedTestNeedle)
    .filter(Boolean)
    .filter((needle) => !testBlob.includes(needle));
  const standardsOk = why.length > 0 && missingPair.length === 0 && !(liveClaim && curlAsLiveProof);
  if (why.length === 0) missing.push('why');
  if (missingPair.length) missing.push('paired_test');

  const reviewableOk =
    why.length > 0 && files.length > 0 && Array.isArray(uncertainties) && checksRan.length > 0;
  if (checksRan.length === 0) missing.push('checks_ran');

  questions.behaved = { ok: testsOk, prompt: QUESTIONS[0].prompt };
  questions.known_issue = { ok: knownOk, prompt: QUESTIONS[1].prompt };
  questions.standards = { ok: standardsOk, prompt: QUESTIONS[2].prompt };
  questions.reviewable = { ok: reviewableOk, prompt: QUESTIONS[3].prompt };

  const remainingUncertain = Array.isArray(uncertainties) ? [...uncertainties] : ['uncertainties'];
  if (proposal.metrics == null) remainingUncertain.push('metrics_unmeasured');

  const ok =
    missing.length === 0 &&
    questions.behaved.ok &&
    questions.known_issue.ok &&
    questions.standards.ok &&
    questions.reviewable.ok;

  return {
    schema: SCHEMA,
    ok,
    missing,
    questions,
    layers: LAYERS,
    surfaces: ['cli', 'ide'],
    checksRan,
    remainingUncertain,
    changedFiles: files,
    why,
    liveClaim: false,
  };
}

function demoProposal() {
  return {
    stage: 'local_proposal',
    why: 'Local-first four-question grade so CI is not the first line of defense.',
    changedFiles: ['tools/cli-ide-verify.js', 'tests/test-cli-ide-verify.js'],
    tests: [{ command: 'node tests/test-cli-ide-verify.js', exit: 0 }],
    patternGateFindings: 0,
    secretsClean: true,
    uncertainties: [],
    hasDiff: true,
    ciAsFirstLine: false,
    liveClaim: false,
    curlAsLiveProof: false,
  };
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const pretty = json ? 2 : 0;
  const payload = { ...honesty() };
  if (argv.includes('--demo')) {
    payload.demo = gradeProposal(demoProposal());
  }
  const gradeIdx = argv.indexOf('--grade');
  if (gradeIdx >= 0) {
    const file = argv[gradeIdx + 1];
    if (!file) {
      process.stderr.write('usage: cli-ide-verify [--json] [--demo] [--grade proposal.json]\n');
      return 2;
    }
    payload.grade = gradeProposal(JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  if (!argv.includes('--demo') && gradeIdx < 0) {
    process.stderr.write('usage: cli-ide-verify [--json] [--demo] [--grade proposal.json]\n');
    return 2;
  }
  process.stdout.write(`${JSON.stringify(payload, null, pretty)}\n`);
  const failed = (payload.demo && !payload.demo.ok) || (payload.grade && !payload.grade.ok);
  return failed ? 1 : 0;
}

if (require.main === module) process.exit(main());

module.exports = {
  SCHEMA,
  QUESTIONS,
  LAYERS,
  honesty,
  expectedTestNeedle,
  gradeProposal,
  demoProposal,
  main,
};
