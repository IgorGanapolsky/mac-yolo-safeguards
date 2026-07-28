#!/usr/bin/env node
'use strict';

/**
 * Automated maturity scorecard for the five AI system pillars.
 * Runs structural + offline eval gates (no live secrets required for default mode).
 *
 *   node tools/system-maturity-scorecard.js
 *   node tools/system-maturity-scorecard.js --json
 *   node tools/system-maturity-scorecard.js --strict   # exit 1 if any pillar < 3.5
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

function exists(rel) {
  return fs.existsSync(path.join(REPO, rel));
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(REPO, rel), 'utf8');
  } catch {
    return '';
  }
}

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(REPO, script), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function scorePillar(id, label, checks) {
  const results = checks.map((c) => {
    let pass = false;
    let detail = '';
    try {
      const out = c.check();
      pass = Boolean(out.pass);
      detail = out.detail || '';
    } catch (error) {
      pass = false;
      detail = error instanceof Error ? error.message : String(error);
    }
    return { id: c.id, pass, detail, weight: c.weight || 1 };
  });
  const weightSum = results.reduce((s, r) => s + r.weight, 0) || 1;
  const earned = results.reduce((s, r) => s + (r.pass ? r.weight : 0), 0);
  const score = Number(((earned / weightSum) * 5).toFixed(2));
  return { id, label, score, max: 5, checks: results };
}

function buildReport() {
  const rag = scorePillar('rag', 'RAG system', [
    {
      id: 'retrieval-harness',
      weight: 1,
      check: () => ({
        pass: exists('tools/hermes-retrieval-harness.js'),
        detail: 'tools/hermes-retrieval-harness.js',
      }),
    },
    {
      id: 'retrieval-eval',
      weight: 2,
      check: () => {
        const run = runNode('tools/rag-retrieval-eval.js', ['--json']);
        let mean = 0;
        try {
          mean = JSON.parse(run.stdout).meanRecallAtK || 0;
        } catch {
          /* ignore */
        }
        return {
          pass: run.ok,
          detail: run.ok ? `meanRecallAtK=${mean}` : (run.stderr || run.stdout).slice(0, 200),
        };
      },
    },
    {
      id: 'lessons-api',
      weight: 1,
      check: () => ({
        pass: exists('apps/hermes-control-plane/app/api/lessons/route.ts'),
        detail: 'control-plane lessons API',
      }),
    },
    {
      id: 'agents-recall-protocol',
      weight: 1,
      check: () => {
        const text = read('AGENTS.md');
        return {
          pass: text.includes('mcp__thumbgate__recall') && text.includes('capture_memory_feedback'),
          detail: 'AGENTS.md recall/capture protocol',
        };
      },
    },
  ]);

  const agentTools = scorePillar('agent_tools', 'Agent with tools', [
    {
      id: 'cloud-connector',
      weight: 1,
      check: () => ({
        pass: exists('tools/hermes-cloud-connector.js'),
        detail: 'hermes-cloud-connector.js',
      }),
    },
    {
      id: 'task-leases',
      weight: 1,
      check: () => ({
        pass: exists('apps/hermes-control-plane/lib/task-leases.ts') || read('apps/hermes-control-plane/app/api/tasks/route.ts').includes('lease'),
        detail: 'task lease / create path',
      }),
    },
    {
      id: 'cloud-tool-policy',
      weight: 1,
      check: () => ({
        pass: exists('apps/hermes-control-plane/lib/cloud-tool-policy.ts'),
        detail: 'cloud-tool-policy.ts',
      }),
    },
    {
      id: 'session-contract',
      weight: 1,
      check: () => {
        const text = read('tools/agent-swarm-harness.js');
        // SessionContract/effort may land as named exports or role+SDD guidance on main.
        const hasNamed =
          text.includes('sessionContract') || text.includes('SessionContract');
        const hasEffort = text.includes('effortPolicy') || text.includes('effort-policy');
        const hasRoleSdd =
          text.includes('planner') &&
          text.includes('worker') &&
          text.includes('specificationDrivenDesign');
        return {
          pass: (hasNamed && hasEffort) || hasRoleSdd,
          detail: 'swarm role split + SDD (or SessionContract/effort when present)',
        };
      },
    },
    {
      id: 'trace-id',
      weight: 1,
      check: () => {
        const text = read('apps/hermes-control-plane/app/api/tasks/route.ts');
        return {
          pass: text.includes('traceId'),
          detail: 'task create returns/logs traceId',
        };
      },
    },
  ]);

  const multiAgent = scorePillar('multi_agent', 'Multi-agent workflow', [
    {
      id: 'swarm-harness',
      weight: 2,
      check: () => ({
        pass: exists('tools/agent-swarm-harness.js') && exists('docs/AGENT-SWARM-HARNESS.md'),
        detail: 'swarm harness + docs',
      }),
    },
    {
      id: 'plan-md',
      weight: 1,
      check: () => ({
        pass: exists('plan.md'),
        detail: 'plan.md coordination board',
      }),
    },
    {
      id: 'field-guide',
      weight: 1,
      check: () => ({
        pass: exists('docs/agent-field-guide/index.md'),
        detail: 'agent field guide',
      }),
    },
    {
      id: 'session-start',
      weight: 1,
      check: () => ({
        pass: exists('tools/agent-session-start.js'),
        detail: 'agent-session-start.js',
      }),
    },
  ]);

  const mcp = scorePillar('mcp', 'MCP-based integration', [
    {
      id: 'mcp-json',
      weight: 1,
      check: () => ({ pass: exists('.mcp.json'), detail: '.mcp.json present' }),
    },
    {
      id: 'mcp-health',
      weight: 2,
      check: () => {
        const run = runNode('tools/mcp-health-check.js', ['--json']);
        return {
          pass: run.ok,
          detail: run.ok ? 'structural health pass' : (run.stderr || run.stdout).slice(0, 200),
        };
      },
    },
    {
      id: 'mcp-inventory-doc',
      weight: 1,
      check: () => ({
        pass: exists('docs/MCP-INVENTORY.md'),
        detail: 'docs/MCP-INVENTORY.md',
      }),
    },
    {
      id: 'mcp-github-context7',
      weight: 1,
      check: () => {
        const text = read('.mcp.json');
        return {
          pass: text.includes('"github"') && text.includes('context7'),
          detail: 'github + context7 servers configured',
        };
      },
    },
  ]);

  const prod = scorePillar('production_eval', 'Production AI + eval/observability', [
    {
      id: 'observability-gate-tool',
      weight: 1,
      check: () => ({
        pass: exists('tools/hermes-observability-gate.js'),
        detail: 'hermes-observability-gate.js',
      }),
    },
    {
      id: 'observability-device-proof',
      weight: 2,
      check: () => {
        const run = runNode('tools/hermes-observability-gate.js', [
          '--mode',
          'status',
          '--json',
        ]);
        let result = null;
        try {
          result = JSON.parse(run.stdout);
        } catch {
          /* reported below */
        }
        const e2e = result?.metrics?.e2e || 'unreadable';
        const ageMin = result?.metrics?.proofAgeMin;
        return {
          pass: run.ok && result?.pass === true && result?.deviceVerified === true,
          detail:
            `e2e=${e2e}` +
            (Number.isFinite(ageMin) ? ` ageMin=${ageMin}` : '') +
            (result?.deviceVerified === true ? ' deviceVerified=true' : ' deviceVerified=false'),
        };
      },
    },
    {
      id: 'harness-eval',
      weight: 1,
      check: () => ({
        pass: exists('tools/hermes-harness-eval.js'),
        detail: 'hermes-harness-eval.js',
      }),
    },
    {
      id: 'portal-get',
      weight: 1,
      check: () => {
        const text = read('apps/hermes-control-plane/app/api/billing/portal/route.ts');
        return {
          pass: /export async function GET/.test(text),
          detail: 'billing portal supports GET (landing manage link)',
        };
      },
    },
    {
      id: 'lessons-filters',
      weight: 1,
      check: () => {
        const lessons = read('apps/hermes-control-plane/app/dashboard/lessons/LessonsClient.tsx');
        return {
          pass:
            lessons.includes('filter=completed') &&
            lessons.includes('filter=unrated') &&
            lessons.includes('ready to rate'),
          detail: 'lessons activity deep-links + clear unrated copy',
        };
      },
    },
    {
      id: 'dashboard-task-filter',
      weight: 1,
      check: () => {
        const dash = read('apps/hermes-control-plane/app/dashboard/DashboardClient.tsx');
        return {
          pass: dash.includes('taskFilter') && dash.includes("filter") && dash.includes('unrated'),
          detail: 'dashboard honors ?filter=completed|unrated',
        };
      },
    },
    {
      id: 'maturity-docs',
      weight: 0.5,
      check: () => ({
        pass: exists('docs/SYSTEM-MATURITY.md'),
        detail: 'docs/SYSTEM-MATURITY.md',
      }),
    },
  ]);

  const mlStack = scorePillar('ml_stack', 'ML platform July 2026 (fail-closed)', [
    {
      id: 'label-store',
      weight: 1,
      check: () => ({
        pass: exists('tools/ml-label-store.js'),
        detail: 'tools/ml-label-store.js',
      }),
    },
    {
      id: 'ml-core-metrics',
      weight: 1,
      check: () => ({
        pass: exists('tools/ml-core.js'),
        detail: 'AUC/Brier/CV/calibration/nDCG/A-B tests',
      }),
    },
    {
      id: 'propensity-train',
      weight: 2,
      check: () => {
        const run = runNode('tools/ml-propensity-train.js', [
          'train',
          '--labels',
          'tests/fixtures/ml/synthetic-labels.jsonl',
          '--out',
          path.join(require('os').tmpdir(), `ml-propensity-scorecard-${process.pid}.json`),
          '--json',
        ]);
        let body = null;
        try {
          body = JSON.parse(run.stdout);
        } catch {
          /* below */
        }
        return {
          pass: Boolean(
            body &&
              body.trained === true &&
              body.ok === true &&
              body.holdout_metrics?.brier != null &&
              body.cv?.mean_auc != null,
          ),
          detail: body
            ? `auc=${body.holdout_metrics?.auc} brier=${body.holdout_metrics?.brier} cv=${body.cv?.mean_auc}`
            : (run.stderr || run.stdout).slice(0, 180),
        };
      },
    },
    {
      id: 'insufficient-labels-fail-closed',
      weight: 2,
      check: () => {
        const empty = path.join(require('os').tmpdir(), `ml-empty-labels-${process.pid}.jsonl`);
        fs.writeFileSync(empty, '');
        const run = runNode('tools/ml-propensity-train.js', [
          'train',
          '--labels',
          empty,
          '--out',
          path.join(require('os').tmpdir(), `ml-propensity-empty-${process.pid}.json`),
          '--json',
        ]);
        let body = null;
        try {
          body = JSON.parse(run.stdout);
        } catch {
          /* below */
        }
        return {
          pass: Boolean(body && body.trained === false && body.status === 'insufficient_labels'),
          detail: body ? body.status : (run.stderr || run.stdout).slice(0, 180),
        };
      },
    },
    {
      id: 'registry-serve-experiment-gate',
      weight: 1.5,
      check: () => ({
        pass:
          exists('tools/ml-registry.js') &&
          exists('tools/ml-serve.js') &&
          exists('tools/ml-experiment.js') &&
          exists('tools/ml-gate.js'),
        detail: 'registry + serve + experiment + gate',
      }),
    },
    {
      id: 'system-scores',
      weight: 1,
      check: () => ({
        pass: exists('tools/ml-system-scores.js'),
        detail: 'tools/ml-system-scores.js',
      }),
    },
    {
      id: 'ml-docs',
      weight: 0.5,
      check: () => ({
        pass: exists('docs/ML-STACK-JULY-2026.md') || exists('docs/ML-BEST-IN-CLASS-JULY-2026.md'),
        detail: 'ML docs',
      }),
    },
  ]);

  const pillars = [rag, agentTools, multiAgent, mcp, prod, mlStack];
  const overall = Number(
    (pillars.reduce((s, p) => s + p.score, 0) / pillars.length).toFixed(2),
  );
  return {
    ok: pillars.every((p) => p.score >= 3.5),
    overall,
    generatedAt: new Date().toISOString(),
    pillars,
    targets: {
      note: 'Target ≥ 4.0 overall with no pillar below 3.5 for founder-scale "proper" claim',
      overallMin: 3.5,
      pillarMin: 3.5,
    },
  };
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const strict = argv.includes('--strict');
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node tools/system-maturity-scorecard.js [--json] [--strict]');
    process.exit(0);
  }
  const report = buildReport();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`System maturity overall: ${report.overall}/5`);
    for (const p of report.pillars) {
      console.log(`\n## ${p.label}: ${p.score}/5`);
      for (const c of p.checks) {
        console.log(`  ${c.pass ? '✓' : '✗'} ${c.id}${c.detail ? ` — ${c.detail}` : ''}`);
      }
    }
    console.log(`\n${report.ok ? 'PASS' : 'BELOW TARGET'} (pillar min ${report.targets.pillarMin})`);
  }
  if (strict && !report.ok) process.exit(1);
  process.exit(0);
}

if (require.main === module) main();

module.exports = { buildReport };
