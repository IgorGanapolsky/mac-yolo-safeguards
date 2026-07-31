#!/usr/bin/env node
'use strict';

/**
 * Retire high-volume DEAD experts and rewire Hermes defaults off them.
 *
 * A+ production MoE requires: no *active* dead primary. Historical traffic still
 * shows glm-5.2 DEAD for ~7d; retiring marks them non-gating while defaults move
 * to a smoke-proven healthy alias (default: kimi-code-fast).
 *
 *   node tools/moe-retire-dead-experts.js --dry-run --json
 *   node tools/moe-retire-dead-experts.js --apply --primary kimi-code-fast --json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { loadExpertHealth } = require('./moe-expert-health');

const RETIRED_PATH = path.join(os.homedir(), '.hermes', 'retired-experts.json');
const CONFIG_PATH = path.join(os.homedir(), '.hermes', 'config.yaml');
const DEFAULT_PRIMARY = 'kimi-code-fast';

function parseArgs(argv) {
  const args = {
    apply: false,
    json: false,
    primary: DEFAULT_PRIMARY,
    smoke: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--json') args.json = true;
    else if (a === '--primary') args.primary = argv[++i] || DEFAULT_PRIMARY;
    else if (a === '--no-smoke') args.smoke = false;
    else if (a === '--help') args.help = true;
    else throw new Error(`Unknown ${a}`);
  }
  return args;
}

function readRetired() {
  try {
    return JSON.parse(fs.readFileSync(RETIRED_PATH, 'utf8'));
  } catch {
    return { models: [], retiredAt: null, reason: null };
  }
}

const SMOKE_MARKER = 'SMOKE_OK';

/** Pure check used by smokeModel — unit-tested without the live gateway. */
function acceptsSmokeResponse(message = {}) {
  const content = String(message.content || '').trim();
  const reasoning = String(message.reasoning_content || '').trim();
  const haystack = `${content}\n${reasoning}`;
  return {
    ok: haystack.includes(SMOKE_MARKER),
    content: (content || reasoning).slice(0, 80),
  };
}

function smokeModel(model) {
  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: `Reply with exactly one token: ${SMOKE_MARKER}` }],
    max_tokens: 32,
  });
  // Retry once: gateway occasionally returns litellm.Timeout on first call.
  let last = { ok: false, error: 'no attempt' };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const r = spawnSync(
      'curl',
      [
        '-sS',
        '--max-time',
        '60',
        'http://127.0.0.1:4010/v1/chat/completions',
        '-H',
        'Content-Type: application/json',
        '-d',
        body,
      ],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) {
      last = { ok: false, error: (r.stderr || r.stdout || 'curl failed').slice(0, 200) };
      continue;
    }
    try {
      const j = JSON.parse(r.stdout);
      if (j.error) {
        last = { ok: false, error: JSON.stringify(j.error).slice(0, 200) };
        continue;
      }
      const msg = j?.choices?.[0]?.message || {};
      const checked = acceptsSmokeResponse(msg);
      last = {
        ok: checked.ok,
        content: checked.content,
        servedModel: j.model || model,
        attempt: attempt + 1,
        marker: SMOKE_MARKER,
      };
      if (checked.ok) return last;
      last = {
        ok: false,
        error: `missing ${SMOKE_MARKER} marker in content/reasoning: ${(checked.content || '(empty)').slice(0, 120)}`,
        attempt: attempt + 1,
      };
    } catch {
      last = { ok: false, error: (r.stdout || '').slice(0, 200) };
    }
  }
  return last;
}

