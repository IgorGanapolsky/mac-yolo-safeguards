#!/usr/bin/env node
'use strict';

/**
 * harness-smeval.js — Node twin of the smevals *architecture* (not the Python package).
 *
 * Decision: D-2026-08-03-eval-architecture.md
 * - offline: fixture tasks graded by ship-claim-gate + taste-gate (CI)
 * - live: LiteLLM configs × live-tasks → runs/ → same graders (HERMES_EVAL_LIVE=1)
 *
 * Usage:
 *   node tools/harness-smeval.js run [evals/ship-honesty] [--json]
 *   node tools/harness-smeval.js live [evals/ship-honesty] [--models glm-coding,kimi-code-fast] [--json]
 *   node tools/harness-smeval.js list [evals/ship-honesty]
 *
 * Exit 0 if offline expects match (run) or live completed without infra hard-fail (live).
 * Live grades models: higher honestyPassRate + tasteMean is better (report, not expect).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const {
  evaluateShipClaim,
  summarizeResults,
} = require('./ship-claim-gate');
const { scoreTaste } = require('./taste-gate');

const DEFAULT_LITELLM =
  process.env.HERMES_LITELLM_BASE || 'http://127.0.0.1:4010/v1';
const DEFAULT_KEY = process.env.HERMES_LITELLM_KEY || process.env.OPENAI_API_KEY || 'sk-local';

function mNeedsReasoningBudget(model) {
  const m = String(model || '').toLowerCase();
  return m.includes('kimi') || m.includes('o1') || m.includes('reason');
}

function parseArgs(argv) {
  const out = {
    cmd: 'run',
    evalDir: null,
    json: false,
    help: false,
    models: null,
    configs: null,
    write: true,
    timeoutMs: 60_000,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--no-write') out.write = false;
    else if (a === '--models') out.models = String(argv[++i] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    else if (a === '--configs') out.configs = String(argv[++i] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    else if (a === '--timeout-ms') out.timeoutMs = parseInt(argv[++i] || '60000', 10);
    else rest.push(a);
  }
  if (rest[0] && ['run', 'report', 'list', 'grade', 'live'].includes(rest[0])) {
    out.cmd = rest.shift();
  }
  out.evalDir = rest[0]
    ? path.resolve(rest[0])
    : path.join(ROOT, 'evals', 'ship-honesty');
  return out;
}

function loadJsonDir(dir, filter = (f) => f.endsWith('.json')) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(filter)
    .sort()
    .map((f) => {
      const full = path.join(dir, f);
      const obj = JSON.parse(fs.readFileSync(full, 'utf8'));
      obj._file = full;
      return obj;
    });
}

function loadEval(evalDir) {
  const metaPath = path.join(evalDir, 'eval.yaml');
  const metaRaw = fs.existsSync(metaPath) ? fs.readFileSync(metaPath, 'utf8') : '';
  const nameMatch = metaRaw.match(/^name:\s*(.+)$/m);
  const tasksDir = path.join(evalDir, 'tasks');
  if (!fs.existsSync(tasksDir)) {
    throw new Error(`No tasks/ under ${evalDir}`);
  }
  const tasks = loadJsonDir(tasksDir);
  const liveTasks = loadJsonDir(path.join(evalDir, 'live-tasks'));
  const configs = loadJsonDir(path.join(evalDir, 'configs'));
  return {
    name: nameMatch ? nameMatch[1].trim() : path.basename(evalDir),
    dir: evalDir,
    metaRaw,
    tasks,
    liveTasks,
    configs,
  };
}

/**
 * Grade one claim text + optional results (fixture or model output).
 */
function gradeClaim({ claim, domain = 'ship_status', results = null, device = null }) {
  const text = claim || '';
  if (domain === 'promo_social' || domain === 'outreach_email' || domain === 'product_ui') {
    const taste = scoreTaste(text, domain);
    return {
      grader: 'taste-gate',
      ok: taste.ok,
      score: taste.score,
      threshold: taste.threshold,
      code: taste.code,
      details: taste.dimensions,
      message: taste.message,
    };
  }
  const resultsSummary = results ? summarizeResults(results) : null;
  const ship = evaluateShipClaim({
    claim: text,
    resultsSummary,
    checkDevice: Boolean(device),
    device: device || null,
  });
  const taste = scoreTaste(text, 'ship_status');
  return {
    grader: 'ship-claim-gate+taste',
    ok: ship.ok,
    score: ship.ok ? 1 : 0,
    tasteScore: taste.score,
    code: ship.code,
    blocks: ship.blocks,
    warnings: ship.warnings,
    message: ship.ok ? 'ship ALLOW' : ship.blocks.join('; '),
  };
}

/**
 * Grade one offline fixture task. Pure enough for unit tests.
 */
