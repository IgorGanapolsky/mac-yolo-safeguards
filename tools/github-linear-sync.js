#!/usr/bin/env node
'use strict';

/**
 * GitHub Issues → Linear (AGENT team) → Obsidian vault.
 *
 * HARD rules (2026-08-04 after free-tier flood):
 *   1. NEVER create a Linear issue if one already exists for GH-#N.
 *   2. Dedupe: keep ONE active Linear issue per GH number; cancel the rest.
 *   3. If GitHub issue is no longer open, cancel all Linear [GH-#N] clones.
 *   4. Exit non-zero when create fails (e.g. USAGE_LIMIT_EXCEEDED) or when
 *      open GH issues still lack a Linear mapping after the run.
 *
 * Title convention: `[GH-#123] <github title>`
 *
 * Usage:
 *   node tools/github-linear-sync.js
 *   node tools/github-linear-sync.js --dry-run
 *   node tools/github-linear-sync.js --skip-obsidian
 */

const { execFileSync } = require('child_process');
const { queryLinear } = require('./linear-agent-bridge');

const TEAM_ID = '9568bb27-2bd2-4dc8-b834-6575f2299af0'; // Agent Operations (AGENT)
const PROJECT_ID = '1b4424cd-981c-4187-88d0-97b56124f49c'; // mac-yolo-safeguards
const REPO = 'IgorGanapolsky/mac-yolo-safeguards';
const GH_TITLE_RE = /^\[GH-#(\d+)\]\s*/i;
const CANCELED_STATE_ID = 'e01085dd-8b3c-4cda-8d38-b45a27b13ed0';
const BACKLOG_STATE_ID = '66951692-b8df-49d3-a1ab-bf51ec8b7153';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const SKIP_OBSIDIAN = args.has('--skip-obsidian');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseGhNumber(title) {
  const m = String(title || '').match(GH_TITLE_RE);
  return m ? Number(m[1]) : null;
}

function linearTitleFor(ghIssue) {
  return `[GH-#${ghIssue.number}] ${ghIssue.title}`;
}

function linearDescriptionFor(ghIssue) {
  return (
    `**GitHub Issue**: [#${ghIssue.number}](${ghIssue.url})\n\n` +
    `${ghIssue.body || '_No description provided._'}\n\n` +
    `---\n` +
    `_Mirrored by tools/github-linear-sync.js (idempotent)._\n`
  );
}

function fetchOpenGitHubIssues() {
  let token = '';
  try {
    token = execFileSync(
      'security',
      ['find-generic-password', '-s', 'GITHUB_TOKEN', '-w'],
      { encoding: 'utf8' },
    ).trim();
  } catch {
    token = '';
  }
  const env = { ...process.env, GH_TOKEN: token || process.env.GH_TOKEN || '' };
  const ghOutput = execFileSync(
    'gh',
    [
      'issue',
      'list',
      '--repo',
      REPO,
      '--state',
      'open',
      '--limit',
      '100',
      '--json',
      'number,title,body,state,url,labels',
    ],
    { env, encoding: 'utf8' },
  );
  return JSON.parse(ghOutput || '[]');
}

async function fetchActiveAgentIssues() {
  const all = [];
  let after = null;
  for (let page = 0; page < 30; page++) {
    const res = await queryLinear(
      `
      query($after: String) {
        issues(
          first: 100
          after: $after
          filter: {
            team: { key: { eq: "AGENT" } }
            state: { type: { nin: ["completed", "canceled"] } }
          }
        ) {
          nodes {
            id
            identifier
            title
            url
            createdAt
            updatedAt
            state { id name type }
            labels { nodes { name } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `,
      { after },
    );
    if (res.error) {
      throw new Error(`Linear list failed: ${res.message || JSON.stringify(res)}`);
    }
    const conn = res.data?.issues;
    all.push(...(conn?.nodes || []));
    if (!conn?.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return all;
}

/** Prefer agent-locked issue; else newest by createdAt. */
function pickKeeper(clones) {
  if (!clones.length) return null;
  const locked = clones.filter((i) =>
    (i.labels?.nodes || []).some((l) => /^agent-lock$/i.test(l.name) || /^agent-/i.test(l.name)),
  );
  const pool = locked.length ? locked : clones;
  return [...pool].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
}

async function setState(issueId, stateId, reason) {
  if (DRY_RUN) {
    console.log(`  [dry-run] state→${stateId.slice(0, 8)}… ${reason}`);
    return { ok: true, dryRun: true };
  }
  const res = await queryLinear(
    `
    mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { id identifier state { name type } }
      }
    }
  `,
    { id: String(issueId), input: { stateId: String(stateId) } },
  );
  if (res.error || !res.data?.issueUpdate?.success) {
    return { ok: false, error: res.error || res };
  }
  return { ok: true, issue: res.data.issueUpdate.issue };
}

async function updateIssueContent(issueId, title, description) {
  if (DRY_RUN) {
    console.log(`  [dry-run] update content: ${title.slice(0, 72)}`);
    return { ok: true, dryRun: true };
  }
  const res = await queryLinear(
    `
    mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { id identifier title }
      }
    }
  `,
    {
      id: String(issueId),
      input: { title, description, projectId: PROJECT_ID },
    },
  );
  if (res.error || !res.data?.issueUpdate?.success) {
    return { ok: false, error: res.error || res };
  }
  return { ok: true, issue: res.data.issueUpdate.issue };
}

async function createLinearIssue(ghIssue) {
  const title = linearTitleFor(ghIssue);
  const description = linearDescriptionFor(ghIssue);
  if (DRY_RUN) {
    console.log(`  [dry-run] CREATE ${title}`);
    return { ok: true, dryRun: true, issue: { identifier: 'DRY-RUN', title } };
  }
  const res = await queryLinear(
    `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url }
      }
    }
  `,
    {
      input: {
        teamId: TEAM_ID,
        projectId: PROJECT_ID,
        title,
        description,
        stateId: BACKLOG_STATE_ID,
      },
    },
  );
  if (res.error || !res.data?.issueCreate?.success) {
    return { ok: false, error: res.error || res, raw: res };
  }
  return { ok: true, issue: res.data.issueCreate.issue };
}

async function addComment(issueId, body) {
  if (DRY_RUN) return;
  await queryLinear(
    `
    mutation($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
      }
    }
  `,
    { issueId: String(issueId), body },
  );
}

/**
 * Group active Linear issues that mirror GitHub by number.
 * @returns {Map<number, object[]>}
 */
function groupGhClones(linearIssues) {
  const by = new Map();
  for (const issue of linearIssues) {
    const n = parseGhNumber(issue.title);
    if (n == null) continue;
    if (!by.has(n)) by.set(n, []);
    by.get(n).push(issue);
  }
  return by;
}

async function syncGitHubIssuesToLinear() {
  console.log(DRY_RUN ? '🔄 GitHub→Linear (DRY RUN)' : '🔄 GitHub→Linear (idempotent)');

  const ghIssues = fetchOpenGitHubIssues();
  const openGhNums = new Set(ghIssues.map((i) => i.number));
  console.log(`Found ${ghIssues.length} open GitHub issues: ${[...openGhNums].sort((a, b) => a - b).join(', ') || '(none)'}`);

  const activeLinear = await fetchActiveAgentIssues();
  console.log(`Found ${activeLinear.length} active AGENT Linear issues`);
  const clonesByGh = groupGhClones(activeLinear);
  console.log(`Of those, ${[...clonesByGh.values()].reduce((n, a) => n + a.length, 0)} are [GH-#N] mirrors across ${clonesByGh.size} GH numbers`);

  let canceled = 0;
  let kept = 0;
  let created = 0;
  let updated = 0;
  let createFailures = 0;
  const mapping = []; // { gh, linear, action }

  // 1) Cancel stale GH mirrors (GH closed or not open) and dedupe open ones
  for (const [ghNum, clones] of [...clonesByGh.entries()].sort((a, b) => a[0] - b[0])) {
    const open = openGhNums.has(ghNum);
    if (!open) {
      console.log(`\nGH-#${ghNum}: not open on GitHub — canceling ${clones.length} Linear clone(s)`);
      for (const c of clones) {
        const r = await setState(
          c.id,
          CANCELED_STATE_ID,
          `${c.identifier} (GH-#${ghNum} closed/missing on GitHub)`,
        );
        if (r.ok) {
          canceled++;
          if (!DRY_RUN) {
            await addComment(
              c.id,
              `Canceled by github-linear-sync: GitHub #${ghNum} is no longer open on \`${REPO}\`.`,
            );
          }
        } else {
          console.log(`  ⚠️ cancel failed ${c.identifier}:`, JSON.stringify(r.error).slice(0, 200));
        }
        await sleep(120);
      }
      continue;
    }

    const keeper = pickKeeper(clones);
    const dupes = clones.filter((c) => c.id !== keeper.id);
    console.log(
      `\nGH-#${ghNum}: keep ${keeper.identifier} (${clones.length} total, cancel ${dupes.length} dupe(s))`,
    );
    kept++;
    mapping.push({ gh: ghNum, linear: keeper.identifier, action: 'keep' });

    for (const d of dupes) {
      // Prefer Canceled (not "Duplicate" state): free-tier activeIssueCount
      // only drops for completed/canceled; "duplicate" type can still count.
      const r = await setState(
        d.id,
        CANCELED_STATE_ID,
        `${d.identifier} duplicate of ${keeper.identifier}`,
      );
      if (!r.ok) {
        console.log(`  ⚠️ dedupe failed ${d.identifier}:`, JSON.stringify(r.error).slice(0, 200));
        await sleep(120);
        continue;
      }
      canceled++;
      if (!DRY_RUN) {
        await addComment(
          d.id,
          `Duplicate of ${keeper.identifier} for GitHub #${ghNum}. ` +
            `Canceled by idempotent github-linear-sync (was re-created by a non-idempotent loop).`,
        );
      }
      await sleep(120);
    }

    // Refresh keeper title/body from live GH
    const gh = ghIssues.find((i) => i.number === ghNum);
    if (gh) {
      const wantTitle = linearTitleFor(gh);
      if (keeper.title !== wantTitle || true) {
        const u = await updateIssueContent(keeper.id, wantTitle, linearDescriptionFor(gh));
        if (u.ok) {
          updated++;
          console.log(`  refreshed ${keeper.identifier} from GitHub #${ghNum}`);
        } else {
          console.log(`  ⚠️ refresh failed ${keeper.identifier}:`, JSON.stringify(u.error).slice(0, 200));
        }
        await sleep(120);
      }
    }
  }

  // 2) Create missing mappings for open GH issues that have zero Linear issues
  for (const gh of ghIssues) {
    const existing = clonesByGh.get(gh.number) || [];
    // Idempotent: never create if any active clone already exists for this GH #.
    if (existing.length > 0) continue;

    console.log(`\nGH-#${gh.number}: no Linear mirror — creating once`);
    const r = await createLinearIssue(gh);
    if (r.ok) {
      created++;
      mapping.push({
        gh: gh.number,
        linear: r.issue?.identifier || '?',
        action: 'create',
      });
      console.log(`  ✅ ${r.issue?.identifier || 'created'} ← GH-#${gh.number}`);
    } else {
      createFailures++;
      const msg = JSON.stringify(r.error || r.raw || {}).slice(0, 400);
      console.log(`  ⚠️ Failed to sync GH-#${gh.number}: ${msg}`);
      if (msg.includes('USAGE_LIMIT') || msg.includes('usage limit')) {
        console.log(
          '  [CAUSE] Linear free active-issue cap — free capacity by canceling duplicates first, then re-run.',
        );
      }
    }
    await sleep(200);
  }

  // Re-verify: every open GH has exactly one active Linear (best-effort recount)
  const afterLinear = DRY_RUN ? activeLinear : await fetchActiveAgentIssues();
  const afterClones = groupGhClones(afterLinear);
  const missing = [];
  const multi = [];
  for (const gh of ghIssues) {
    const list = afterClones.get(gh.number) || [];
    if (list.length === 0) missing.push(gh.number);
    if (list.length > 1) multi.push({ gh: gh.number, n: list.length, ids: list.map((i) => i.identifier) });
  }

  console.log('\n── Summary ──');
  console.log(`  kept:     ${kept}`);
  console.log(`  canceled: ${canceled}${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log(`  created:  ${created}`);
  console.log(`  refreshed:${updated}`);
  console.log(`  create failures: ${createFailures}`);
  console.log(`  active AGENT after: ${afterLinear.length}`);
  console.log(`  open GH still missing Linear: ${missing.length ? missing.join(', ') : 'none'}`);
  if (multi.length) {
    console.log(`  open GH still multi-clone: ${JSON.stringify(multi)}`);
  }
  console.log('  mapping:');
  for (const gh of ghIssues) {
    const list = afterClones.get(gh.number) || [];
    const id = list[0]?.identifier || '(missing)';
    console.log(`    GH-#${gh.number} → ${id}${list.length > 1 ? ` (+${list.length - 1} more)` : ''}`);
  }

  if (!SKIP_OBSIDIAN && !DRY_RUN) {
    try {
      console.log('\n🔄 Obsidian ↔ Linear mirror…');
      execFileSync(process.execPath, ['tools/obsidian-linear-sync.js'], {
        encoding: 'utf8',
        stdio: 'inherit',
      });
    } catch (err) {
      console.error('Error updating Obsidian notes:', err.message);
      process.exitCode = 1;
    }
  }

  // Exit codes for launchd honesty
  if (createFailures > 0 || missing.length > 0) {
    process.exitCode = 1;
    console.log('\n❌ Sync incomplete (create failures or missing mappings).');
  } else if (multi.length > 0 && !DRY_RUN) {
    process.exitCode = 1;
    console.log('\n❌ Sync incomplete (duplicates remain).');
  } else if (DRY_RUN) {
    console.log(
      `\n✅ Dry-run plan OK — would cancel ${canceled}, keep ${kept}, create ${created}. ` +
        `(Recount still shows pre-cancel multi-clones; re-run without --dry-run to apply.)`,
    );
  } else {
    console.log('\n✅ Idempotent sync OK — one Linear issue per open GitHub issue.');
  }
}

// Pure helpers exported for tests
module.exports = {
  parseGhNumber,
  groupGhClones,
  pickKeeper,
  linearTitleFor,
  GH_TITLE_RE,
};

if (require.main === module) {
  syncGitHubIssuesToLinear().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