function rewireConfig(configPath, primary) {
  if (!fs.existsSync(configPath)) {
    return { ok: false, error: `config missing: ${configPath}` };
  }
  const bak = `${configPath}.bak-moe-retire-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const original = fs.readFileSync(configPath, 'utf8');
  fs.copyFileSync(configPath, bak);

  let text = original;
  // Top-level model.default / model.model under model: block (first occurrence pair)
  text = text.replace(
    /(^model:\n(?:  .*\n)*?  default: )([^\n]+)/m,
    `$1${primary}`,
  );
  // Only the first `  model: xxx` under top-level model: is tricky; do explicit lines at start
  text = text.replace(/^  default: glm-coding$/m, `  default: ${primary}`);
  text = text.replace(/^  model: glm-coding$/m, `  model: ${primary}`);
  text = text.replace(/^  default: glm-5\.2$/m, `  default: ${primary}`);
  text = text.replace(/^  model: glm-5\.2$/m, `  model: ${primary}`);

  // litellm-gateway block defaults
  text = text.replace(
    /(litellm-gateway:[\s\S]*?default_model: )([^\n]+)/,
    `$1${primary}`,
  );
  text = text.replace(
    /(litellm-gateway:[\s\S]*?^    model: )([^\n]+)/m,
    `$1${primary}`,
  );

  // Safety: if still glm-coding at file top model section
  if (/^model:\n(?:  .*\n)*?  default: glm-/m.test(text)) {
    text = text.replace(/(^model:\n  ollama_num_ctx:.*\n  max_tokens:.*\n  provider:.*\n  default: )([^\n]+)/m, `$1${primary}`);
    text = text.replace(/(^model:\n(?:  .*\n)*?  model: )(glm-[^\n]+)/m, `$1${primary}`);
  }

  fs.writeFileSync(configPath, text);
  return {
    ok: true,
    backupPath: bak,
    changed: original !== text,
    primary,
  };
}

function run(options = {}) {
  const apply = Boolean(options.apply);
  const primary = options.primary || DEFAULT_PRIMARY;
  const health = loadExpertHealth({});
  const report = {
    checkedAt: new Date().toISOString(),
    apply,
    primary,
    retiredPath: RETIRED_PATH,
    configPath: CONFIG_PATH,
    ok: false,
  };

  if (!health.ok) {
    report.error = health.error || 'expert health unavailable';
    return report;
  }

  const dead = (health.highVolumeDead || []).map((d) => d.model);
  // Always retire known zombies even if window later clears partially
  const toRetire = [...new Set([...dead, 'glm-5.2', 'glm-coding'])];
  report.detectedDead = dead;
  report.toRetire = toRetire;

  let smoke = null;
  if (options.smoke !== false) {
    smoke = smokeModel(primary);
    report.primarySmoke = smoke;
    if (!smoke.ok) {
      report.error = `primary smoke failed for ${primary}: ${smoke.error}`;
      return report;
    }
  }

  const prev = readRetired();
  const next = {
    models: [...new Set([...(prev.models || []), ...toRetire])].sort(),
    retiredAt: new Date().toISOString(),
    reason: 'high-volume DEAD in traffic (empty/no-answer); rewired default off these aliases',
    primary,
    previousPrimary: prev.primary || null,
  };
  report.retired = next;

  if (!apply) {
    report.note = 'dry-run; pass --apply to write retired-experts.json and rewire config.yaml';
    report.ok = Boolean(smoke?.ok !== false);
    return report;
  }

  // Rewire first — never publish retired-experts.json if config is still on a dead default.
  // (Codex P1: write-before-rewire left gates green while defaults stayed broken.)
  const rewire = rewireConfig(CONFIG_PATH, primary);
  report.rewire = rewire;
  if (!rewire.ok) {
    report.error = rewire.error || 'config rewire failed';
    report.ok = false;
    return report;
  }

  fs.mkdirSync(path.dirname(RETIRED_PATH), { recursive: true });
  fs.writeFileSync(RETIRED_PATH, `${JSON.stringify(next, null, 2)}\n`);
  report.ok = true;
  if (!rewire.changed) {
    report.note = 'config already pointed at primary or patterns unmatched — retired list written after rewire ok';
  }
  return report;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(
        'Usage: node tools/moe-retire-dead-experts.js [--apply] [--primary kimi-code-fast] [--json]',
      );
      process.exit(0);
    }
    const report = run(args);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`moe-retire: ${report.ok ? 'OK' : 'FAIL'} apply=${args.apply} primary=${args.primary}`);
      console.log(`  retire: ${(report.toRetire || []).join(', ')}`);
      if (report.primarySmoke) console.log(`  smoke: ${report.primarySmoke.ok} ${report.primarySmoke.content || report.primarySmoke.error || ''}`);
      if (report.rewire) console.log(`  rewire changed=${report.rewire.changed} bak=${report.rewire.backupPath || ''}`);
      if (report.error) console.error(`  error: ${report.error}`);
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = {
  run,
  rewireConfig,
  smokeModel,
  acceptsSmokeResponse,
  SMOKE_MARKER,
  RETIRED_PATH,
  DEFAULT_PRIMARY,
};
