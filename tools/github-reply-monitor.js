#!/usr/bin/env node
/**
 * github-reply-monitor.js
 * Watches the GitHub outreach threads in business_os/leads.csv (Platform=GitHub, Status=sent)
 * for NEW replies (any comment not authored by IgorGanapolsky), and pushes a phone
 * notification via ntfy when one lands. First run establishes a silent baseline so
 * pre-existing comments (e.g. the OP's own) don't fire a false alert.
 *
 * Reads leads.csv (read-only). State in ~/.hermes/github-reply-monitor-state.json.
 * Run by LaunchAgent com.igor.github-reply-monitor (every 2h).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GH = '/opt/homebrew/bin/gh';
const ME = 'IgorGanapolsky';
const REPO = '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards';
const LEADS = path.join(REPO, 'business_os/leads.csv');
const STATE = path.join(process.env.HOME, '.hermes/github-reply-monitor-state.json');
const NTFY = 'https://ntfy.sh/yolo-guard-fdh8ktuw1vtxb5sb';

// PRs whose MERGE unlocks a contribution lane — alert once when they merge.
const WATCHED_PRS = [
  { repo: 'atheurer/agentic-perf', num: 138, why: 'Closes #125/#126/#128 telemetry. Once merged, the #127 budget-enforcement lane (agents/base.py:63) is OPEN — build the Tier-1 soft budget-gate PR on its get_global_usage() API.' },
];

function gh(endpoint) {
  return JSON.parse(execFileSync(GH, ['api', endpoint, '--paginate'], { encoding: 'utf8' }));
}

// Extract unique "owner/repo#num" from leads.csv rows that mention GitHub.
function trackedIssues() {
  const lines = fs.readFileSync(LEADS, 'utf8').split('\n').slice(1).filter(Boolean);
  const set = new Set();
  for (const line of lines) {
    if (!/GitHub/i.test(line)) continue;
    const m = line.match(/github\.com\/([^/\s,"]+)\/([^/\s,"]+)\/issues\/(\d+)/);
    if (m) set.add(`${m[1]}/${m[2]}#${m[3]}`);
  }
  return [...set];
}

function main() {
  const firstRun = !fs.existsSync(STATE);
  const state = firstRun ? { seen: {} } : JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const fresh = [];

  for (const key of trackedIssues()) {
    const [repo, num] = key.split('#');
    let comments;
    try { comments = gh(`repos/${repo}/issues/${num}/comments`); }
    catch (e) { console.error(`[skip] ${key}: ${e.message.split('\n')[0]}`); continue; }
    for (const c of comments) {
      if (c.user && c.user.login === ME) continue;       // ignore our own comments
      if (state.seen[c.id]) continue;                    // already accounted for
      state.seen[c.id] = true;
      if (!firstRun) fresh.push({ key, by: c.user.login, url: c.html_url, body: (c.body || '').replace(/\s+/g, ' ').slice(0, 160) });
    }
  }

  // Watch specific PRs — alert once when one merges (unlocks our contribution lane).
  for (const pr of WATCHED_PRS) {
    let merged = false;
    try { merged = gh(`repos/${pr.repo}/pulls/${pr.num}`).merged === true; }
    catch (e) { console.error(`[skip pr] ${pr.repo}#${pr.num}: ${e.message.split('\n')[0]}`); continue; }
    const sk = `pr-merged-${pr.repo}#${pr.num}`;
    if (!merged || state.seen[sk]) continue;
    state.seen[sk] = true;
    if (!firstRun) fresh.push({ key: `${pr.repo}#${pr.num}`, by: '🟢 PR MERGED', url: `https://github.com/${pr.repo}/pull/${pr.num}`, body: pr.why });
  }

  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));

  if (firstRun) { console.log(`[reply-monitor] baseline set (${Object.keys(state.seen).length} existing comments); no alerts on first run`); return; }
  if (!fresh.length) { console.log('[reply-monitor] no new replies'); return; }

  const msg = fresh.map(r => `${r.by} → ${r.key}: ${r.body}`).join('\n\n');
  try {
    execFileSync('/usr/bin/curl', ['-s', '-H', 'Title: 🎯 GitHub outreach REPLY', '-H', 'Priority: high', '-H', 'Tags: moneybag', '-d', msg, NTFY]);
  } catch (e) { console.error('[ntfy] failed:', e.message.split('\n')[0]); }
  console.log(`[reply-monitor] ${fresh.length} NEW reply(ies):\n${msg}`);
}

main();
