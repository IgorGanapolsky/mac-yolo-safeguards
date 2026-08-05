#!/usr/bin/env node
'use strict';

/**
 * coding-context-pack.js — Issue-first, evidence-backed coding context.
 *
 * Implements the Hugging Face Context Course pattern for this monorepo:
 *   smallest context that proves what "correct" is (GH issue AC + proof)
 *   + after work, smallest context that proves it landed (tests + three buses).
 *
 * Usage:
 *   node tools/coding-context-pack.js
 *   node tools/coding-context-pack.js --json
 *   node tools/coding-context-pack.js --issue 132
 *   node tools/coding-context-pack.js --minimal
 *   node tools/coding-context-pack.js --write
 *   node tools/coding-context-pack.js --sync
 *   node tools/coding-context-pack.js --ship-check --pr 1418 --agent AGENT-257
 *   node tools/coding-context-pack.js --help
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const GH_REPO = process.env.CODING_CONTEXT_GH_REPO || 'IgorGanapolsky/mac-yolo-safeguards';
/** Prefer this worktree, then primary checkout (worktrees often lack continuous proofs). */
const PRIMARY_REPO =
  process.env.CODING_CONTEXT_PRIMARY_REPO ||
  path.join(os.homedir(), 'workspace/git/igor/mac-yolo-safeguards');
const OUT_DIR = path.join(REPO, 'hermes-mobile/docs/proofs/coding-context');
const VAULT_ROOT =
  process.env.HERMES_AGENT_SYNC_VAULT || path.join(os.homedir(), 'Documents/AI-Agent-Sync');
const VAULT_BOARD = path.join(VAULT_ROOT, 'Projects/mac-yolo-safeguards/GITHUB-PRODUCT-BOARD.md');
const VAULT_LINEAR = path.join(VAULT_ROOT, 'Projects/mac-yolo-safeguards/LINEAR-SYNC.md');
const SHIP_CHECK = path.join(
  os.homedir(),
  '.grok/skills/three-bus-ship-cycle/scripts/ship_cycle_check.sh',
);

function resolveE2ePath() {
  const candidates = [
    path.join(REPO, 'hermes-mobile/docs/proofs/continuous/latest.json'),
    path.join(PRIMARY_REPO, 'hermes-mobile/docs/proofs/continuous/latest.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

/** Skill routing: label/title keywords → skill paths (load on demand). */
const SKILL_ROUTES = [
  {
    id: 'three-bus-ship-cycle',
    when: () => true,
    path: '~/.grok/skills/three-bus-ship-cycle/SKILL.md',
    reason: 'Every ship updates GitHub + Linear + vault',
  },
  {
    id: 'verify-hermes-mobile-ship',
    when: (iss) => hasArea(iss, 'hermes-mobile') || /mobile|connection|chat|pair/i.test(iss.title),
    path: 'hermes-mobile/.cursor/skills or .cursor/skills/verify-hermes-mobile-ship',
    reason: 'Device/E2E proof before fixed/shipped claims',
  },
  {
    id: 'troubleshoot-hermes-mobile-connectivity',
    when: (iss) => /connect|pair|tailscale|auth|identity|unreachable/i.test(iss.title + labelsStr(iss)),
    path: '.cursor/skills/troubleshoot-hermes-mobile-connectivity',
    reason: 'Connection identity / reachability work',
  },
  {
    id: 'multi-agent-coord',
    when: () => true,
    path: '~/.grok/skills/multi-agent-coord/SKILL.md',
    reason: 'plan.md claims + Linear locks before multi-file edit',
  },
  {
    id: 'zero-manual-handoff',
    when: () => true,
    path: '~/.grok/skills/zero-manual-handoff/SKILL.md',
    reason: 'Agent executes adb/pair/tests — never homework for CEO',
  },
];

function labelsStr(iss) {
  return (iss.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).join(' ');
}

function hasArea(iss, area) {
  return labelsStr(iss).includes(`area:${area}`) || labelsStr(iss).includes(area);
}

function parseArgs(argv) {
  const out = {
    json: false,
    minimal: false,
    write: false,
    sync: false,
    shipCheck: false,
    help: false,
    issue: null,
    pr: null,
    agent: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--minimal') out.minimal = true;
    else if (a === '--write') out.write = true;
    else if (a === '--sync') out.sync = true;
    else if (a === '--ship-check') out.shipCheck = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--issue') out.issue = Number(argv[++i]);
    else if (a.startsWith('--issue=')) out.issue = Number(a.slice('--issue='.length));
    else if (a === '--pr') out.pr = String(argv[++i]);
    else if (a.startsWith('--pr=')) out.pr = a.slice('--pr='.length);
    else if (a === '--agent') out.agent = String(argv[++i]);
    else if (a.startsWith('--agent=')) out.agent = a.slice('--agent='.length);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: opts.cwd || REPO,
    encoding: 'utf8',
    timeout: opts.timeout || 45_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...(opts.env || {}) },
  });
}

function ghJson(args) {
  const r = run('gh', args, { timeout: 60_000 });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim().slice(0, 400);
    throw new Error(`gh ${args.join(' ')} failed: ${err || r.status}`);
  }
  const text = (r.stdout || '').trim();
  if (!text) return null;
  return JSON.parse(text);
}

