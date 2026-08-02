#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REQUIRED_CONSOLIDATION_BUDGETS = Object.freeze([
  'max_calls',
  'max_iterations',
  'max_input_tokens',
  'max_output_tokens',
  'max_runtime_seconds',
  'max_spend_usd',
]);

function topLevelSection(text, name) {
  const lines = String(text || '').split(/\r?\n/);
  const start = lines.findIndex((line) => line === `${name}:`);
  if (start < 0) return '';
  const selected = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Za-z0-9_-]+:\s*/.test(line)) break;
    selected.push(line);
  }
  return selected.join('\n');
}

function scalar(section, key) {
  const match = String(section || '').match(new RegExp(`^\\s{2}${key}:\\s*([^\\r\\n#]+)`, 'm'));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

function boolValue(value, fallback = false) {
  if (String(value).toLowerCase() === 'true') return true;
  if (String(value).toLowerCase() === 'false') return false;
  return fallback;
}

function parseCuratorConfig(configText) {
  const section = topLevelSection(configText, 'curator');
  const backupMatch = section.match(/^  backup:\s*\n((?: {4}.*(?:\n|$))*)/m);
  const backup = backupMatch ? backupMatch[1] : '';
  const budgets = {};
  for (const name of REQUIRED_CONSOLIDATION_BUDGETS) {
    const value = scalar(section, name);
    budgets[name] = value === '' ? null : Number(value);
  }
  return {
    enabled: boolValue(scalar(section, 'enabled'), true),
    consolidate: boolValue(scalar(section, 'consolidate'), false),
    intervalHours: Number(scalar(section, 'interval_hours') || 168),
    backupEnabled: boolValue((backup.match(/^ {4}enabled:\s*([^\r\n#]+)/m) || [])[1], false),
    backupKeep: Number((backup.match(/^ {4}keep:\s*([^\r\n#]+)/m) || [])[1] || 0),
    budgets,
  };
}

function supportsHardBudgets(sourceText) {
  const source = String(sourceText || '');
  return REQUIRED_CONSOLIDATION_BUDGETS.every((name) => source.includes(name));
}

function buildAudit(evidence) {
  const config = parseCuratorConfig(evidence.configText);
  const state = evidence.state || {};
  const report = evidence.report || {};
  const pruneOnly = config.enabled && !config.consolidate;
  const toolCalls = Number(report.counts?.tool_calls_total || 0);
  const skippedConsolidation = /skipped\s*\(consolidation off\)/i.test(report.llm_summary || '');
  const noLlmIdentity = !report.model && !report.provider;
  const latestRunProvesNoLlm = Boolean(report.started_at)
    && skippedConsolidation
    && noLlmIdentity
    && toolCalls === 0;
  const budgetsConfigured = REQUIRED_CONSOLIDATION_BUDGETS.every((name) => (
    Number.isFinite(config.budgets[name]) && config.budgets[name] > 0
  ));
  const budgetEnforcementImplemented = supportsHardBudgets(evidence.sourceText);
  const qualityGate = evidence.qualityGate || {};
  const qualityValueProved = qualityGate.decision === 'allow'
    && qualityGate.candidateArtifactSha
    && qualityGate.fixtureCount > 0
    && qualityGate.regressions === 0;
  const consolidationAllowed = !config.consolidate || (
    budgetsConfigured && budgetEnforcementImplemented && qualityValueProved
  );
  const checks = {
    enabled: config.enabled,
    backupEnabled: config.backupEnabled,
    backupRetention: config.backupKeep > 0,
    latestReportReadable: Boolean(report.started_at),
    statePointsToReport: Boolean(state.last_report_path)
      && state.last_report_path === evidence.reportDir,
    configuredModeMatchesLatestRun: config.consolidate ? true : latestRunProvesNoLlm,
    consolidationAllowed,
  };
  const gaps = [];
  if (!checks.latestReportReadable) gaps.push('latest_run_report_missing');
  if (!checks.statePointsToReport) gaps.push('state_report_drift');
  if (!checks.configuredModeMatchesLatestRun) gaps.push('prune_only_not_proved');
  if (!checks.backupEnabled || !checks.backupRetention) gaps.push('backup_not_retained');
  if (config.consolidate && !budgetsConfigured) gaps.push('consolidation_budgets_missing');
  if (config.consolidate && !budgetEnforcementImplemented) gaps.push('consolidation_budgets_not_enforced');
  if (config.consolidate && !qualityValueProved) gaps.push('consolidation_value_not_proved');
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    schema: 'hermes/curator-value-audit-v1',
    checkedAt: evidence.checkedAt || new Date().toISOString(),
    healthy: gaps.length === 0,
    score: Math.round((passed / Object.keys(checks).length) * 100),
    mode: config.enabled ? (pruneOnly ? 'prune-only' : 'consolidation') : 'disabled',
    config,
    latestRun: {
      startedAt: report.started_at || null,
      durationSeconds: report.duration_seconds ?? null,
      toolCalls,
      model: report.model || null,
      provider: report.provider || null,
      summary: report.llm_summary || null,
      autoTransitions: report.auto_transitions || null,
    },
    checks,
    gaps,
    proofBoundary: {
      pruneOnlyNoLlmCalls: pruneOnly && latestRunProvesNoLlm,
      electricityMeasured: false,
      remoteProviderEnergyKnown: false,
      qualityGateRequiredForConsolidation: true,
    },
  };
}

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (_error) { return {}; }
}

function collect(options = {}) {
  const home = options.home || os.homedir();
  const configPath = options.configPath || path.join(home, '.hermes/config.yaml');
  const statePath = options.statePath || path.join(home, '.hermes/skills/.curator_state');
  const sourcePath = options.sourcePath || path.join(home, '.hermes/hermes-agent/agent/curator.py');
  const qualityGatePath = options.qualityGatePath
    || path.join(home, '.hermes/receipts/curator-eval/latest.json');
  const state = readJson(statePath);
  const reportDir = state.last_report_path || '';
  const report = reportDir ? readJson(path.join(reportDir, 'run.json')) : {};
  return buildAudit({
    configText: fs.readFileSync(configPath, 'utf8'),
    sourceText: fs.readFileSync(sourcePath, 'utf8'),
    state,
    report,
    reportDir,
    qualityGate: readJson(qualityGatePath),
  });
}

function main() {
  const receipt = collect();
  const receiptDir = process.env.HERMES_CURATOR_AUDIT_RECEIPT_DIR
    || path.join(os.homedir(), '.hermes/receipts/curator-value-audit');
  fs.mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(receiptDir, 'latest.json'), `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  process.exitCode = receipt.healthy ? 0 : 1;
}

if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`Curator value audit failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  REQUIRED_CONSOLIDATION_BUDGETS,
  buildAudit,
  collect,
  parseCuratorConfig,
  supportsHardBudgets,
  topLevelSection,
};