function gradeTask(task) {
  const domain = task.domain || 'ship_status';
  const expect = String(task.expect || 'pass').toLowerCase();
  const claim = task.claim || task.text || task.output || '';
  const grade = gradeClaim({
    claim,
    domain,
    results: task.results || null,
    device: task.device || null,
  });

  const expectPass = expect === 'pass' || expect === 'allow';
  const expectFail = expect === 'fail' || expect === 'block';
  let matched = false;
  if (expectPass) matched = grade.ok === true;
  else if (expectFail) matched = grade.ok === false;

  return {
    task: task.name || path.basename(task._file || 'task', '.json'),
    domain,
    expect: expectPass ? 'pass' : 'fail',
    matched,
    grade,
    claimPreview: String(claim).slice(0, 120),
  };
}

function runEval(evalDir) {
  const ev = loadEval(evalDir);
  const results = ev.tasks.map(gradeTask);
  const pass = results.filter((r) => r.matched).length;
  const fail = results.filter((r) => !r.matched).length;
  return {
    ok: fail === 0 && results.length > 0,
    mode: 'offline',
    eval: ev.name,
    dir: ev.dir,
    total: results.length,
    pass,
    fail,
    results,
    message:
      fail === 0
        ? `harness-smeval PASS ${ev.name} ${pass}/${results.length}`
        : `harness-smeval FAIL ${ev.name} ${fail}/${results.length} mismatched expects`,
  };
}

function renderPrompt(task) {
  let p = String(task.prompt || '');
  if (task.results) {
    p = p.replace('{{results_json}}', JSON.stringify(task.results, null, 2));
  }
  return p;
}

/** Some fleet routes (kimi-code-fast) only accept temperature=1. */
function effectiveTemperature(model, temperature) {
  const m = String(model || '').toLowerCase();
  if (m.includes('kimi-code-fast') || m.includes('kimi-code-k3')) return 1;
  return typeof temperature === 'number' ? temperature : 0.2;
}

function extractMessageContent(message) {
  if (!message || typeof message !== 'object') return '';
  const content = message.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  // Reasoning models may put text only in reasoning_content (empty content)
  const reason = message.reasoning_content;
  if (typeof reason === 'string' && reason.trim()) {
    // Prefer last non-empty paragraph as "answer" if model never filled content
    const parts = reason
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts[parts.length - 1] || reason.trim();
  }
  return '';
}

function chatCompletion({
  base = DEFAULT_LITELLM,
  apiKey = DEFAULT_KEY,
  model,
  system,
  user,
  maxTokens = 400,
  temperature = 0.2,
  timeoutMs = 60_000,
}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    try {
      const url = new URL(`${base.replace(/\/$/, '')}/chat/completions`);
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: user });
      const temp = effectiveTemperature(model, temperature);
      // Kimi reasoning paths often spend tokens on reasoning_content
      const tokens = Math.max(maxTokens, mNeedsReasoningBudget(model) ? 800 : maxTokens);
      const body = JSON.stringify({
        model,
        messages,
        max_tokens: tokens,
        temperature: temp,
      });
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname + (url.search || ''),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode < 200 || res.statusCode >= 300) {
              finish({
                ok: false,
                error: `HTTP ${res.statusCode}`,
                raw: raw.slice(0, 500),
              });
              return;
            }
            try {
              const j = JSON.parse(raw);
              if (j.error) {
                finish({
                  ok: false,
                  error: j.error.message || JSON.stringify(j.error).slice(0, 200),
                  raw: raw.slice(0, 500),
                });
                return;
              }
              const msg = j.choices?.[0]?.message || {};
              const content =
                extractMessageContent(msg) ||
                (typeof j.choices?.[0]?.text === 'string' ? j.choices[0].text.trim() : '');
              finish({ ok: true, content: String(content).trim(), raw: j });
            } catch (e) {
              finish({ ok: false, error: `parse: ${e.message}`, raw: raw.slice(0, 500) });
            }
          });
        },
      );
      req.on('error', (err) => finish({ ok: false, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        finish({ ok: false, error: 'timeout' });
      });
      req.write(body);
      req.end();
    } catch (e) {
      finish({ ok: false, error: e.message });
    }
  });
}

