#!/usr/bin/env node
'use strict';

/**
 * tml-tinker-engage-loop.js — Continuous (LaunchAgent) engagement with
 * thinking-machines-lab/tinker-cookbook issues.
 *
 * Design goals (anti-spam):
 * - Value-first technical comments; soft ThumbGate / tinker-brain disclosure only
 * - Hard caps: max per run, max per UTC day, cooldown per issue
 * - Ledger dedupe: never double-comment the same issue (or re-open same pitch issue)
 * - Pause file: ~/.hermes/receipts/tml-tinker-engage/PAUSE
 * - No merges, no closing other people's issues, no force-push
 *
 * Usage:
 *   node tools/tml-tinker-engage-loop.js [--dry-run] [--json] [--write]
 *   node tools/tml-tinker-engage-loop.js --status
 *   node tools/tml-tinker-engage-loop.js --max-per-run 2 --max-per-day 6
 *
 * LaunchAgent: com.igor.tml-tinker-engage (default every 4h)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const REPO_DEFAULT = 'thinking-machines-lab/tinker-cookbook';
const REPO_ROOT = path.resolve(__dirname, '..');
const RECEIPT_DIR = path.join(os.homedir(), '.hermes', 'receipts', 'tml-tinker-engage');
const DEFAULT_LEDGER = path.join(RECEIPT_DIR, 'ledger.jsonl');
const DEFAULT_STATE = path.join(RECEIPT_DIR, 'state.json');
const DEFAULT_LATEST = path.join(RECEIPT_DIR, 'latest.json');
const PAUSE_FILE = path.join(RECEIPT_DIR, 'PAUSE');
const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'mac-yolo');

const DISCLOSURE = `
---
*Independent of Thinking Machines Lab. Related open work: [ThumbGate.app](https://thumbgate.app/) (Hermes agent control plane) and fail-closed GTM/cash validators in [mac-yolo-safeguards](https://github.com/IgorGanapolsky/mac-yolo-safeguards) (\`tools/tinker-brain/\`, \`tools/governed-data-mesh.js\`). No affiliation claimed with TML or model providers.*
`.trim();

const TOPIC_TEMPLATES = [
  {
    id: 'cost_api',
    keywords: [/cost/i, /pricing/i, /balance/i, /billing/i, /usage/i, /credit/i, /spend/i],
    scoreBoost: 40,
    body: (issue) => `## Operational +1

Account-level balance and **actual** per-run cost cannot be reconstructed client-side from token×rate alone (deposits, storage, rounding, concurrent runs). Pre-run estimators help planning; they do not replace:

1. per-run cost on \`TrainingRun\` / \`tinker run info\`
2. account remaining credits via SDK/CLI

We keep **fail-closed cash claims** on production agent systems (no invented spend/revenue; refunds netted; test-mode excluded). Happy to dogfood a beta \`RestClient\` surface.

_Issue #${issue.number}: ${issue.title}_

${DISCLOSURE}`,
  },
  {
    id: 'eval_repro',
    keywords: [/eval/i, /benchmark/i, /papers with code/i, /mmlu/i, /gsm8k/i, /score/i, /verify/i],
    scoreBoost: 35,
    body: (issue) => `## Repro note

Leaderboard and cookbook scores only stay comparable when **protocol is pinned** (system prompt, max_tokens, temperature, timeout, renderer, thinking-token handling). Tinker’s eval README already flags this sensitivity — linking each public result to the exact \`BenchmarkConfig\` + renderer avoids “verification” against a different protocol.

For agent post-training we also separate:

- **LLM-as-a-Judge / rubrics** for open-ended quality
- **deterministic claim validators** for cash/LIVE/tool success (fail-closed)

Happy to help cross-check a specific row against documented cookbook settings.

_Issue #${issue.number}: ${issue.title}_

${DISCLOSURE}`,
  },
  {
    id: 'parallel_load',
    keywords: [/parallel/i, /concurrent/i, /rate limit/i, /session cap/i, /throughput/i, /slow/i, /scale/i],
    scoreBoost: 30,
    body: (issue) => `## Load pattern +1

When sampling slows under fan-out we separate train vs eval traffic, cap concurrent \`SamplingClient\`s, prefer fewer fatter sessions, and use a **watermarked eval store** so retries do not recompute finished \`example_id\`s. Pure eval sometimes moves to local vLLM when provider latency dominates wall-clock.

Documented session caps and expected throughput under load would save the community a lot of guesswork.

_Issue #${issue.number}: ${issue.title}_

${DISCLOSURE}`,
  },
  {
    id: 'renderer',
    keywords: [/renderer/i, /template/i, /thinking/i, /chat template/i, /nemotron/i, /qwen/i, /distill/i],
    scoreBoost: 28,
    body: (issue) => `## Renderer mismatch note

Student/teacher or train/sample renderer mismatches commonly bias logprobs (distillation) and silently zero single-turn benchmarks. Prefer explicit \`teacher_renderer_name\` / preserve-thinking flags over assuming HF defaults match cookbook renderers.

We see the same class of bug in production agent harnesses: wrong template → “confident” wrong claims. Fail-closed validators on **shipped claims** complement correct renderers.

_Issue #${issue.number}: ${issue.title}_

${DISCLOSURE}`,
  },
  {
    id: 'general_support',
    keywords: [/.*/],
    scoreBoost: 5,
    body: (issue) => `## External consumer note

Thanks for keeping this issue open. From a production agent / post-training harness perspective, the highest leverage cookbook surfaces have been:

1. **Pinned eval configs** (reproducible scores)
2. **Honest cost meters** (per-run + account balance)
3. **Renderer parity** train vs sample vs teacher

We run a fail-closed GTM/cash answer path (\`tinker-brain\`) and agent control plane ([ThumbGate.app](https://thumbgate.app/)) — happy to share patterns for claim validators next to LLM judges if useful. Not affiliated with Thinking Machines Lab.

_Issue #${issue.number}: ${issue.title}_

${DISCLOSURE}`,
  },
];

