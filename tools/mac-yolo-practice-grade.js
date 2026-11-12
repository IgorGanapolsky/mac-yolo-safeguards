#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const LETTERS = [
  [10, 'A+'],
  [9, 'A'],
  [8, 'B'],
  [7, 'B-'],
  [6, 'C+'],
  [5, 'C'],
  [4, 'C-'],
  [3, 'D+'],
  [2, 'D'],
  [1, 'D-'],
  [0, 'F'],
];

function letterFor(score) {
  const found = LETTERS.find((row) => score >= row[0]);
  return found ? found[1] : 'F';
}

function plane(id, score, reasons) {
  return { id, score, letter: letterFor(score), reasons };
}

function scoreEvals(evidence) {
  const product = evidence.productGolden || {};
  const taste = evidence.tasteGolden || {};
  const tinker = evidence.tinker || {};
  if (
    product.product === 'mac-yolo-safeguards' &&
    product.heldOut === true &&
    product.failed === 0 &&
    product.total >= 30 &&
    product.coversPanel === true &&
    product.fixtureOnly !== true
  ) {
    return plane('evals', 10, []);
  }
  const reasons = [];
  let score = 2;
  if (taste.total > 0 && taste.failed === 0) {
    score = 4;
    reasons.push(
      'Taste golden passed ' + taste.pass + '/' + taste.total +
      ' (updated ' + (taste.updated || 'unknown') + '). That set is copy taste, not the Mac app.'
    );
  }
  if (tinker.evalTotal >= 48 && tinker.evalFailed === 0 && tinker.aPlus === false) {
    score = 5;
    reasons.push(
      'Fixture eval passed ' + tinker.evalPassed + '/' + tinker.evalTotal +
      '. The scorecard that owns it graded itself ' + (tinker.grade || 'below A+') + ' and withheld a perfect mark.'
    );
  }
  if (!product.total) {
    reasons.push('No held-out Mac YOLO product golden run is in this evidence.');
  }
  return plane('evals', score, reasons);
}

function scoreDataScience(evidence) {
  const row = evidence.dataScience || {};
  if (
    row.settledCents > 0 &&
    row.founderExcluded === true &&
    row.provesRevenue === true &&
    row.source === 'processor'
  ) {
    return plane('dataScience', 10, []);
  }
  const reasons = [];
  let score = 1;
  if (row.ran === true) {
    score = 3;
    reasons.push(
      'A descriptive report ran on ' + row.prospects +
      ' rows. It says it does not prove revenue.'
    );
  }
  if (row.modelRows === 0 && row.heuristicRows > 0) {
    reasons.push('Scoring used the heuristic on ' + row.heuristicRows + ' rows.');
  }
  if (!(row.settledCents > 0)) {
    reasons.push('No settled non-founder cents are attached.');
  }
  return plane('dataScience', score, reasons);
}

function scoreMl(evidence) {
  const row = evidence.ml || {};
  if (
    row.trained === true &&
    row.productionId &&
    typeof row.holdoutAuc === 'number' &&
    row.holdoutAuc > 0.5 &&
    row.paidPositives >= 30
  ) {
    return plane('ml', 10, []);
  }
  const reasons = [];
  if (!row.productionId) reasons.push('The model registry has no production model.');
  if (row.trained === false) reasons.push('The propensity file is not trained.');
  if (row.holdoutAuc == null) reasons.push('No holdout AUC is recorded.');
  let score = 2;
  if (row.productionId && row.trained === true && typeof row.holdoutAuc === 'number') score = 6;
  return plane('ml', score, reasons);
}

function scoreGraph(evidence) {
  const row = evidence.graph || {};
  if (
    row.queryNamesPanel === true &&
    row.commitsBehindMain === 0 &&
    row.dirty === false &&
    row.sqlInterpolated === false &&
    row.astNodes > 0 &&
    row.probeChecked === true
  ) {
    return plane('graphRag', 10, []);
  }
  const reasons = [];
  let score = 2;
  if (row.graphBuilt) score = 4;
  if (row.queryExit === 0 && row.astNodes > 0) score = 5;
  if (row.queryNamesPanel === false) {
    reasons.push('A query for the menu-bar window did not name the panel source file.');
  }
  if (row.commitsBehindMain > 0) {
    reasons.push('The checkout used for the graph is ' + row.commitsBehindMain + ' commits behind origin/main.');
  }
  if (row.dirty) reasons.push('That checkout is dirty, so the graph age is not a clean main.');
  if (row.sqlInterpolated) reasons.push('The context-graph lookup pastes the search words into SQL.');
  if (row.probeChecked === false) reasons.push('The local model probe was not checked.');
  if (row.sqlInterpolated || row.queryNamesPanel === false) score = Math.min(score, 5);
  return plane('graphRag', score, reasons);
}

function gradePractice(evidence) {
  const packet = evidence || {};
  const planes = [
    scoreEvals(packet),
    scoreDataScience(packet),
    scoreMl(packet),
    scoreGraph(packet),
  ];
  const score = planes.reduce((min, item) => Math.min(min, item.score), 10);
  return {
    ok: planes.every((item) => item.score === 10),
    score,
    letter: letterFor(score),
    planes,
  };
}

function readEvidence(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('usage: node tools/mac-yolo-practice-grade.js <evidence.json>');
    process.exit(2);
  }
  if (!fs.existsSync(filePath)) {
    console.error('missing evidence file');
    process.exit(2);
  }
  const before = fs.readFileSync(filePath);
  const report = gradePractice(readEvidence(filePath));
  const after = fs.readFileSync(filePath);
  if (!before.equals(after)) {
    console.error('evidence file changed');
    process.exit(2);
  }
  const lines = [
    'practice grade: ' + report.letter + ' (' + report.score + '/10)',
  ];
  report.planes.forEach((item) => {
    lines.push(item.id + ': ' + item.letter + ' (' + item.score + '/10)');
    item.reasons.forEach((reason) => lines.push('  - ' + reason));
  });
  console.log(lines.join('\n'));
  process.exit(report.ok ? 0 : 1);
}

module.exports = { gradePractice, letterFor };

if (require.main === module) main();
