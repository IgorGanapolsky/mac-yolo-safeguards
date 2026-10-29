#!/usr/bin/env node
'use strict';

const SEVERITY = ['critical', 'high', 'medium', 'low'];
const DOC_SURFACES = ['readme', 'api', 'architecture', 'onboarding'];
const NOTE_GROUPS = ['features', 'fixes', 'performance', 'breaking', 'deprecations'];
const TEST_KINDS = ['happy', 'edge', 'error', 'boundary', 'invalid'];
const SECURITY_CATEGORIES = ['injection', 'auth', 'exposure', 'dependency', 'crypto'];
const API_BREAKS = ['api_signature', 'public_method', 'return_type', 'schema'];

function reviewLogical({ intent, diff, findings } = {}) {
  const text = String(diff ?? '');
  if (!text.trim()) return { decision: 'empty', findings: [] };
  if (!String(intent || '').trim()) return { decision: 'hold', reason: 'missing_intent', findings: [] };
  const accepted = [];
  for (const finding of findings || []) {
    const citation = String(finding && finding.citation || '');
    if (!citation || !text.includes(citation)) {
      return { decision: 'hold', reason: 'citation_not_in_diff', findings: accepted };
    }
    accepted.push({ citation, kind: finding.kind || 'logical' });
  }
  return { decision: accepted.length ? 'findings' : 'no_findings', findings: accepted };
}

function breakingReport(change = {}) {
  const classes = [];
  if ((change.signatures || []).some((item) => item.before !== item.after)) classes.push('api_signature');
  if ((change.publicMethods || []).some((item) => item.change === 'removed' || item.change === 'renamed')) {
    classes.push('public_method');
  }
  if ((change.returnTypes || []).some((item) => item.before !== item.after)) classes.push('return_type');
  if ((change.schemas || []).some((item) => item && item.change)) classes.push('schema');
  if ((change.config || []).some((item) => item && (item.breaking === true || item.change === 'removed'))) {
    classes.push('config');
  }
  return { breaking: classes.length > 0, classes };
}

function triageFindings(findings) {
  if (!Array.isArray(findings) || findings.length === 0) {
    return { triaged: false, reason: 'empty', blocked: false, findings: [] };
  }
  const normalized = [];
  for (const finding of findings) {
    if (!SEVERITY.includes(finding && finding.severity)) {
      return { triaged: false, reason: 'unknown_severity', blocked: true, findings: [] };
    }
    if (finding.disposition === 'false_positive') {
      if (!String(finding.reason || '').trim()) {
        return { triaged: false, reason: 'false_positive_without_reason', blocked: true, findings: [] };
      }
      normalized.push({ id: finding.id, severity: finding.severity, disposition: 'false_positive', open: false });
    } else if (finding.disposition === 'real') {
      if (!String(finding.explanation || '').trim() || !String(finding.remediation || '').trim()) {
        return { triaged: false, reason: 'real_risk_incomplete', blocked: true, findings: [] };
      }
      normalized.push({ id: finding.id, severity: finding.severity, disposition: 'real', open: true });
    } else {
      return { triaged: false, reason: 'unreviewed', blocked: true, findings: [] };
    }
  }
  normalized.sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));
  return {
    triaged: true,
    reason: 'triaged',
    blocked: normalized.some((item) => item.open),
    findings: normalized,
  };
}

function reviewSecurity(record = {}) {
  const categories = {};
  for (const name of SECURITY_CATEGORIES) {
    const entry = record[name];
    const status = entry && entry.status;
    if (status !== 'clear' && status !== 'finding') {
      return { ship: false, reason: 'unreviewed', surface: name, categories };
    }
    if (status === 'finding' && !String(entry.note || '').trim()) {
      return { ship: false, reason: 'finding_without_note', surface: name, categories };
    }
    categories[name] = status;
  }
  const findings = SECURITY_CATEGORIES.filter((name) => categories[name] === 'finding');
  return {
    ship: findings.length === 0,
    reason: findings.length ? 'findings_remain' : 'clear',
    categories,
  };
}

