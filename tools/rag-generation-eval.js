#!/usr/bin/env node
'use strict';

/**
 * Generation-quality eval — faithfulness, groundedness, answer relevance.
 *
 * Deterministic (no LLM judge). Fixture-driven. Numbers are measured from
 * (query, answer, sources[]) triples — never constants.
 *
 *   node tools/rag-generation-eval.js
 *   node tools/rag-generation-eval.js --json
 */

const fs = require('fs');
const path = require('path');
const { scoreGeneration, mean, round4 } = require('./rag-metrics');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_FIXTURE = path.join(REPO, 'tests/fixtures/rag-eval/generation-cases.json');

function parseArgs(argv) {
  const args = { fixture: DEFAULT_FIXTURE, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--fixture') args.fixture = path.resolve(argv[++i] || '');
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function validateFixture(fixture) {
  if (!Array.isArray(fixture.cases) || !fixture.cases.length) {
    throw new Error('generation fixture has no cases');
  }
  for (const c of fixture.cases) {
    if (!c.id || !c.query || typeof c.answer !== 'string') {
      throw new Error(`case ${c.id || '?'} needs id, query, answer`);
    }
    if (!Array.isArray(c.sources)) {
      throw new Error(`case ${c.id} needs sources[]`);
    }
  }
}

function evaluateCase(testCase) {
  const floors = {
    minAnswerRelevance: testCase.minAnswerRelevance ?? 0.15,
    minFaithfulness: testCase.minFaithfulness ?? 0.5,
    minGroundedness: testCase.minGroundedness ?? 0.35,
  };
  const score = scoreGeneration(testCase.query, testCase.answer, testCase.sources, floors);
  return {
    id: testCase.id,
    ...score,
    expectPass: testCase.expectPass !== false,
    pass: testCase.expectPass === false ? !score.pass : score.pass,
  };
}

function buildReport(args) {
  const fixture = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
  validateFixture(fixture);
  const results = fixture.cases.map(evaluateCase);
  const passCount = results.filter((r) => r.pass).length;
  return {
    ok: passCount === results.length && results.length > 0,
    fixture: path.relative(REPO, args.fixture),
    caseCount: results.length,
    passCount,
    meanAnswerRelevance: round4(mean(results.map((r) => r.answerRelevance))),
    meanFaithfulness: round4(mean(results.map((r) => r.faithfulness))),
    meanGroundedness: round4(mean(results.map((r) => r.groundedness))),
    measured: true,
    source: 'tools/rag-generation-eval.js',
    results,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/rag-generation-eval.js [--fixture PATH] [--json]');
    process.exit(0);
  }
  const report = buildReport(args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(
      `RAG generation eval: ${report.passCount}/${report.caseCount} pass · ` +
        `relevance=${report.meanAnswerRelevance} · faithfulness=${report.meanFaithfulness} · ` +
        `groundedness=${report.meanGroundedness}`,
    );
    for (const r of report.results) {
      console.log(
        `  [${r.pass ? 'PASS' : 'FAIL'}] ${r.id} rel=${r.answerRelevance} faith=${r.faithfulness} ground=${r.groundedness}`,
      );
    }
  }
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = { buildReport, evaluateCase, parseArgs, validateFixture };