function readE2e() {
  const p = resolveE2ePath();
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    data._path = p;
    return data;
  } catch {
    return null;
  }
}

function labelNames(issue) {
  return (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name || '')).filter(Boolean);
}

/**
 * Score an open issue for "do next" ranking.
 * Higher = more urgent / more actionable for coding agents.
 */
function scoreIssue(issue, openPrs, e2e) {
  const labels = labelNames(issue);
  let score = 50;
  const reasons = [];

  if (labels.includes('priority:p0') || /^P0\b/i.test(issue.title)) {
    score += 40;
    reasons.push('p0');
  } else if (labels.includes('priority:p1')) {
    score += 25;
    reasons.push('p1');
  } else if (labels.includes('priority:p2')) {
    score += 10;
    reasons.push('p2');
  }

  if (labels.includes('status:ready')) {
    score += 15;
    reasons.push('ready');
  }
  if (labels.includes('status:blocked')) {
    score -= 35;
    reasons.push('blocked');
  }
  if (labels.includes('bug')) {
    score += 8;
    reasons.push('bug');
  }

  const related = (openPrs || []).filter((pr) => prTouchesIssue(pr, issue.number));
  if (related.length) {
    score += 20;
    reasons.push(`open_pr:${related.map((p) => p.number).join(',')}`);
    const mergeable = related.some((p) => p.mergeable === 'MERGEABLE' || p.mergeStateStatus === 'CLEAN');
    if (mergeable) {
      score += 15;
      reasons.push('pr_mergeable');
    }
    const failing = related.some((p) =>
      (p.statusCheckRollup || []).some((c) => c.conclusion === 'FAILURE'),
    );
    if (failing) {
      score += 5;
      reasons.push('pr_ci_fail');
    }
  }

  // Mobile issues need honest e2e for ship claims — boost unfinished mobile p0/p1
  if (labels.includes('area:hermes-mobile') && e2e && e2e.e2e !== 'pass') {
    score += 5;
    reasons.push('e2e_not_pass');
  }

  return { score, reasons, relatedPrs: related.map((p) => p.number) };
}

function prTouchesIssue(pr, issueNumber) {
  const hay = `${pr.title || ''} ${pr.body || ''} ${(pr.headRefName || pr.head || '')}`;
  const n = String(issueNumber);
  return (
    new RegExp(`#${n}\\b`).test(hay) ||
    new RegExp(`GH-#?${n}\\b`, 'i').test(hay) ||
    new RegExp(`issue[s]?\\s*${n}\\b`, 'i').test(hay)
  );
}