function parseArgs(argv) {
  const args = {
    repo: REPO_DEFAULT,
    write: true,
    dryRun: false,
    json: false,
    status: false,
    maxPerRun: 2,
    maxPerDay: 6,
    cooldownDays: 14,
    issueLimit: 40,
    minComments: 0,
    maxComments: 12,
    ledger: DEFAULT_LEDGER,
    state: DEFAULT_STATE,
    latest: DEFAULT_LATEST,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') {
      args.dryRun = true;
      args.write = false;
    } else if (a === '--write') args.write = true;
    else if (a === '--no-write') args.write = false;
    else if (a === '--json') args.json = true;
    else if (a === '--status') args.status = true;
    else if (a === '--repo') args.repo = argv[++i];
    else if (a === '--max-per-run') args.maxPerRun = Number(argv[++i]);
    else if (a === '--max-per-day') args.maxPerDay = Number(argv[++i]);
    else if (a === '--cooldown-days') args.cooldownDays = Number(argv[++i]);
    else if (a === '--issue-limit') args.issueLimit = Number(argv[++i]);
    else if (a === '--ledger') args.ledger = path.resolve(argv[++i]);
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function ensureDirs() {
  fs.mkdirSync(RECEIPT_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function readLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return [];
  return fs
    .readFileSync(ledgerPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function appendLedger(ledgerPath, row) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, `${JSON.stringify(row)}\n`, 'utf8');
}

function utcDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function ghJson(args, timeoutMs = 60000) {
  const r = spawnSync('gh', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    env: process.env,
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || 'gh failed').trim();
    throw new Error(err.slice(0, 500));
  }
  const out = (r.stdout || '').trim();
  if (!out) return null;
  return JSON.parse(out);
}

function whoami() {
  try {
    // --jq returns a bare string, not JSON
    const r = spawnSync('gh', ['api', 'user', '--jq', '.login'], {
      encoding: 'utf8',
      timeout: 30000,
      env: process.env,
    });
    if (r.status !== 0) return null;
    const login = (r.stdout || '').trim().replace(/^"|"$/g, '');
    return login || null;
  } catch {
    return null;
  }
}

function listOpenIssues(repo, limit) {
  return (
    ghJson([
      'issue',
      'list',
      '-R',
      repo,
      '--state',
      'open',
      '--limit',
      String(limit),
      '--json',
      'number,title,body,author,labels,comments,updatedAt,url,createdAt',
    ]) || []
  );
}

function issueComments(repo, number) {
  // Fail closed: unknown history must not be treated as empty (Codex P2).
  const data = ghJson([
    'api',
    `repos/${repo}/issues/${number}/comments`,
    '--paginate',
    '--jq',
    '[.[] | {user: .user.login, id: .id, created_at: .created_at}]',
  ]);
  if (!Array.isArray(data)) {
    throw new Error(`issue_comments_unreadable:#${number}`);
  }
  return data;
}

function postComment(repo, number, body) {
  const r = spawnSync(
    'gh',
    ['issue', 'comment', String(number), '-R', repo, '--body', body],
    { encoding: 'utf8', timeout: 60000, env: process.env },
  );
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || 'comment failed').trim().slice(0, 400));
  }
  return (r.stdout || '').trim();
}