function releaseNotes(items) {
  const groups = {
    features: [],
    fixes: [],
    performance: [],
    breaking: [],
    deprecations: [],
  };
  if (!Array.isArray(items) || items.length === 0) return { ok: true, groups };
  for (const item of items) {
    if (!item || !NOTE_GROUPS.includes(item.group)) return { ok: false, reason: 'unknown_group', groups: null };
    if (item.breaking === true && item.group !== 'breaking') {
      return { ok: false, reason: 'breaking_misfiled', groups: null };
    }
    if (!String(item.title || '').trim()) return { ok: false, reason: 'missing_title', groups: null };
    groups[item.group].push(item.title);
  }
  return { ok: true, groups };
}

function docDrift({ files, surfaces, breaking } = {}) {
  const list = Array.isArray(files) ? files : [];
  if (list.length === 0) return { current: true, reason: 'no_change', updates: [] };
  const updates = [];
  for (const name of DOC_SURFACES) {
    const mark = surfaces && surfaces[name];
    if (mark !== 'unchanged' && mark !== 'update') {
      return { current: false, reason: 'surface_unreviewed', surface: name, updates };
    }
    if (mark === 'update') updates.push(name);
  }
  const report = breakingReport(breaking);
  if (API_BREAKS.some((name) => report.classes.includes(name)) && surfaces.api !== 'update') {
    return { current: false, reason: 'api_drift', updates };
  }
  return { current: true, reason: 'reviewed', updates };
}

function breakDownEpic({ description, issues } = {}) {
  const text = String(description || '').trim();
  const list = Array.isArray(issues) ? issues : [];
  if (!text) {
    if (list.length) return { ok: false, reason: 'issues_without_epic', issues: [] };
    return { ok: true, issues: [] };
  }
  if (list.length === 0) return { ok: false, reason: 'no_issues', issues: [] };
  const ids = list.map((issue) => issue && issue.id);
  if (new Set(ids).size !== list.length || ids.some((id) => !id)) {
    return { ok: false, reason: 'duplicate_or_missing_id', issues: [] };
  }
  const known = new Set(ids);
  for (const issue of list) {
    if (!Array.isArray(issue.acceptance) || issue.acceptance.length === 0 || issue.acceptance.some((item) => !String(item || '').trim())) {
      return { ok: false, reason: 'missing_acceptance', id: issue.id, issues: [] };
    }
    if (!Number.isInteger(issue.size) || issue.size < 1 || issue.size > 5) {
      return { ok: false, reason: 'unreasonable_size', id: issue.id, issues: [] };
    }
    for (const dep of issue.dependsOn || []) {
      if (!known.has(dep)) return { ok: false, reason: 'unknown_dependency', id: issue.id, issues: [] };
    }
  }
  const pending = list.map((issue) => ({ id: issue.id, dependsOn: issue.dependsOn || [] }));
  const order = [];
  const done = new Set();
  while (pending.length) {
    const ready = pending.findIndex((issue) => issue.dependsOn.every((id) => done.has(id)));
    if (ready === -1) return { ok: false, reason: 'dependency_cycle', issues: order };
    const [next] = pending.splice(ready, 1);
    order.push(next.id);
    done.add(next.id);
  }
  return { ok: true, issues: order };
}

function reviewTests({ fn, cases } = {}) {
  if (!String(fn || '').trim()) return { complete: false, reason: 'missing_function', missing: TEST_KINDS.slice() };
  for (const entry of cases || []) {
    if (!entry || !TEST_KINDS.includes(entry.kind) || !String(entry.title || '').trim()) {
      return { complete: false, reason: 'invalid_case', missing: TEST_KINDS.slice() };
    }
  }
  const present = new Set((cases || []).map((entry) => entry.kind));
  const missing = TEST_KINDS.filter((kind) => !present.has(kind));
  return { complete: missing.length === 0, reason: missing.length ? 'missing_kind' : 'complete', missing };
}

function coverageGaps({ functions, tested, callerPercent } = {}) {
  const names = Array.isArray(functions) ? functions : [];
  const done = new Set(tested || []);
  const gaps = names.filter((name) => !done.has(name));
  return {
    gaps,
    priority: gaps.slice(),
    callerPercent: Number.isFinite(callerPercent) ? callerPercent : null,
    covered: names.length > 0 && gaps.length === 0,
  };
}