function rankIssues(issues, openPrs, e2e) {
  return issues
    .map((iss) => {
      const { score, reasons, relatedPrs } = scoreIssue(iss, openPrs, e2e);
      return { ...iss, _score: score, _reasons: reasons, _relatedPrs: relatedPrs };
    })
    .sort((a, b) => b._score - a._score || a.number - b.number);
}

function routeSkills(issue) {
  if (!issue) return [];
  return SKILL_ROUTES.filter((r) => r.when(issue)).map((r) => ({
    id: r.id,
    path: r.path,
    reason: r.reason,
  }));
}

function shipClaimGate(e2e, options = {}) {
  const blockers = [];
  if (!e2e) {
    blockers.push('missing hermes-mobile/docs/proofs/continuous/latest.json');
  } else {
    if (e2e.unit !== 'pass' && options.requireUnit !== false) {
      blockers.push(`unit=${e2e.unit || 'unknown'} (need pass)`);
    }
    if (options.requireE2ePass && e2e.e2e !== 'pass') {
      blockers.push(`e2e=${e2e.e2e || 'unknown'} (need pass for device/OTA ship claim; skipped≠pass)`);
    }
  }
  return {
    ok: blockers.length === 0,
    blockers,
    rule: 'Never claim fixed/shipped on mobile without unit pass; device/OTA needs e2e=pass (not skipped)',
  };
}

function extractAcceptanceHints(body) {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const hints = [];
  for (const line of lines) {
    if (/^\s*[-*]\s*\[[ xX]\]/.test(line) || /^\s*AC[:\s]/i.test(line) || /^\s*Acceptance/i.test(line)) {
      hints.push(line.trim().slice(0, 200));
    }
    if (hints.length >= 8) break;
  }
  if (hints.length === 0) {
    // first non-empty paragraphs as soft AC
    const para = body
      .split(/\n\n+/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 2);
    return para.map((p) => p.slice(0, 180));
  }
  return hints;
}

function fetchOpenIssues() {
  return (
    ghJson([
      'issue',
      'list',
      '--repo',
      GH_REPO,
      '--state',
      'open',
      '--limit',
      '30',
      '--json',
      'number,title,labels,url,updatedAt,body',
    ]) || []
  );
}

function fetchOpenPrs() {
  try {
    return (
      ghJson([
        'pr',
        'list',
        '--repo',
        GH_REPO,
        '--state',
        'open',
        '--limit',
        '40',
        '--json',
        'number,title,body,headRefName,url,mergeable,mergeStateStatus,statusCheckRollup',
      ]) || []
    );
  } catch {
    return [];
  }
}

function parseVaultLinearMap() {
  const map = {};
  const files = [VAULT_BOARD, VAULT_LINEAR];
  for (const file of files) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      // Markdown table cells: | #132 | ... | AGENT-257 |
      const re = /\|\s*#?(\d+)\s*\|[^|\n]*\|\s*(AGENT-\d+)/gi;
      let m;
      while ((m = re.exec(text))) {
        map[Number(m[1])] = m[2];
      }
      // [GH-#132] ... AGENT-257
      const re2 = /\[?GH-#(\d+)\]?[^\n]{0,120}?(AGENT-\d+)/gi;
      while ((m = re2.exec(text))) {
        map[Number(m[1])] = m[2];
      }
      // AGENT-257 ... #132 or issue 132
      const re3 = /(AGENT-\d+)[^\n]{0,80}?(?:#|issue\s*)(\d+)/gi;
      while ((m = re3.exec(text))) {
        const n = Number(m[2]);
        if (!map[n]) map[n] = m[1];
      }
    } catch {
      /* vault optional */
    }
  }
  return map;
}

