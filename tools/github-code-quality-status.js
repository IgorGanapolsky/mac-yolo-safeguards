#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');

const DEFAULT_REPO = 'IgorGanapolsky/mac-yolo-safeguards';

function parseArgs(argv) {
  const args = { json: false, repo: process.env.GITHUB_REPOSITORY || DEFAULT_REPO };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') {
      args.json = true;
    } else if (token === '--repo' && argv[i + 1]) {
      args.repo = argv[++i];
    }
  }
  return args;
}

function ghApi(path, repo) {
  try {
    const stdout = execFileSync(
      'gh',
      ['api', `repos/${repo}/${path}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return JSON.parse(stdout);
  } catch (error) {
    const stderr = error.stderr?.toString().trim() || error.message;
    const statusMatch = stderr.match(/\(HTTP (\d+)\)/);
    return {
      error: stderr.split('\n')[0],
      httpStatus: statusMatch ? Number(statusMatch[1]) : null,
    };
  }
}

function summarizeCodeQualitySetup(setup) {
  if (setup.error) {
    return {
      enabled: false,
      state: 'unavailable',
      detail: setup.error,
      httpStatus: setup.httpStatus,
    };
  }
  return {
    enabled: setup.state === 'configured',
    state: setup.state,
    languages: setup.languages || [],
    schedule: setup.schedule || null,
    updatedAt: setup.updated_at || null,
  };
}

function summarizeRulesets(rulesets) {
  if (rulesets.error) {
    return { count: 0, evaluateCoverageRulesets: [], error: rulesets.error };
  }
  const list = Array.isArray(rulesets) ? rulesets : [];
  const evaluateCoverageRulesets = list
    .filter(
      (ruleset) =>
        ruleset.enforcement === 'evaluate' &&
        Array.isArray(ruleset.rules) &&
        ruleset.rules.some((rule) => rule.type === 'code_coverage'),
    )
    .map((ruleset) => ({ id: ruleset.id, name: ruleset.name, enforcement: ruleset.enforcement }));
  return { count: list.length, evaluateCoverageRulesets };
}

function buildReport(repo) {
  const setup = ghApi('code-quality/setup', repo);
  const rulesets = ghApi('rulesets', repo);
  const findings = ghApi('code-quality/findings?per_page=1', repo);

  const codeQuality = summarizeCodeQualitySetup(setup);
  const rulesetSummary = summarizeRulesets(rulesets);
  const openFindings =
    findings && !findings.error && Array.isArray(findings) ? findings.length : null;

  return {
    repo,
    checkedAt: new Date().toISOString(),
    codeQuality,
    rulesets: rulesetSummary,
    sampleFindingsReturned: openFindings,
    coberturaPath: 'hermes-mobile/coverage/cobertura-coverage.xml',
    recommendedGateMode: 'evaluate',
    costGuardrails:
      'Code Quality is paid (~$10/active committer/month + metered AI). Keep evaluate mode until stable; disable when unused. Bots are not committers; Actions compute still bills.',
  };
}

function printReport(report) {
  console.log(`GitHub Code Quality status for ${report.repo}`);
  console.log(`Checked: ${report.checkedAt}`);
  console.log(
    `Code Quality product: ${report.codeQuality.enabled ? 'enabled' : 'not enabled'} (${report.codeQuality.state})`,
  );
  if (report.codeQuality.detail) {
    console.log(`  detail: ${report.codeQuality.detail}`);
  }
  console.log(`Cobertura path (CI): ${report.coberturaPath}`);
  console.log(`Rulesets: ${report.rulesets.count} total`);
  if (report.rulesets.evaluateCoverageRulesets.length > 0) {
    console.log(
      `  evaluate coverage rulesets: ${report.rulesets.evaluateCoverageRulesets
        .map((ruleset) => ruleset.name)
        .join(', ')}`,
    );
  } else {
    console.log('  evaluate coverage rulesets: none (import .github/code-quality-coverage-ruleset.evaluate.json)');
  }
  console.log(`Recommended gate mode: ${report.recommendedGateMode}`);
  console.log(`Cost guardrails: ${report.costGuardrails}`);
}

function main() {
  const args = parseArgs(process.argv);
  const report = buildReport(args.repo);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printReport(report);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_REPO,
  buildReport,
  ghApi,
  parseArgs,
  summarizeCodeQualitySetup,
  summarizeRulesets,
};
