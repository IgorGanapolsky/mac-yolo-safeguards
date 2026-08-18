#!/usr/bin/env node
'use strict';

/**
 * Residual picker + wrap-up lint for the anti-babysitting mandate.
 * Does not auto-merge other agents' PRs. Does not quarantine tests.
 */

const fs = require('fs');
const path = require('path');

const FORBIDDEN_FLAGS = ['--auto-merge-all', '--quarantine', '--log-failed'];

const BABYSITTING_PATTERNS = [
  { id: 'let_me_know', re: /\blet\s+me\s+know\b/i },
  { id: 'want_me_to', re: /\bwant\s+me\s+to\b/i },
  { id: 'should_i', re: /\bshould\s+I\b/i },
  { id: 'say_the_word', re: /\bsay\s+the\s+word\b/i },
  { id: 'one_click_away', re: /\bone\s+click\s+away\b/i },
  { id: 'just_click', re: /\bjust\s+click\b/i },
  { id: 'needs_approval', re: /\bneeds?\s+your\s+approval\b/i },
  { id: 'tell_me_to_proceed', re: /\btell\s+me\s+to\s+proceed\b/i },
  { id: 'if_you_want', re: /\bI\s+can\s+do\b[\s\S]{0,80}\bif\s+you\s+want\b/i },
  { id: 'please_run', re: /\bplease\s+run\b/i },
];

const PICK_ORDER = [
  'closeout_linear',
  'own_pr_red',
  'own_pr_green',
  'own_linear_in_progress',
  'handoff_next',
  'cheap_leftover',
  'skill_gap',
];

function refuseForbiddenFlags(argv) {
  const hits = (argv || []).filter((a) => FORBIDDEN_FLAGS.includes(a));
  if (hits.length) {
    const err = new Error(
      `refused ${hits.join(', ')}: sibling-steal / hide-fail is not autonomy`
    );
    err.code = 'REFUSED_FLAG';
    throw err;
  }
  return { ok: true };
}

function lintText(text) {
  if (!text || typeof text !== 'string') {
    return { clean: true, violations: [] };
  }
  const violations = [];
  for (const { id, re } of BABYSITTING_PATTERNS) {
    const match = text.match(re);
    if (match) {
      violations.push({
        id,
        matched: match[0],
        remediation: 'Execute the next authorized residual instead of asking.',
      });
    }
  }
  return { clean: violations.length === 0, violations };
}

function normalizeSources(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    merged_not_closed_linear: Boolean(src.merged_not_closed_linear),
    own_prs: Array.isArray(src.own_prs) ? src.own_prs : [],
    own_linear_in_progress: src.own_linear_in_progress || null,
    handoff_next: src.handoff_next || null,
    cheap_leftover: src.cheap_leftover || null,
    skill_gap: src.skill_gap || null,
  };
}

function pickNextResidual(raw) {
  const src = normalizeSources(raw);
  const ownRed = src.own_prs.find((p) => p && p.owner === 'grok' && p.state === 'red');
  const ownGreen = src.own_prs.find((p) => p && p.owner === 'grok' && p.state === 'green');
  const foreignGreen = src.own_prs.find((p) => p && p.owner && p.owner !== 'grok' && p.state === 'green');

  const candidates = {
    closeout_linear: src.merged_not_closed_linear
      ? { action: 'linear_done', detail: 'own merged PR still In Progress on Linear' }
      : null,
    own_pr_red: ownRed
      ? { action: 'ci_first_fail', detail: ownRed.id || ownRed.url }
      : null,
    own_pr_green: ownGreen
      ? { action: 'arm_auto_merge_own', detail: ownGreen.id || ownGreen.url }
      : null,
    own_linear_in_progress: src.own_linear_in_progress
      ? { action: 'continue_issue', detail: src.own_linear_in_progress }
      : null,
    handoff_next: src.handoff_next
      ? { action: 'handoff_next', detail: src.handoff_next }
      : null,
    cheap_leftover: src.cheap_leftover
      ? { action: 'finish_cheap_roi', detail: src.cheap_leftover }
      : null,
    skill_gap: src.skill_gap
      ? { action: 'write_skill', detail: src.skill_gap }
      : null,
  };

  for (const key of PICK_ORDER) {
    if (candidates[key]) {
      return {
        pick: key,
        ...candidates[key],
        steal_sibling_pr: false,
        skipped_foreign_green: foreignGreen ? (foreignGreen.id || true) : false,
        vendor_switch: 'do_not_migrate',
        quarantine: 'do_not_auto_quarantine',
      };
    }
  }

  return {
    pick: 'park',
    action: 'park',
    detail: 'no residual in own surfaces',
    steal_sibling_pr: false,
    skipped_foreign_green: foreignGreen ? (foreignGreen.id || true) : false,
    vendor_switch: 'do_not_migrate',
    quarantine: 'do_not_auto_quarantine',
  };
}

function parseArgs(argv) {
  refuseForbiddenFlags(argv);
  const out = { lint: null, pick: false, fixture: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--pick') out.pick = true;
    else if (a === '--lint') {
      out.lint = argv[i + 1] || '';
      i += 1;
    } else if (a === '--fixture') {
      out.fixture = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function loadFixture(file) {
  const abs = path.resolve(file);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.lint !== null && !args.pick) {
    const report = lintText(args.lint);
    if (args.json) process.stdout.write(`${JSON.stringify(report)}\n`);
    else {
      process.stdout.write(report.clean ? 'clean\n' : `violations ${report.violations.length}\n`);
    }
    return report.clean ? 0 : 2;
  }
  if (args.pick) {
    const src = args.fixture ? loadFixture(args.fixture) : {};
    const report = pickNextResidual(src);
    if (args.lint !== null) report.lint = lintText(args.lint);
    process.stdout.write(`${JSON.stringify(report, null, args.json ? 2 : 0)}\n`);
    return 0;
  }
  process.stderr.write('usage: anti-babysitting-next --lint TEXT | --pick [--fixture FILE] [--json]\n');
  return 1;
}

module.exports = {
  BABYSITTING_PATTERNS,
  FORBIDDEN_FLAGS,
  PICK_ORDER,
  lintText,
  main,
  parseArgs,
  pickNextResidual,
  refuseForbiddenFlags,
};

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = error.code === 'REFUSED_FLAG' ? 3 : 1;
  }
}
