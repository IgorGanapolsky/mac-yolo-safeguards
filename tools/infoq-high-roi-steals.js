#!/usr/bin/env node
'use strict';

/**
 * Evidence-backed ROI and retrieval-fusion audit.
 *
 * This deliberately refuses fixed savings, quality, and "A+" claims. Every
 * percentage comes from an evidence file supplied by the caller.
 *
 * Evidence schema:
 * {
 *   "mcp": {
 *     "registeredTools": 80,
 *     "activeTools": 12,
 *     "beforePromptTokens": 10000,
 *     "afterPromptTokens": 4200
 *   },
 *   "workloads": [{
 *     "id": "case-1",
 *     "baseline": { "costUsd": 0.10, "passed": true },
 *     "candidate": { "costUsd": 0.02, "passed": true, "route": "local" }
 *   }],
 *   "retrieval": [{
 *     "id": "query-1",
 *     "expectedEvidence": ["doc-a", "doc-b"],
 *     "expectedPaths": ["service-a->calls->service-b"],
 *     "searchOnly": ["doc-a"],
 *     "fusedEvidence": ["doc-a", "doc-b"],
 *     "fusedPaths": ["service-a->calls->service-b"]
 *   }]
 * }
 *
 * Usage:
 *   node tools/infoq-high-roi-steals.js --evidence evidence.json [--json]
 *   node tools/infoq-high-roi-steals.js --evidence evidence.json --validate
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MIN_CANARY_CASES = 3;

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function percentReduction(before, after) {
  if (!Number.isFinite(before) || before <= 0 || !finiteNonNegative(after)) return null;
  return Number((((before - after) / before) * 100).toFixed(2));
}

function readRegisteredSkillCount(repoRoot = REPO_ROOT) {
  const skillsPath = path.join(repoRoot, 'SKILLS.md');
  if (!fs.existsSync(skillsPath)) return 0;
  return (fs.readFileSync(skillsPath, 'utf8').match(/^### /gm) || []).length;
}

function auditMcpToolPruning(evidence = {}, options = {}) {
  const registeredTools = Number.isInteger(evidence.registeredTools)
    ? evidence.registeredTools
    : readRegisteredSkillCount(options.repoRoot);
  const activeTools = Number.isInteger(evidence.activeTools) ? evidence.activeTools : null;
  const savingsPercent = percentReduction(evidence.beforePromptTokens, evidence.afterPromptTokens);
  const measured = activeTools != null
    && activeTools >= 0
    && activeTools <= registeredTools
    && savingsPercent != null;

  return {
    name: 'MCP context-footprint audit',
    registeredTools,
    activeTools,
    prunedToolCount: measured ? registeredTools - activeTools : null,
    beforePromptTokens: finiteNonNegative(evidence.beforePromptTokens) ? evidence.beforePromptTokens : null,
    afterPromptTokens: finiteNonNegative(evidence.afterPromptTokens) ? evidence.afterPromptTokens : null,
    measuredTokenSavingsPercent: measured ? savingsPercent : null,
    status: measured ? 'MEASURED' : 'INSUFFICIENT_EVIDENCE',
    missingEvidence: measured ? [] : [
      ...(activeTools == null ? ['activeTools'] : []),
      ...(!finiteNonNegative(evidence.beforePromptTokens) || evidence.beforePromptTokens === 0 ? ['beforePromptTokens>0'] : []),
      ...(!finiteNonNegative(evidence.afterPromptTokens) ? ['afterPromptTokens'] : []),
    ],
  };
}

function validCanaryCase(item) {
  return item
    && typeof item.id === 'string'
    && finiteNonNegative(item.baseline?.costUsd)
    && typeof item.baseline?.passed === 'boolean'
    && finiteNonNegative(item.candidate?.costUsd)
    && typeof item.candidate?.passed === 'boolean'
    && ['local', 'private', 'hosted'].includes(item.candidate?.route);
}

function evaluateLocalFirstRouting(workloads = []) {
  const cases = Array.isArray(workloads) ? workloads : [];
  const invalidCaseIds = cases
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !validCanaryCase(item))
    .map(({ item, index }) => item?.id || `index:${index}`);
  const measured = cases.length >= MIN_CANARY_CASES && invalidCaseIds.length === 0;

  if (!measured) {
    return {
      name: 'AI cost and autonomy canary',
      totalWorkloads: cases.length,
      minimumCases: MIN_CANARY_CASES,
      localOrPrivateRuns: null,
      localRatioPercent: null,
      baselinePassRatePercent: null,
      candidatePassRatePercent: null,
      baselineCostUsd: null,
      candidateCostUsd: null,
      measuredCostReductionPercent: null,
      recommendation: 'collect_labeled_canary_evidence',
      status: 'INSUFFICIENT_EVIDENCE',
      invalidCaseIds,
    };
  }

  const localOrPrivateRuns = cases.filter((item) => ['local', 'private'].includes(item.candidate.route)).length;
  const baselinePasses = cases.filter((item) => item.baseline.passed).length;
  const candidatePasses = cases.filter((item) => item.candidate.passed).length;
  const baselineCostUsd = cases.reduce((sum, item) => sum + item.baseline.costUsd, 0);
  const candidateCostUsd = cases.reduce((sum, item) => sum + item.candidate.costUsd, 0);
  if (baselineCostUsd <= 0) {
    return {
      name: 'AI cost and autonomy canary',
      totalWorkloads: cases.length,
      minimumCases: MIN_CANARY_CASES,
      localOrPrivateRuns,
      localRatioPercent: Number(((localOrPrivateRuns / cases.length) * 100).toFixed(2)),
      baselinePassRatePercent: null,
      candidatePassRatePercent: null,
      baselineCostUsd: 0,
      candidateCostUsd: Number(candidateCostUsd.toFixed(6)),
      measuredCostReductionPercent: null,
      recommendation: 'collect_nonzero_baseline_cost',
      status: 'INSUFFICIENT_EVIDENCE',
      invalidCaseIds: [],
    };
  }
  const baselinePassRatePercent = Number(((baselinePasses / cases.length) * 100).toFixed(2));
  const candidatePassRatePercent = Number(((candidatePasses / cases.length) * 100).toFixed(2));
  const measuredCostReductionPercent = percentReduction(baselineCostUsd, candidateCostUsd);
  const qualityNonInferior = candidatePassRatePercent >= baselinePassRatePercent;
  const materiallyCheaper = measuredCostReductionPercent != null && measuredCostReductionPercent >= 20;

  return {
    name: 'AI cost and autonomy canary',
    totalWorkloads: cases.length,
    minimumCases: MIN_CANARY_CASES,
    localOrPrivateRuns,
    localRatioPercent: Number(((localOrPrivateRuns / cases.length) * 100).toFixed(2)),
    baselinePassRatePercent,
    candidatePassRatePercent,
    baselineCostUsd: Number(baselineCostUsd.toFixed(6)),
    candidateCostUsd: Number(candidateCostUsd.toFixed(6)),
    measuredCostReductionPercent,
    recommendation: qualityNonInferior && materiallyCheaper
      ? 'promote_candidate_canary'
      : 'keep_baseline',
    status: 'MEASURED',
    invalidCaseIds: [],
  };
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value))];
}

function recall(expected, actual) {
  const wanted = uniqueStrings(expected);
  if (wanted.length === 0) return null;
  const found = new Set(uniqueStrings(actual));
  return wanted.filter((item) => found.has(item)).length / wanted.length;
}

function dcg(expected, ranked) {
  const relevant = new Set(uniqueStrings(expected));
  return uniqueStrings(ranked).reduce((score, item, index) => (
    score + (relevant.has(item) ? 1 / Math.log2(index + 2) : 0)
  ), 0);
}

function ndcg(expected, ranked) {
  const wanted = uniqueStrings(expected);
  if (wanted.length === 0) return null;
  const ideal = dcg(wanted, wanted);
  return ideal === 0 ? null : dcg(wanted, ranked) / ideal;
}

function average(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function evaluateHybridRrfRetrieval(cases = []) {
  if (!Array.isArray(cases) || cases.length === 0) {
    return {
      name: 'Search-only versus graph-fused retrieval ablation',
      queryCount: 0,
      searchRecallPercent: null,
      fusedRecallPercent: null,
      fusedNdcgPercent: null,
      relationalPathRecallPercent: null,
      recallLiftPoints: null,
      status: 'INSUFFICIENT_EVIDENCE',
      recommendation: 'collect_golden_queries',
      invalidCaseIds: [],
    };
  }

  const invalid = cases
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => (
      !item
      || typeof item.id !== 'string'
      || uniqueStrings(item.expectedEvidence).length === 0
      || !Array.isArray(item.searchOnly)
      || !Array.isArray(item.fusedEvidence)
      || !Array.isArray(item.expectedPaths)
      || !Array.isArray(item.fusedPaths)
    ));
  if (invalid.length > 0) {
    return {
      name: 'Search-only versus graph-fused retrieval ablation',
      queryCount: cases.length,
      searchRecallPercent: null,
      fusedRecallPercent: null,
      fusedNdcgPercent: null,
      relationalPathRecallPercent: null,
      recallLiftPoints: null,
      status: 'INSUFFICIENT_EVIDENCE',
      recommendation: 'repair_golden_query_evidence',
      invalidCaseIds: invalid.map(({ item, index }) => item?.id || `index:${index}`),
    };
  }

  const searchRecalls = cases.map((item) => recall(item.expectedEvidence, item.searchOnly));
  const fusedRecalls = cases.map((item) => recall(item.expectedEvidence, item.fusedEvidence));
  const fusedNdcgs = cases.map((item) => ndcg(item.expectedEvidence, item.fusedEvidence));
  const relationalCases = cases.filter((item) => uniqueStrings(item.expectedPaths).length > 0);
  const pathRecalls = relationalCases.map((item) => recall(item.expectedPaths, item.fusedPaths));
  const searchRecall = average(searchRecalls);
  const fusedRecall = average(fusedRecalls);
  const fusedNdcg = average(fusedNdcgs);
  const pathRecall = relationalCases.length > 0 ? average(pathRecalls) : null;
  const recallLiftPoints = Number(((fusedRecall - searchRecall) * 100).toFixed(2));
  const pathsComplete = pathRecall == null || pathRecall === 1;
  const graphEarnsCost = recallLiftPoints > 0 || (relationalCases.length > 0 && pathRecall > 0);
  const pass = fusedRecall >= searchRecall && pathsComplete && graphEarnsCost;

  return {
    name: 'Search-only versus graph-fused retrieval ablation',
    queryCount: cases.length,
    relationalQueryCount: relationalCases.length,
    searchRecallPercent: Number((searchRecall * 100).toFixed(2)),
    fusedRecallPercent: Number((fusedRecall * 100).toFixed(2)),
    fusedNdcgPercent: Number((fusedNdcg * 100).toFixed(2)),
    relationalPathRecallPercent: pathRecall == null ? null : Number((pathRecall * 100).toFixed(2)),
    recallLiftPoints,
    status: pass ? 'PASS' : 'FAIL',
    recommendation: pass ? 'retain_bounded_graph_fusion' : 'fix_resolution_or_remove_graph_stage',
    invalidCaseIds: [],
  };
}

function runInfoQStealsSuite(evidence = {}, options = {}) {
  const mcpAudit = auditMcpToolPruning(evidence.mcp || {}, options);
  const localRouting = evaluateLocalFirstRouting(evidence.workloads || []);
  const hybridRag = evaluateHybridRrfRetrieval(evidence.retrieval || []);
  const ready = mcpAudit.status === 'MEASURED'
    && localRouting.status === 'MEASURED'
    && localRouting.recommendation === 'promote_candidate_canary'
    && hybridRag.status === 'PASS';

  return {
    schema: 'thumbgate-evidence-roi-audit/v2',
    generatedAt: new Date().toISOString(),
    overallStatus: ready ? 'MEASURED_PASS' : 'INSUFFICIENT_OR_FAILED',
    ready,
    mcpAudit,
    localRouting,
    hybridRag,
  };
}

function parseArgs(argv) {
  const args = { json: false, validate: false, evidence: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--json') args.json = true;
    else if (argv[index] === '--validate') args.validate = true;
    else if (argv[index] === '--evidence') args.evidence = argv[++index] || '';
  }
  return args;
}

function render(report) {
  const savings = report.mcpAudit.measuredTokenSavingsPercent == null
    ? 'unmeasured'
    : `${report.mcpAudit.measuredTokenSavingsPercent}%`;
  const cost = report.localRouting.measuredCostReductionPercent == null
    ? 'unmeasured'
    : `${report.localRouting.measuredCostReductionPercent}%`;
  const fused = report.hybridRag.fusedRecallPercent == null
    ? 'unmeasured'
    : `${report.hybridRag.fusedRecallPercent}%`;
  return [
    '=== ThumbGate evidence-backed ROI audit ===',
    `Overall: ${report.overallStatus}`,
    `MCP prompt-token savings: ${savings} (${report.mcpAudit.status})`,
    `Candidate cost reduction: ${cost} (${report.localRouting.recommendation})`,
    `Graph-fused recall: ${fused} (${report.hybridRag.status})`,
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let evidence = {};
  if (args.evidence) evidence = JSON.parse(fs.readFileSync(path.resolve(args.evidence), 'utf8'));
  const report = runInfoQStealsSuite(evidence);
  console.log(args.json ? JSON.stringify(report, null, 2) : render(report));
  if (args.validate && !report.ready) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  MIN_CANARY_CASES,
  auditMcpToolPruning,
  evaluateLocalFirstRouting,
  evaluateHybridRrfRetrieval,
  ndcg,
  percentReduction,
  runInfoQStealsSuite,
};