function resolveConfigs(ev, args) {
  let configs = ev.configs.length
    ? ev.configs
    : [
        {
          name: 'default-glm',
          model: 'glm-coding',
          system: null,
          max_tokens: 400,
          temperature: 0.2,
        },
      ];
  if (args.configs?.length) {
    configs = configs.filter((c) => args.configs.includes(c.name));
  }
  if (args.models?.length) {
    // Expand: each model × each selected config system (or bare)
    const base =
      configs.length > 0
        ? configs
        : [{ name: 'bare', system: null, max_tokens: 400, temperature: 0.2 }];
    const expanded = [];
    for (const model of args.models) {
      for (const c of base) {
        expanded.push({
          ...c,
          name: `${c.name}__${model}`.replace(/[^a-zA-Z0-9._-]+/g, '-'),
          model,
        });
      }
    }
    // If --models alone with configs that already set models, prefer models override only
    if (args.configs?.length) {
      return expanded;
    }
    // default: one bare-style entry per model + honesty harness if present
    const honesty = configs.find((c) => /honesty/i.test(c.name));
    const out = [];
    for (const model of args.models) {
      out.push({
        name: `bare-${model}`,
        model,
        system: null,
        max_tokens: 400,
        temperature: 0.2,
      });
      if (honesty) {
        out.push({
          name: `honesty-${model}`,
          model,
          system: honesty.system,
          max_tokens: honesty.max_tokens || 400,
          temperature: honesty.temperature ?? 0.2,
        });
      }
    }
    return out;
  }
  return configs;
}

/**
 * Live multi-config compare via LiteLLM.
 */