/**
 * Run tools/social-publish-gate.js before any public GitHub comment that
 * promotes ThumbGate (AGENTS.md social hard gates). Exit 0 ALLOW, 1 BLOCK.
 */
function socialPublishGate({ campaign, body, repoRoot }) {
  const gate = path.join(repoRoot, 'tools', 'social-publish-gate.js');
  if (!fs.existsSync(gate)) {
    return { allow: false, error: 'social_publish_gate_missing', path: gate };
  }
  const tmp = path.join(os.tmpdir(), `tml-engage-body-${Date.now()}.md`);
  fs.writeFileSync(tmp, body, 'utf8');
  const r = spawnSync(
    process.execPath,
    [
      gate,
      '--platform',
      'github',
      '--campaign',
      campaign,
      '--body-file',
      tmp,
      '--json',
    ],
    { encoding: 'utf8', timeout: 30000, env: process.env, cwd: repoRoot },
  );
  try {
    fs.unlinkSync(tmp);
  } catch (_) {
    /* ignore */
  }
  let parsed = null;
  try {
    parsed = JSON.parse((r.stdout || '').trim() || '{}');
  } catch {
    parsed = { raw: (r.stdout || '').slice(0, 300) };
  }
  return {
    allow: r.status === 0,
    exitCode: r.status,
    result: parsed,
    stderr: (r.stderr || '').slice(0, 300),
  };
}

function matchTopic(issue) {
  const text = `${issue.title}\n${issue.body || ''}`;
  for (const t of TOPIC_TEMPLATES) {
    if (t.keywords.some((re) => re.test(text))) return t;
  }
  return TOPIC_TEMPLATES[TOPIC_TEMPLATES.length - 1];
}

function scoreIssue(issue, me, ledger) {
  const topic = matchTopic(issue);
  let score = topic.scoreBoost;
  const comments = issue.comments || 0;
  // Prefer lightly discussed issues we can help
  if (comments === 0) score += 25;
  else if (comments <= 3) score += 15;
  else if (comments > 20) score -= 15;

  const updated = Date.parse(issue.updatedAt || issue.createdAt || 0) || 0;
  const ageHours = (Date.now() - updated) / 3600000;
  if (ageHours < 48) score += 10;
  if (ageHours > 24 * 90) score -= 20;

  // Skip noise / spammy docs-only digests
  if (/^Docs:\s/i.test(issue.title) && comments > 2) score -= 10;
  if (/ZGmbH|spam/i.test(issue.body || '')) score -= 100;

  // Never target our own issues for auto-reply loops (hard exclude)
  if (issue.author && issue.author.login === me) {
    return { score: -10000, topic, ineligible: 'self_authored' };
  }

  // Already engaged?
  const prior = ledger.filter(
    (r) => r.issue === issue.number && r.action === 'comment',
  );
  if (prior.length) score -= 1000;

  return { score, topic };
}