function runSync() {
  const gh = run(process.execPath, ['tools/github-linear-sync.js'], { timeout: 120_000 });
  const obs = run(process.execPath, ['tools/obsidian-linear-sync.js'], { timeout: 90_000 });
  return {
    github_linear: {
      ok: gh.status === 0,
      exit: gh.status,
      out: ((gh.stdout || '') + (gh.stderr || '')).trim().slice(0, 1500),
    },
    obsidian: {
      ok: obs.status === 0,
      exit: obs.status,
      out: ((obs.stdout || '') + (obs.stderr || '')).trim().slice(0, 1500),
    },
  };
}

function runShipCheck(pr, agent) {
  if (!fs.existsSync(SHIP_CHECK)) {
    return { ok: false, out: `missing ${SHIP_CHECK}` };
  }
  const args = [];
  if (pr) args.push(String(pr));
  if (agent) args.push(String(agent));
  const r = run('bash', [SHIP_CHECK, ...args], {
    timeout: 60_000,
    env: { THUMBGATE_REPO: GH_REPO },
  });
  return {
    ok: r.status === 0,
    exit: r.status,
    out: ((r.stdout || '') + (r.stderr || '')).trim().slice(0, 2000),
  };
}

function buildPack(args) {
  const e2e = readE2e();
  const issues = fetchOpenIssues();
  const prs = fetchOpenPrs();
  const linearMap = parseVaultLinearMap();
  const ranked = rankIssues(issues, prs, e2e);

  let focus = null;
  if (args.issue) {
    focus = ranked.find((i) => i.number === args.issue) || issues.find((i) => i.number === args.issue);
    if (focus && focus._score == null) {
      const s = scoreIssue(focus, prs, e2e);
      focus = { ...focus, _score: s.score, _reasons: s.reasons, _relatedPrs: s.relatedPrs };
    }
  } else {
    focus = ranked[0] || null;
  }

  const matrix = ranked.map((iss) => ({
    number: iss.number,
    title: iss.title,
    url: iss.url,
    labels: labelNames(iss),
    score: iss._score,
    rank_reasons: iss._reasons,
    related_prs: iss._relatedPrs,
    linear_id: linearMap[iss.number] || null,
  }));

  const skills = routeSkills(focus);
  const acHints = focus ? extractAcceptanceHints(focus.body) : [];
  const shipGate = shipClaimGate(e2e, {
    requireE2ePass: focus ? hasArea(focus, 'hermes-mobile') || /mobile/i.test(focus?.title || '') : false,
  });

  const nextActions = [];
  if (focus) {
    nextActions.push({
      rank: 1,
      action: `Work GH #${focus.number}: ${focus.title}`,
      why: (focus._reasons || []).join(', ') || 'top ranked',
      linear: linearMap[focus.number] || 'run --sync if missing',
      skills: skills.map((s) => s.id),
    });
    if (focus._relatedPrs?.length) {
      nextActions.push({
        rank: 2,
        action: `Drive open PR(s) ${focus._relatedPrs.map((n) => `#${n}`).join(', ')} to green + three-bus`,
        why: 'PR already open — finish is higher leverage than new branch',
      });
    }
  }
  if (!shipGate.ok && focus && hasArea(focus, 'hermes-mobile')) {
    nextActions.push({
      rank: 3,
      action: 'Do not claim device/ship fixed until e2e=pass (or unit-only with honest UNVERIFIED device)',
      why: shipGate.blockers.join('; '),
    });
  }
  nextActions.push({
    rank: 99,
    action: 'On completion: three-bus (gh evidence + Linear comment + vault grok.md) then re-run this pack',
    why: 'Incomplete bus = incomplete ship',
  });

  const pack = {
    schema: 'coding-context-pack/v1',
    generated_at: new Date().toISOString(),
    repo: GH_REPO,
    principle:
      'Smallest context that proves correct (issue AC) + smallest that proves landed (tests + three buses). HF context-course applied.',
    e2e_proof: e2e
      ? {
          unit: e2e.unit,
          e2e: e2e.e2e,
          updatedAt: e2e.updatedAt,
          path: e2e._path || resolveE2ePath(),
        }
      : null,
    ship_claim_gate: shipGate,
    focus: focus
      ? {
          number: focus.number,
          title: focus.title,
          url: focus.url,
          labels: labelNames(focus),
          score: focus._score,
          rank_reasons: focus._reasons,
          related_prs: focus._relatedPrs,
          linear_id: linearMap[focus.number] || null,
          acceptance_hints: acHints,
          skills,
        }
      : null,
    issue_matrix: matrix,
    next_actions: nextActions,
    load_now: {
      always: ['AGENTS.md', 'plan.md §2 claims', 'this pack'],
      on_demand_skills: skills,
      code_search: 'grepai search "<intent>" --json --compact',
      never_load_until_needed: ['revenue/social skills', 'full Maestro logs', 'entire plan.md history'],
    },
    commands: {
      refresh: 'node tools/coding-context-pack.js',
      focus: 'node tools/coding-context-pack.js --issue <N>',
      sync_buses: 'node tools/coding-context-pack.js --sync',
      ship_check: 'node tools/coding-context-pack.js --ship-check --pr <N> --agent AGENT-XXX',
      session: 'node tools/agent-session-start.js',
    },
  };

  return pack;
}

