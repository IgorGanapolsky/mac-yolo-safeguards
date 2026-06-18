#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const usage = `Usage:
  node tools/openmono-roi-audit.js [--repo path] [--json]

Audits the highest-ROI OpenMonoAgent-style controls for this repo: local-first
fallbacks, graph/RAG readiness, typed playbooks, sandbox/process protection,
operator-visible state, and live-probe throttling.`;

function parseArgs(argv) {
  const args = { repo: process.cwd(), json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  args.repo = path.resolve(args.repo);
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return '';
  }
}

function exists(repo, relativePath) {
  return fs.existsSync(path.join(repo, relativePath));
}

function addFinding(findings, severity, title, evidence, recommendation) {
  findings.push({ severity, title, evidence, recommendation });
}

function checkControl(findings, control) {
  if (control.ok) return;
  addFinding(findings, control.severity, control.title, control.evidence, control.recommendation);
}

function buildControls(repo, options = {}) {
  const productivityAudit = readText(path.join(repo, 'tools/hermes-productivity-audit.js'));
  const localInference = readText(path.join(repo, 'tools/local-inference-readiness.js'));
  const graphify = readText(path.join(repo, 'tools/graphify-readiness.js'));
  const governance = readText(path.join(repo, 'tools/hermes-governance-audit.js'));
  const decisionLoop = readText(path.join(repo, 'tools/hermes-decision-loop.js'));
  const ci = readText(path.join(repo, 'scripts/ci-verify.sh'));
  const openmonoDoc = readText(path.join(repo, 'docs/OPENMONO-ANTI-HALLUCINATION.md'));
  const testLiveGate = readText(path.join(repo, 'tests/test-hermes-productivity-audit-live-gate.js'));
  const graphBuilt = exists(repo, 'graphify-out/graph.json');

  return [
    {
      key: 'local-first-fallback',
      title: 'Local-first model fallback is auditable',
      ok: /fallback_providers/.test(localInference) && /127\.0\.0\.1:11434/.test(localInference),
      severity: 'high',
      evidence: 'tools/local-inference-readiness.js must verify configured fallbacks and local Ollama.',
      recommendation: 'Keep local inference readiness executable so cloud/provider outages do not silently block Hermes.',
    },
    {
      key: 'graph-rag-readiness',
      title: 'Graph/RAG readiness is executable',
      ok: /graphify-out/.test(graphify) && /query/.test(graphify) && graphBuilt,
      severity: 'medium',
      evidence: `graphify-out/graph.json present=${graphBuilt}; tools/graphify-readiness.js must expose query/build commands.`,
      recommendation: 'Build/update Graphify before broad repo reasoning and keep graph readiness in CI-adjacent tests.',
    },
    {
      key: 'typed-playbook-gate',
      title: 'Typed playbook and governance gates exist',
      ok: /sample-response/.test(governance) && /skool_browser_dm_dry_run/.test(governance) && /decision/.test(decisionLoop),
      severity: 'high',
      evidence: 'tools/hermes-governance-audit.js and tools/hermes-decision-loop.js must encode allowed/blocked behaviors.',
      recommendation: 'Convert recurring Hermes failures into deterministic gates instead of relying on prompt memory.',
    },
    {
      key: 'sandbox-process-protection',
      title: 'Sandbox/process protection is covered by E2E',
      ok: exists(repo, 'sim-runaway-guard.sh') && exists(repo, 'tests/test-secondary-browser-reclaim.sh') && /test-secondary-browser-reclaim/.test(ci),
      severity: 'high',
      evidence: 'sim-runaway-guard.sh and tests/test-secondary-browser-reclaim.sh must be present and invoked by scripts/ci-verify.sh.',
      recommendation: 'Keep runaway process and secondary-browser reclaim tests in the local CI mirror.',
    },
    {
      key: 'operator-visible-state',
      title: 'Operator-visible state and progress are audited',
      ok: /gateway_notify_interval/.test(governance) && /tool_progress/.test(governance) && /publicWebhookTest/.test(productivityAudit),
      severity: 'high',
      evidence: 'Governance and productivity audits must verify Telegram progress and webhook state.',
      recommendation: 'Keep Telegram progress cadence and webhook state in audits so Hermes does not appear stalled.',
    },
    {
      key: 'live-probe-throttling',
      title: 'Live probes are throttled and test-covered',
      ok: /LIVE_SMOKE_REUSE_MS/.test(productivityAudit) && /hasRecentLiveSuccess/.test(testLiveGate),
      severity: 'high',
      evidence: 'Live Telegram smoke/webhook probes must reuse recent proof instead of posting every run.',
      recommendation: 'Never run live operator-channel probes in tight loops without a reuse window and tests.',
    },
    {
      key: 'claim-verification-playbook',
      title: 'Claim verification playbook is documented',
      ok: /ship-claim/.test(openmonoDoc) && /scripts\/ci-verify\.sh/.test(openmonoDoc) && /ThumbGate/.test(openmonoDoc),
      severity: 'medium',
      evidence: 'docs/OPENMONO-ANTI-HALLUCINATION.md must name the local proof command and RAG capture loop.',
      recommendation: 'Keep completion claims routed through local proof plus ThumbGate learning.',
    },
    {
      key: 'memory-headroom',
      title: 'System RAM headroom is sufficient for local Qwen models',
      ok: (options.mockTotalMem || os.totalmem()) >= 32 * 1024 * 1024 * 1024,
      severity: 'medium',
      evidence: `totalmem=${Math.round((options.mockTotalMem || os.totalmem()) / (1024 * 1024 * 1024))} GB (OpenMonoAgent recommends 64 GB for stable 35B/27B local inference).`,
      recommendation: 'Ensure at least 32 GB RAM (64 GB recommended) for stable local LLM serving without system memory compressor thrashing.',
    },
  ];
}

function collect(options = {}) {
  const repo = path.resolve(options.repo || process.cwd());
  const controls = buildControls(repo, options);
  const findings = [];
  for (const control of controls) {
    checkControl(findings, control);
  }
  const passed = controls.filter((control) => control.ok).length;
  return {
    checkedAt: new Date().toISOString(),
    repo,
    score: Math.round((passed / controls.length) * 100),
    passed,
    total: controls.length,
    controls,
    findings,
  };
}

function render(report) {
  const lines = [
    '# OpenMono ROI Audit',
    '',
    `Repo: ${report.repo}`,
    `Score: ${report.score}/100 (${report.passed}/${report.total} controls)`,
    '',
    '## Controls',
    '',
  ];
  for (const control of report.controls) {
    lines.push(`- ${control.ok ? 'PASS' : 'FAIL'} ${control.key}: ${control.title}`);
  }
  if (report.findings.length > 0) {
    lines.push('', '## Findings', '');
    for (const finding of report.findings) {
      lines.push(`- ${finding.severity.toUpperCase()}: ${finding.title}`);
      lines.push(`  Evidence: ${finding.evidence}`);
      lines.push(`  Next: ${finding.recommendation}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }
  const report = collect(args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else process.stdout.write(render(report));
  if (report.findings.some((finding) => ['critical', 'high'].includes(finding.severity))) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(usage);
    process.exit(2);
  }
}

module.exports = {
  buildControls,
  collect,
  parseArgs,
  render,
};