function debugPipeline({ job, stage, error, cause, fix, why, prevention } = {}) {
  if (!String(job || '').trim() || !String(stage || '').trim() || !String(error || '').trim()) {
    return { explained: false, reason: 'missing_failure' };
  }
  const fields = { cause, fix, why, prevention };
  for (const key of Object.keys(fields)) {
    if (!String(fields[key] || '').trim()) return { explained: false, reason: `missing_${key}` };
  }
  if (!String(error).toLowerCase().includes(String(cause).trim().toLowerCase())) {
    return { explained: false, reason: 'cause_not_in_log' };
  }
  return { explained: true, reason: 'explained', job: String(job), stage: String(stage) };
}

function fixtureReport() {
  const held = reviewLogical({ diff: 'function a() { return 1; }', findings: [] });
  const empty = reviewLogical({ diff: '  ', intent: 'add', findings: [{ citation: 'return 1' }] });
  const cited = reviewLogical({
    diff: 'function a() { return 1; }',
    intent: 'return one',
    findings: [{ citation: 'return 1', kind: 'logical' }],
  });
  const stray = reviewLogical({
    diff: 'function a() { return 1; }',
    intent: 'return one',
    findings: [{ citation: 'return 2', kind: 'logical' }],
  });
  const renamed = breakingReport({ publicMethods: [{ name: 'ship', change: 'renamed' }] });
  const added = breakingReport({ publicMethods: [{ name: 'ship', change: 'added' }] });
  const dismissed = triageFindings([{ id: '1', severity: 'high', disposition: 'false_positive' }]);
  const ordered = triageFindings([
    { id: 'low', severity: 'low', disposition: 'real', explanation: 'leaks a token', remediation: 'redact the log' },
    { id: 'crit', severity: 'critical', disposition: 'false_positive', reason: 'fixture string in a test' },
  ]);
  const security = reviewSecurity({
    injection: { status: 'clear' },
    auth: { status: 'clear' },
    exposure: { status: 'clear' },
    dependency: { status: 'clear' },
  });
  const notes = releaseNotes([{ title: 'Faster boot', group: 'features', breaking: true }]);
  const epic = breakDownEpic({ description: '' });
  const tests = reviewTests({
    fn: 'function add(a, b) { return a + b; }',
    cases: [
      { kind: 'happy', title: 'adds' },
      { kind: 'edge', title: 'zero' },
      { kind: 'error', title: 'throws' },
      { kind: 'boundary', title: 'max' },
    ],
  });
  const gaps = coverageGaps({ functions: ['add', 'sub'], tested: ['add'], callerPercent: 100 });
  const pipeline = debugPipeline({
    job: 'test',
    stage: 'verify',
    error: 'Error: ENOENT missing file',
    cause: 'disk full',
    fix: 'free space',
    why: 'the cache grew',
    prevention: 'cap the cache',
  });
  const ok = held.decision === 'hold'
    && held.reason === 'missing_intent'
    && empty.decision === 'empty'
    && cited.decision === 'findings'
    && stray.decision === 'hold'
    && stray.reason === 'citation_not_in_diff'
    && renamed.breaking === true
    && renamed.classes.includes('public_method')
    && added.breaking === false
    && dismissed.triaged === false
    && dismissed.reason === 'false_positive_without_reason'
    && ordered.triaged === true
    && ordered.blocked === true
    && ordered.findings[0].id === 'crit'
    && security.ship === false
    && security.reason === 'unreviewed'
    && notes.ok === false
    && notes.reason === 'breaking_misfiled'
    && epic.ok === true
    && epic.issues.length === 0
    && tests.complete === false
    && tests.missing.includes('invalid')
    && gaps.covered === false
    && gaps.callerPercent === 100
    && gaps.gaps[0] === 'sub'
    && pipeline.explained === false
    && pipeline.reason === 'cause_not_in_log';
  return { fixtures: true, ok };
}

function main(argv) {
  if (!argv.includes('--json')) {
    process.stderr.write('usage: node tools/gitlab-delivery-prompts-gate.js --json\n');
    process.exit(2);
  }
  const report = fixtureReport();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) main(process.argv);

module.exports = {
  reviewLogical,
  breakingReport,
  triageFindings,
  reviewSecurity,
  releaseNotes,
  docDrift,
  breakDownEpic,
  reviewTests,
  coverageGaps,
  debugPipeline,
  fixtureReport,
};
