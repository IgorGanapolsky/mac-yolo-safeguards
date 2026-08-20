#!/usr/bin/env node
'use strict';

/**
 * Island Vibe Publishing steal (local fleet ops).
 *
 * Source: https://www.island.io/ai — vibe-coded apps should arrive with
 * identity, data protection, private access, and an audit trail — not a
 * bare "npm run deploy" hope.
 *
 * What we implement: a deploy-confidence gate that emits a say-yes receipt
 * before Cloudflare / control-plane publish. Wraps existing
 * `scripts/deploy-cloudflare-with-lock.sh` semantics (lock check + HEAD truth).
 *
 * What this is NOT: Island's hosted vibe-publish product, SSO broker, or a
 * replacement for the deploy lock script.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const SOURCE = 'https://www.island.io/ai/enterprise-vibe-publishing';
const DEFAULT_THRESHOLD = 0.75;

function parseArgs(argv) {
  const args = {
    json: false,
    help: false,
    threshold: DEFAULT_THRESHOLD,
    checkLock: true,
    requireClean: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--threshold') args.threshold = Number(argv[++i]);
    else if (a === '--skip-lock') args.checkLock = false;
    else if (a === '--allow-dirty') args.requireClean = false;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!(args.threshold >= 0 && args.threshold <= 1)) {
    throw new Error('--threshold must be between 0 and 1');
  }
  return args;
}

function git(repo, args) {
  const result = spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    timeout: 15000,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function checkDeployLock(repo = REPO) {
  const script = path.join(repo, 'scripts', 'deploy-cloudflare-with-lock.sh');
  if (!fs.existsSync(script)) {
    return { ok: false, locked: null, detail: 'deploy-cloudflare-with-lock.sh missing' };
  }
  const result = spawnSync('bash', [script, '--status'], {
    encoding: 'utf8',
    timeout: 30000,
    cwd: repo,
  });
  const out = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (result.status === 0 && /UNLOCKED/i.test(out)) {
    return { ok: true, locked: false, detail: out || 'UNLOCKED' };
  }
  if (result.status === 1 && /LOCKED/i.test(out)) {
    return { ok: false, locked: true, detail: out };
  }
  // gh/network flake → treat as unknown, not a free pass
  return { ok: false, locked: null, detail: out || `lock-status-exit-${result.status}` };
}

function evaluateVibePublish(options = {}) {
  const repo = options.repo || REPO;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const requireClean = options.requireClean !== false;
  const checkLock = options.checkLock !== false;
  const now = options.now || new Date();
  const factors = [];

  const head = git(repo, ['rev-parse', 'HEAD']);
  const sha = head.ok ? head.stdout : null;
  factors.push({
    id: 'local_head',
    weight: 0.2,
    pass: Boolean(sha),
    detail: sha ? sha.slice(0, 12) : head.stderr || 'no HEAD',
  });

  const porcelain = git(repo, ['status', '--porcelain']);
  const dirty = porcelain.ok && porcelain.stdout.length > 0;
  factors.push({
    id: 'worktree_clean',
    weight: 0.2,
    pass: requireClean ? !dirty : true,
    detail: dirty ? `dirty:${porcelain.stdout.split('\n').length}_paths` : 'clean',
  });

  const onMain = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = onMain.ok ? onMain.stdout : 'unknown';
  const mainish = branch === 'main' || branch === 'master';
  factors.push({
    id: 'branch_is_main',
    weight: 0.15,
    pass: mainish,
    detail: branch,
  });

  // Prove HEAD is not behind origin/main when that ref exists.
  const originMain = git(repo, ['rev-parse', 'origin/main']);
  let containsMain = false;
  if (originMain.ok && sha) {
    const mergeBase = git(repo, ['merge-base', '--is-ancestor', 'origin/main', sha]);
    containsMain = mergeBase.status === 0;
  }
  factors.push({
    id: 'contains_origin_main',
    weight: 0.2,
    pass: originMain.ok ? containsMain : false,
    detail: originMain.ok
      ? containsMain
        ? 'HEAD contains origin/main'
        : 'HEAD missing origin/main commits'
      : 'origin/main missing',
  });

  let lock;
  if (checkLock) {
    lock = typeof options.lockProbe === 'function' ? options.lockProbe(repo) : checkDeployLock(repo);
  } else {
    lock = { ok: true, locked: false, detail: 'skipped' };
  }
  factors.push({
    id: 'deploy_lock_free',
    weight: 0.25,
    pass: lock.ok === true && lock.locked === false,
    detail: lock.detail,
  });

  const confidence = Number(
    factors.reduce((sum, f) => sum + (f.pass ? f.weight : 0), 0).toFixed(4),
  );
  const allowed = confidence >= threshold && factors.every((f) => f.pass || f.id === 'branch_is_main');
  // branch_is_main is soft: feature worktrees can publish if they contain main + clean + unlocked,
  // but confidence still reflects the branch factor.
  const hardFail = factors.filter((f) => !f.pass && f.id !== 'branch_is_main');
  const sayYes = hardFail.length === 0 && confidence >= threshold;

  const receipt = {
    id: `island-vibe-${crypto.randomBytes(6).toString('hex')}`,
    kind: sayYes ? 'say_yes_publish' : 'hold_publish',
    source: SOURCE,
    generatedAt: now.toISOString(),
    headSha: sha,
    branch,
    confidence,
    threshold,
    factors,
    lock,
    framing: sayYes
      ? 'Say yes to publish — on our terms (lock free, HEAD known, origin/main contained, clean tree).'
      : 'Hold publish — fix failing factors before Cloudflare deploy.',
  };

  return {
    ok: sayYes,
    allowed: sayYes,
    confidence,
    threshold,
    receipt,
    hardFail: hardFail.map((f) => f.id),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node tools/island-vibe-publish-gate.js [--json] [--threshold 0.75] [--skip-lock] [--allow-dirty]\n' +
        'Island Vibe Publishing steal: confidence + say-yes receipt before CF deploy.',
    );
    process.exit(0);
  }
  const result = evaluateVibePublish({
    threshold: args.threshold,
    requireClean: args.requireClean,
    checkLock: args.checkLock,
  });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `${result.allowed ? 'SAY_YES' : 'HOLD'} confidence=${result.confidence} ` +
        `threshold=${result.threshold} receipt=${result.receipt.id} ` +
        `branch=${result.receipt.branch} sha=${(result.receipt.headSha || '').slice(0, 12)}`,
    );
    for (const f of result.receipt.factors) {
      console.log(`  ${f.pass ? 'OK' : '!!'} ${f.id} (w=${f.weight}) — ${f.detail}`);
    }
    console.log(result.receipt.framing);
  }
  process.exit(result.allowed ? 0 : 1);
}

module.exports = {
  evaluateVibePublish,
  checkDeployLock,
  DEFAULT_THRESHOLD,
  SOURCE,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(2);
  }
}