async function runLiveEval(evalDir, args = {}) {
  const liveEnabled =
    process.env.HERMES_EVAL_LIVE === '1' ||
    process.env.HERMES_EVAL_LIVE === 'true' ||
    args.forceLive === true;
  if (!liveEnabled && !args.cmdIsLive) {
    return {
      ok: false,
      mode: 'live',
      skipped: true,
      message: 'Live eval disabled. Set HERMES_EVAL_LIVE=1 or use `live` command.',
    };
  }

  const ev = loadEval(evalDir);
  if (!ev.liveTasks.length) {
    return {
      ok: false,
      mode: 'live',
      message: `No live-tasks/ under ${evalDir}`,
    };
  }

  const configs = resolveConfigs(ev, args);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runsRoot = path.join(ev.dir, 'runs', stamp);
  if (args.write !== false) {
    fs.mkdirSync(runsRoot, { recursive: true });
  }

  const rows = [];
  for (const config of configs) {
    for (const task of ev.liveTasks) {
      const user = renderPrompt(task);
      const started = Date.now();
      const completion = await chatCompletion({
        model: config.model,
        system: config.system || null,
        user,
        maxTokens: config.max_tokens || 400,
        temperature: config.temperature ?? 0.2,
        timeoutMs: args.timeoutMs || 60_000,
      });
      const ms = Date.now() - started;
      let grade = null;
      let output = '';
      if (!completion.ok) {
        rows.push({
          task: task.name,
          config: config.name,
          model: config.model,
          infraOk: false,
          error: completion.error,
          ms,
          grade: null,
        });
        continue;
      }
      output = completion.content;
      grade = gradeClaim({
        claim: output,
        domain: task.domain || 'ship_status',
        results: task.results || null,
      });
      // goal: honesty_pass / taste_pass → success if grade.ok
      const goalMet = grade.ok === true;
      const row = {
        task: task.name,
        config: config.name,
        model: config.model,
        infraOk: true,
        ms,
        goalMet,
        grade,
        outputPreview: output.slice(0, 200),
      };
      rows.push(row);

      if (args.write !== false) {
        const runDir = path.join(
          runsRoot,
          task.name,
          config.name,
          String(config.model).replace(/[^\w.-]+/g, '_'),
        );
        fs.mkdirSync(runDir, { recursive: true });
        fs.writeFileSync(path.join(runDir, 'output.txt'), output);
        fs.writeFileSync(
          path.join(runDir, 'run.json'),
          JSON.stringify(
            {
              task: task.name,
              config: config.name,
              model: config.model,
              system: config.system,
              ms,
              grade,
              prompt: user,
            },
            null,
            2,
          ),
        );
      }
    }
  }

  // Leaderboard by config
  const byConfig = {};
  for (const r of rows) {
    const key = r.config;
    if (!byConfig[key]) {
      byConfig[key] = {
        config: key,
        model: r.model,
        n: 0,
        infraFail: 0,
        honestyPass: 0,
        tasteSum: 0,
        tasteN: 0,
      };
    }
    const b = byConfig[key];
    b.n += 1;
    if (!r.infraOk) b.infraFail += 1;
    else {
      if (r.goalMet) b.honestyPass += 1;
      const ts = r.grade?.tasteScore ?? r.grade?.score;
      if (typeof ts === 'number') {
        b.tasteSum += ts;
        b.tasteN += 1;
      }
    }
  }
  const leaderboard = Object.values(byConfig)
    .map((b) => {
      const graded = b.n - b.infraFail;
      return {
        config: b.config,
        model: b.model,
        infraFail: b.infraFail,
        honestyPassRate: graded > 0 ? b.honestyPass / graded : 0,
        tasteMean: b.tasteN > 0 ? b.tasteSum / b.tasteN : null,
        n: b.n,
        graded,
      };
    })
    .sort((a, b) => {
      if (b.honestyPassRate !== a.honestyPassRate) {
        return b.honestyPassRate - a.honestyPassRate;
      }
      return (b.tasteMean || 0) - (a.tasteMean || 0);
    });

  const infraFails = rows.filter((r) => !r.infraOk).length;
  const report = {
    ok: infraFails < rows.length, // at least some runs graded
    mode: 'live',
    eval: ev.name,
    runsDir: args.write !== false ? runsRoot : null,
    totalRuns: rows.length,
    infraFails,
    leaderboard,
    rows,
    message:
      leaderboard.length === 0
        ? 'live eval: no runs'
        : `live eval leaderboard: ${leaderboard
            .map(
              (l) =>
                `${l.config} honesty=${(l.honestyPassRate * 100).toFixed(0)}% taste=${
                  l.tasteMean != null ? l.tasteMean.toFixed(2) : 'n/a'
                }`,
            )
            .join(' | ')}`,
  };

  if (args.write !== false) {
    fs.writeFileSync(path.join(runsRoot, 'report.json'), JSON.stringify(report, null, 2));
  }
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`harness-smeval — Node run/grade suite (smevals architecture, our gates)

Offline (CI):
  node tools/harness-smeval.js run [evals/ship-honesty] [--json]

Live LiteLLM compare (not CI-blocking; uses flat-rate fleet):
  HERMES_EVAL_LIVE=1 node tools/harness-smeval.js live evals/ship-honesty \\
    --models glm-coding,kimi-code-fast [--json]
  node tools/harness-smeval.js live evals/ship-honesty --configs honesty-glm,honesty-kimi,bare

Env:
  HERMES_LITELLM_BASE  default http://127.0.0.1:4010/v1
  HERMES_LITELLM_KEY   default sk-local
  HERMES_EVAL_LIVE=1   allow live (or use live subcommand)

See docs/DECISIONS/D-2026-08-03-eval-architecture.md`);
    process.exit(0);
  }

  if (args.cmd === 'list') {
    const ev = loadEval(args.evalDir);
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            name: ev.name,
            tasks: ev.tasks.map((t) => t.name),
            liveTasks: ev.liveTasks.map((t) => t.name),
            configs: ev.configs.map((c) => c.name),
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`${ev.name}`);
      console.log(`  offline tasks (${ev.tasks.length}):`);
      for (const t of ev.tasks) {
        console.log(`    - ${t.name} expect=${t.expect} domain=${t.domain}`);
      }
      console.log(`  live tasks (${ev.liveTasks.length}):`);
      for (const t of ev.liveTasks) {
        console.log(`    - ${t.name} domain=${t.domain}`);
      }
      console.log(`  configs (${ev.configs.length}):`);
      for (const c of ev.configs) {
        console.log(`    - ${c.name} model=${c.model}`);
      }
    }
    process.exit(0);
  }

  if (args.cmd === 'live') {
    const report = await runLiveEval(args.evalDir, {
      ...args,
      cmdIsLive: true,
      forceLive: true,
    });
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(report.message);
      if (report.leaderboard) {
        console.log('Leaderboard (honesty pass rate, then taste):');
        for (const l of report.leaderboard) {
          console.log(
            `  ${l.config}\tmodel=${l.model}\thonesty=${(l.honestyPassRate * 100).toFixed(
              0,
            )}%\ttaste=${l.tasteMean != null ? l.tasteMean.toFixed(2) : 'n/a'}\tinfraFail=${l.infraFail}`,
          );
        }
      }
      if (report.runsDir) console.log(`Runs: ${report.runsDir}`);
      for (const r of report.rows || []) {
        if (!r.infraOk) {
          console.log(`  INFRA ${r.config}/${r.task}: ${r.error}`);
        } else {
          console.log(
            `  ${r.goalMet ? 'PASS' : 'FAIL'} ${r.config}/${r.task} (${r.ms}ms) ${
              r.outputPreview?.slice(0, 80) || ''
            }`,
          );
        }
      }
    }
    process.exit(report.ok ? 0 : 1);
  }

  // run | report | grade → offline
  const report = runEval(args.evalDir);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(report.message);
    for (const r of report.results) {
      const mark = r.matched ? 'OK  ' : 'MISS';
      console.log(
        `  ${mark} ${r.task} expect=${r.expect} graded=${r.grade.ok ? 'pass' : 'fail'} (${r.grade.grader})`,
      );
      if (!r.matched) {
        console.log(`       ${r.grade.message || r.grade.code}`);
      }
    }
  }
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  loadEval,
  gradeTask,
  gradeClaim,
  runEval,
  runLiveEval,
  parseArgs,
  chatCompletion,
  renderPrompt,
};

if (require.main === module) {
  main().catch((e) => {
    console.error('harness-smeval error:', e.message || e);
    process.exit(2);
  });
}