function dayCount(ledger, day) {
  return ledger.filter((r) => r.action === 'comment' && r.ts && r.ts.startsWith(day)).length;
}

function recentIssue(ledger, issueNumber, cooldownDays) {
  const cutoff = Date.now() - cooldownDays * 86400000;
  return ledger.some(
    (r) =>
      r.issue === issueNumber &&
      r.action === 'comment' &&
      r.ts &&
      Date.parse(r.ts) >= cutoff,
  );
}

function buildStatus(args) {
  ensureDirs();
  const ledger = readLedger(args.ledger);
  const day = utcDay();
  return {
    ok: true,
    paused: fs.existsSync(PAUSE_FILE),
    pauseFile: PAUSE_FILE,
    ledgerPath: args.ledger,
    ledgerRows: ledger.length,
    commentsToday: dayCount(ledger, day),
    maxPerDay: args.maxPerDay,
    maxPerRun: args.maxPerRun,
    cooldownDays: args.cooldownDays,
    repo: args.repo,
    latest: fs.existsSync(args.latest)
      ? JSON.parse(fs.readFileSync(args.latest, 'utf8'))
      : null,
  };
}

function run(args) {
  ensureDirs();
  if (args.help) {
    console.log(parseArgs.toString().includes('Usage') ? '' : '');
    console.log(`Usage: node tools/tml-tinker-engage-loop.js [--dry-run] [--json] [--status]
  --max-per-run N   default 2
  --max-per-day N   default 6
  --cooldown-days N default 14
  --repo owner/repo default ${REPO_DEFAULT}
  PAUSE: touch ${PAUSE_FILE}`);
    return { ok: true, help: true };
  }

  if (args.status) {
    const st = buildStatus(args);
    if (args.json) console.log(JSON.stringify(st, null, 2));
    else {
      console.log(JSON.stringify(st, null, 2));
    }
    return st;
  }

  if (fs.existsSync(PAUSE_FILE)) {
    const out = {
      ok: true,
      skipped: true,
      reason: 'paused',
      pauseFile: PAUSE_FILE,
    };
    fs.writeFileSync(args.latest, `${JSON.stringify({ ...out, ts: new Date().toISOString() }, null, 2)}\n`);
    if (args.json) console.log(JSON.stringify(out, null, 2));
    else console.log(`paused: ${PAUSE_FILE}`);
    return out;
  }

  const me = whoami();
  if (!me) {
    const out = { ok: false, error: 'gh_auth_missing' };
    if (args.json) console.log(JSON.stringify(out, null, 2));
    else console.error('gh auth missing');
    return out;
  }

  const ledger = readLedger(args.ledger);
  const day = utcDay();
  const alreadyToday = dayCount(ledger, day);
  if (alreadyToday >= args.maxPerDay) {
    const out = {
      ok: true,
      skipped: true,
      reason: 'max_per_day',
      commentsToday: alreadyToday,
      maxPerDay: args.maxPerDay,
    };
    fs.writeFileSync(args.latest, `${JSON.stringify({ ...out, ts: new Date().toISOString() }, null, 2)}\n`);
    if (args.json) console.log(JSON.stringify(out, null, 2));
    else console.log(`max_per_day reached (${alreadyToday}/${args.maxPerDay})`);
    return out;
  }

  let issues;
  try {
    issues = listOpenIssues(args.repo, args.issueLimit);
  } catch (e) {
    const out = { ok: false, error: e.message };
    fs.writeFileSync(args.latest, `${JSON.stringify({ ...out, ts: new Date().toISOString() }, null, 2)}\n`);
    if (args.json) console.log(JSON.stringify(out, null, 2));
    else console.error(e.message);
    return out;
  }

  // Drop PRs that appear in issue list
  const pureIssues = issues.filter((i) => !i.pull_request);

  const ranked = pureIssues
    .map((issue) => {
      const { score, topic } = scoreIssue(issue, me, ledger);
      return { issue, score, topic };
    })
    .filter((r) => r.score > 0)
    .filter((r) => !recentIssue(ledger, r.issue.number, args.cooldownDays))
    .sort((a, b) => b.score - a.score);

  const budget = Math.min(args.maxPerRun, args.maxPerDay - alreadyToday);
  const actions = [];

  // Walk ranked list until budget filled (skip already-commented rather than slice-first)
  for (const { issue, score, topic } of ranked) {
    if (actions.length >= budget) break;

    // Live check we haven't already commented (API) — fail closed on API error
    let comments;
    try {
      comments = issueComments(args.repo, issue.number);
    } catch (e) {
      appendLedger(args.ledger, {
        ts: new Date().toISOString(),
        action: 'skip_comments_unreadable',
        repo: args.repo,
        issue: issue.number,
        error: e.message,
        login: me,
      });
      continue;
    }
    if (comments.some((c) => c.user === me)) {
      appendLedger(args.ledger, {
        ts: new Date().toISOString(),
        action: 'skip_already_commented',
        repo: args.repo,
        issue: issue.number,
        login: me,
      });
      continue;
    }

    const body = topic.body(issue);
    const bodyHash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
    let commentUrl = null;
    let error = null;

    if (args.write && !args.dryRun) {
      try {
        const campaign = `tml-tinker-engage-${utcDay()}`;
        const gate = socialPublishGate({
          campaign,
          body,
          repoRoot: REPO_ROOT,
        });
        if (!gate.allow) {
          error = `social_publish_gate_block:${gate.exitCode}:${JSON.stringify(gate.result).slice(0, 200)}`;
        } else {
          commentUrl = postComment(args.repo, issue.number, body);
        }
      } catch (e) {
        error = e.message;
      }
    }

    const row = {
      ts: new Date().toISOString(),
      action: error ? 'comment_failed' : args.dryRun || !args.write ? 'comment_dry_run' : 'comment',
      repo: args.repo,
      issue: issue.number,
      title: issue.title,
      topic: topic.id,
      score,
      bodyHash,
      commentUrl,
      error,
      login: me,
      dryRun: !!(args.dryRun || !args.write),
    };
    appendLedger(args.ledger, row);
    actions.push(row);

    // Stop on rate limit
    if (error && /rate limit|403|secondary/i.test(error)) break;
  }

  const out = {
    ok: true,
    ts: new Date().toISOString(),
    login: me,
    repo: args.repo,
    dryRun: !!(args.dryRun || !args.write),
    openIssues: pureIssues.length,
    ranked: ranked.slice(0, 10).map((r) => ({
      number: r.issue.number,
      title: r.issue.title,
      score: r.score,
      topic: r.topic.id,
      url: r.issue.url,
    })),
    actions,
    commentsToday: dayCount(readLedger(args.ledger), day),
    maxPerDay: args.maxPerDay,
  };

  fs.writeFileSync(args.latest, `${JSON.stringify(out, null, 2)}\n`);
  fs.writeFileSync(
    args.state,
    `${JSON.stringify(
      {
        lastRun: out.ts,
        commentsToday: out.commentsToday,
        lastActions: actions.length,
      },
      null,
      2,
    )}\n`,
  );

  if (args.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(
      `tml-tinker-engage: actions=${actions.length} today=${out.commentsToday}/${args.maxPerDay} open=${pureIssues.length} dryRun=${out.dryRun}`,
    );
    for (const a of actions) {
      console.log(
        `  #${a.issue} ${a.action} topic=${a.topic} ${a.commentUrl || a.error || ''}`.trim(),
      );
    }
  }
  return out;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  const result = run(args);
  process.exit(result && result.ok === false ? 1 : 0);
}

module.exports = {
  parseArgs,
  matchTopic,
  scoreIssue,
  dayCount,
  readLedger,
  TOPIC_TEMPLATES,
  DISCLOSURE,
  run,
  buildStatus,
  socialPublishGate,
  issueComments,
};

if (require.main === module) {
  main();
}