function formatHuman(pack) {
  const lines = [];
  lines.push('=== Coding context pack (issue-first) ===');
  lines.push(`repo=${pack.repo}  generated=${pack.generated_at}`);
  if (pack.e2e_proof) {
    lines.push(
      `e2e_proof: unit=${pack.e2e_proof.unit} e2e=${pack.e2e_proof.e2e} @ ${pack.e2e_proof.updatedAt || '?'}`,
    );
  } else {
    lines.push('e2e_proof: MISSING latest.json');
  }
  lines.push(
    `ship_claim_gate: ${pack.ship_claim_gate.ok ? 'OK' : 'BLOCK'} ${pack.ship_claim_gate.blockers.join('; ') || ''}`,
  );
  if (pack.focus) {
    const f = pack.focus;
    lines.push('');
    lines.push(`FOCUS #${f.number} (score=${f.score}) ${f.title}`);
    lines.push(`  ${f.url}`);
    lines.push(`  labels: ${(f.labels || []).join(', ')}`);
    lines.push(`  linear: ${f.linear_id || 'UNMAPPED — run --sync'}`);
    lines.push(`  prs: ${(f.related_prs || []).map((n) => `#${n}`).join(', ') || 'none open'}`);
    lines.push(`  rank: ${(f.rank_reasons || []).join(', ')}`);
    if (f.acceptance_hints?.length) {
      lines.push('  AC / hints:');
      for (const h of f.acceptance_hints.slice(0, 5)) lines.push(`    - ${h}`);
    }
    if (f.skills?.length) {
      lines.push(`  skills: ${f.skills.map((s) => s.id).join(', ')}`);
    }
  } else {
    lines.push('FOCUS: no open issues');
  }
  lines.push('');
  lines.push('Board (ranked):');
  for (const row of (pack.issue_matrix || []).slice(0, 8)) {
    lines.push(
      `  #${row.number} s=${row.score} ${row.linear_id || '—'}  ${row.title.slice(0, 70)}${(row.related_prs || []).length ? ` [PR ${row.related_prs.join(',')}]` : ''}`,
    );
  }
  lines.push('');
  lines.push('Next:');
  for (const a of pack.next_actions || []) {
    lines.push(`  ${a.rank}. ${a.action}`);
    if (a.why) lines.push(`     why: ${a.why}`);
  }
  lines.push('');
  lines.push('Refresh: node tools/coding-context-pack.js');
  return lines.join('\n');
}

function formatMinimal(pack) {
  const f = pack.focus;
  if (!f) return 'coding-context: no open issues';
  const e = pack.e2e_proof;
  return [
    `coding-context FOCUS #${f.number} s=${f.score} ${f.title}`,
    `  linear=${f.linear_id || 'UNMAPPED'} prs=${(f.related_prs || []).join(',') || 'none'} e2e=${e ? `${e.unit}/${e.e2e}` : '?'}`,
    `  next: ${pack.next_actions?.[0]?.action || '—'}`,
    `  ship_gate=${pack.ship_claim_gate.ok ? 'ok' : 'block'} skills=${(f.skills || []).map((s) => s.id).join(',')}`,
  ].join('\n');
}

function writeArtifacts(pack) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, 'latest.json');
  const mdPath = path.join(OUT_DIR, 'latest.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(pack, null, 2)}\n`);
  fs.writeFileSync(mdPath, `${formatHuman(pack)}\n`);
  return { jsonPath, mdPath };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/coding-context-pack.js [options]

  --json          Machine-readable pack
  --minimal       One-screen focus line (session start)
  --issue N       Focus a specific open issue
  --write         Write hermes-mobile/docs/proofs/coding-context/latest.{json,md}
  --sync          Run github-linear-sync + obsidian-linear-sync then pack
  --ship-check    Run three-bus ship_cycle_check.sh [--pr N --agent AGENT-X]
  --pr / --agent  Args for --ship-check
  --help          This help

Principle: load the smallest context that proves correct (issue AC) and that
proves landed (tests + GitHub/Linear/vault). See ~/.grok/skills/coding-context-pack/
`);
    process.exit(0);
  }

  let syncResult = null;
  if (args.sync) {
    syncResult = runSync();
  }

  let shipResult = null;
  if (args.shipCheck) {
    shipResult = runShipCheck(args.pr, args.agent);
  }

  const pack = buildPack(args);
  if (syncResult) pack.sync = syncResult;
  if (shipResult) pack.ship_check = shipResult;

  let written = null;
  if (args.write) {
    written = writeArtifacts(pack);
    pack.written = written;
  }

  if (args.json) {
    console.log(JSON.stringify(pack, null, 2));
  } else if (args.minimal) {
    console.log(formatMinimal(pack));
    if (syncResult) {
      console.log(
        `sync: gh-linear=${syncResult.github_linear.ok ? 'ok' : 'fail'} vault=${syncResult.obsidian.ok ? 'ok' : 'fail'}`,
      );
    }
    if (shipResult) {
      console.log(`ship_check: ${shipResult.ok ? 'PASS' : 'FAIL'}`);
    }
  } else {
    console.log(formatHuman(pack));
    if (syncResult) {
      console.log('\n=== Sync ===');
      console.log(
        `github-linear: ${syncResult.github_linear.ok ? 'ok' : 'FAIL'} exit=${syncResult.github_linear.exit}`,
      );
      if (!syncResult.github_linear.ok) console.log(syncResult.github_linear.out.slice(0, 500));
      console.log(`obsidian: ${syncResult.obsidian.ok ? 'ok' : 'FAIL'} exit=${syncResult.obsidian.exit}`);
      if (!syncResult.obsidian.ok) console.log(syncResult.obsidian.out.slice(0, 500));
    }
    if (shipResult) {
      console.log('\n=== Ship check ===');
      console.log(shipResult.out);
    }
    if (written) {
      console.log(`\nwrote ${written.jsonPath}`);
      console.log(`wrote ${written.mdPath}`);
    }
  }

  // Exit non-zero only on hard tool failures, not on blocked ship gate
  if (syncResult && (!syncResult.github_linear.ok || !syncResult.obsidian.ok)) {
    process.exit(2);
  }
  if (shipResult && !shipResult.ok) {
    process.exit(1);
  }
}

// Exports for unit tests (no live network)
module.exports = {
  scoreIssue,
  rankIssues,
  prTouchesIssue,
  routeSkills,
  shipClaimGate,
  extractAcceptanceHints,
  labelNames,
  parseArgs,
  formatMinimal,
  formatHuman,
  SKILL_ROUTES,
};

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(2);
  }
}
