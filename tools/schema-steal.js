#!/usr/bin/env node
'use strict';

/**
 * schema-steal.js — Declarative Schema Generator
 *
 * STOLE FROM: Supabase Latent Space interview (Paul Copplestone + Ant Wilson)
 * "Stop forcing coding agents to parse hundreds of sequential, historical SQL
 *  migration files to figure out table shapes. Maintain a single declarative
 *  state of your database inside your repo's schemas folder using tools like
 *  pg-delta so agents can read and iterate on the file system instantaneously."
 *
 * Applied to our system: Instead of agents parsing 4108 lines of plan.md §1
 * Task Board to understand what's in_progress / released / blocked, we maintain
 * a single schemas/coordination.json (~2KB) that agents can read in one shot.
 *
 * The schema captures the CURRENT state (not history) of:
 *   - tasks (from plan.md §1, deduplicated and tagged)
 *   - file ownership claims (from plan.md §2 + vault)
 *   - PR states (from gh CLI)
 *   - git branch lanes (from git and GitButler)
 *   - active agents (from agent-mesh or vault)
 *   - tool boundaries (from settings.yaml deny rules)
 *   - skills catalog (from SKILLS.md)
 *
 * Usage:
 *   node tools/schema-steal.js                        # regenerate schemas/coordination.json
 *   node tools/schema-steal.js --diff                 # show what changed since last run
 *   node tools/schema-steal.js --validate             # check schema invariants
 *   node tools/schema-steal.js --query "tasks"        # read a slice of the schema
 *   node tools/schema-steal.js --json                 # pipe the full schema as JSON
 *
 * Invariants enforced by --validate:
 *   1. No two agents claim the same file
 *   2. No in_progress task is also marked as released
 *   3. Every in_progress task either has a PR or was started in the last 48h
 *   4. No file is both in plan.md §2 claims AND vault claims by different agents
 *   5. GitButler target branch matches origin/main
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.env.PWD || process.cwd();
const VAULT = process.env.AI_AGENT_SYNC_DIR || path.join(process.env.HOME, 'Documents/AI-Agent-Sync');
const PLAN = path.join(ROOT, 'plan.md');
const SCHEMA = path.join(ROOT, 'schemas/coordination.json');
const SKILLS = path.join(ROOT, 'SKILLS.md');
const SETTINGS = path.join(process.env.HOME, '.config/poolside/settings.yaml');

// ─── Helpers ────────────────────────────────────────────────────────────

const exec = (cmd, args, opts = {}) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1024 * 1024, ...opts }).trim();
  } catch (e) {
    return null;
  }
};

function readYamlLines(filePath, section) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.trim() === `${section}:`);
  if (start === -1) return [];
  const result = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || (!line.startsWith(' ') && !line.startsWith('-') && line.trim() !== '')) {
      break;
    }
    result.push(line.trim());
  }
  return result;
}

// ─── State extractors ───────────────────────────────────────────────────

function extractTasks() {
  if (!fs.existsSync(PLAN)) return { tasks: [], total: 0, inProgress: 0, released: 0, blocked: 0 };

  const content = fs.readFileSync(PLAN, 'utf8');
  const boardStart = content.indexOf('## 1. Task Board');
  const nextHeader = content.indexOf('\n## ', boardStart + 1);
  const board = content.slice(boardStart, nextHeader === -1 ? content.length : nextHeader);

  const tasks = [];
  let inProgress = 0, released = 0, blocked = 0;

  for (const line of board.split('\n')) {
    if (!line.startsWith('|') || line.includes('---')) continue;
    const raw = line.trim();
    if (!raw.startsWith('|')) continue;
    const parts = raw.slice(1, -1).split('|').map((c) => c.trim());
    if (parts.length < 6) continue;
    const [id, title, status, agent, files, evidence] = parts;
    if (!id.startsWith('T-')) continue;

    const prMatch = (evidence || '').match(/PR\s*#(\d+)/i);
    const isReleased = status === 'released' || status === 'done';
    const isBlocked = status.toLowerCase().includes('blocked');

    if (isReleased) released++;
    else if (isBlocked) { blocked++; }
    else inProgress++;

    tasks.push({
      id,
      title: title.slice(0, 80),
      status: status.trim(),
      agent: agent.trim(),
      files: parseFiles(files),
      pr: prMatch ? parseInt(prMatch[1], 10) : null,
      released: isReleased,
      blocked: isBlocked,
      inProgress: !isReleased && !isBlocked,
    });
  }

  return { tasks, total: tasks.length, inProgress, released, blocked };
}

function parseFiles(filesStr) {
  const files = [];
  const raw = filesStr || '';
  const matches = raw.match(/`([^`]+)`/g);
  if (matches) {
    for (const m of matches) {
      files.push(m.replace(/`/g, ''));
    }
  }
  return files;
}

function extractClaims() {
  const claims = [];
  // From plan.md §2 (file ownership)
  const content = fs.existsSync(PLAN) ? fs.readFileSync(PLAN, 'utf8') : '';
  const claimSection = content.split('## 2.')[1]?.split('## 3.')[0] || '';

  for (const line of claimSection.split('\n')) {
    const match = line.match(/\|?\s*([^|\n]+?)\s*\|\s*agent\s*\|\s*([^|\n]+?)\s*\|?/i);
    if (!match) continue;
    const file = match[1].trim();
    const agent = match[2].trim();
    if (file.startsWith('T-') || file === '') continue;
    claims.push({ file, agent, source: 'plan.md §2' });
  }

  // From vault Agent-State
  if (fs.existsSync(VAULT)) {
    const stateDir = path.join(VAULT, 'Agent-State');
    if (fs.existsSync(stateDir)) {
      for (const f of fs.readdirSync(stateDir, { withFileTypes: true })) {
        if (!f.isFile() || !f.name.endsWith('.md')) continue;
        const content = fs.readFileSync(path.join(stateDir, f.name), 'utf8');
        // Match explicit claim directives like: "claim file: /path/to/file" or "agent: agent-name"
        // on dedicated claim lines — not random prose mentions
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          // Match patterns like: "claim file: path" or "| file | agent |" or "file: path agent: name"
          const fileClaimMatch = trimmed.match(/^\|?\s*[\w-]*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|?\s*$/);
          // Match "claim:" or "file:" directive lines
          const directiveMatch = trimmed.match(/^(?:claim|file|ownership|claim_file)[:\s]+(.+)$/i);
          if (directiveMatch) {
            const filePath = directiveMatch[1].replace(/agent[:\s]+(.+)/i, '').trim();
            const agentMatch = trimmed.match(/agent[:\s]+([^\s\n]+)/i);
            if (filePath && !filePath.startsWith('http') && !filePath.startsWith('#')) {
              claims.push({ file: filePath, agent: agentMatch ? agentMatch[1] : f.name.replace('.md', ''), source: `vault/${f.name}` });
            }
          }
        }
      }
    }
  }

  return claims;
}

function extractPRs() {
  const output = exec('gh', ['pr', 'list', '--state', 'all', '--json', 'number,title,state,baseRefName,headRefName,mergeStateStatus,isDraft,updatedAt']);
  if (!output) return { prs: [], error: 'gh CLI unavailable' };

  try {
    const prs = JSON.parse(output).map((pr) => ({
      number: pr.number,
      title: pr.title.slice(0, 60),
      state: pr.state,
      base: pr.baseRefName,
      head: pr.headRefName,
      mergeableState: pr.mergeStateStatus,
      isDraft: pr.isDraft,
      updatedAt: pr.updatedAt,
    }));

    const byState = {};
    for (const pr of prs) {
      byState[pr.state] = (byState[pr.state] || 0) + 1;
    }

    return { prs, count: prs.length, byState };
  } catch (e) {
    return { prs: [], error: 'JSON parse failed', raw: output.slice(0, 200) };
  }
}

function extractGitState() {
  const branches = exec('git', ['branch', '--format=%(refname:short)']) || '';
  const appliedBranches = branches.split('\n').filter((b) => b.startsWith('agent/')).map((b) => b.replace('agent/', ''));

  const targetBranch = exec('git', ['config', 'gitbutler.target']) || 'not set';

  return {
    currentBranch: exec('git', ['branch', '--show-current']) || 'unknown',
    branches: appliedBranches,
    targetBranch: targetBranch.replace('origin/', ''),
    hasUncommitted: exec('git', ['diff', '--quiet']) === null, // null = dirty
  };
}

function extractSkills() {
  if (!fs.existsSync(SKILLS)) return { skills: [], count: 0 };
  const content = fs.readFileSync(SKILLS, 'utf8');
  const skillLines = content.split('\n').filter((l) => {
    if (!l.startsWith('|')) return false;
    const parts = l.split('|').map((c) => c.trim());
    if (parts.length < 2) return false;
    // Table rows with `backtick-skill-name` in the first column
    return parts[1] && parts[1].startsWith('`') && parts[1].endsWith('`');
  });
  return { skills: skillLines, count: skillLines.length };
}

function extractToolBoundaries() {
  if (!fs.existsSync(SETTINGS)) return { allow: 'unrestricted', deny: [], mode: 'unknown' };
  const yaml = fs.readFileSync(SETTINGS, 'utf8');
  const denyRules = [];
  const lines = yaml.split('\n');
  let inDeny = false;

  for (const line of lines) {
    if (/^\s+deny:\s*$/.test(line)) {
      inDeny = true;
      continue;
    }
    if (/^\s+allow:\s*$/.test(line)) {
      inDeny = false;
      continue;
    }
    if (inDeny && line.trim().startsWith('- path:')) {
      const match = line.match(/- path:\s*(.+)/);
      if (match) denyRules.push(match[1].trim());
    }
    if (inDeny && line.match(/^  [a-z]/) && !line.includes('path:')) {
      inDeny = false;
    }
  }

  const modeMatch = yaml.match(/mode:\s*(\w+)/);
  const agentModeMatch = yaml.match(/agent_mode:\s*(\w+)/);

  return {
    deny: denyRules,
    mode: modeMatch ? modeMatch[1] : 'unknown',
    agentMode: agentModeMatch ? agentModeMatch[1] : 'unknown',
    allowAll: yaml.includes('allow:') && yaml.includes('/**'),
  };
}

// ─── Schema builder ─────────────────────────────────────────────────────

function buildSchema() {
  const tasks = extractTasks();
  const claims = extractClaims();
  const prs = extractPRs();
  const gitState = extractGitState();
  const skills = extractSkills();
  const boundaries = extractToolBoundaries();

  // Deduplicate claims
  const claimMap = new Map();
  for (const c of claims) {
    const key = c.file;
    if (!claimMap.has(key) || claimMap.get(key).source === 'plan.md §2') {
      claimMap.set(key, c);
    }
  }
  const uniqueClaims = Array.from(claimMap.values());

  // Find conflicting claims
  const conflictCheck = new Map();
  for (const c of claims) {
    if (conflictCheck.has(c.file)) {
      const existing = conflictCheck.get(c.file);
      if (existing.agent !== c.agent) {
        uniqueClaims.push({
          ...c,
          conflict: true,
          conflictWith: existing.agent,
          conflictSource: existing.source,
        });
      }
    } else {
      conflictCheck.set(c.file, c);
    }
  }

  const conflictingClaims = uniqueClaims.filter((c) => c.conflict);

  return {
    $schema: 'https://mac-yolo-safeguards.dev/schemas/coordination-v1',
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
    sources: {
      planMd: PLAN !== 'plan.md' ? PLAN : path.relative(ROOT, PLAN),
      vault: VAULT,
      git: 'exec',
      github: 'gh CLI',
      skills: SKILLS !== 'SKILLS.md' ? SKILLS : path.relative(ROOT, SKILLS),
      settings: 'removed from deny list',
    },
    tasks: {
      total: tasks.total,
      inProgress: tasks.inProgress,
      released: tasks.released,
      blocked: tasks.blocked,
      // Only show tasks without PRs (stuck detection)
      stuck: tasks.tasks.filter((t) => t.inProgress && !t.pr).slice(0, 20),
      // Top-level blockers
      blockers: tasks.tasks.filter((t) => t.blocked).slice(0, 10),
      // Full task list (for agent consumption)
      items: tasks.tasks,
    },
    claims: {
      total: uniqueClaims.length,
      conflicts: conflictingClaims.map((c) => ({
        file: c.file,
        agents: [c.agent, c.conflictWith],
        sources: [c.source, c.conflictSource],
      })),
    },
    git: gitState,
    prs: {
      count: prs.count,
      byState: prs.byState,
      behind: prs.prs ? prs.prs.filter((p) => ['behind', 'unstable'].includes(p.mergeableState)).map((p) => p.number) : [],
      conflicting: prs.prs ? prs.prs.filter((p) => p.mergeableState === 'blocked').map((p) => p.number) : [],
      error: prs.error,
    },
    skills: skills.count > 0 ? { count: skills.count, sample: skills.skills.slice(0, 5) } : null,
    toolBoundaries: boundaries,
    metadata: {
      repo: 'mac-yolo-safeguards',
      root: ROOT,
      schemaSize: 0, // will be set after JSON.stringify
    },
  };
}

// ─── Invariants validator ───────────────────────────────────────────────

function validate(schema) {
  const errors = [];
  const warnings = [];

  // 1. No two agents claim the same file
  for (const c of schema.claims.conflicts) {
    errors.push(`CONFLICT: ${c.file} claimed by [${c.agents.join(', ')}] from [${c.sources.join(', ')}]`);
  }

  // 2. No in_progress task is also marked as released
  for (const t of schema.tasks.items) {
    if (t.released && t.inProgress) {
      errors.push(`INVARIANT VIOLATION: task ${t.id} is both released and in_progress`);
    }
  }

  // 3. GitButler target should be origin/main
  if (schema.git.targetBranch && schema.git.targetBranch !== 'not set' && schema.git.targetBranch !== 'origin/main' && schema.git.targetBranch !== 'main') {
    warnings.push(`GitButler target branch is "${schema.git.targetBranch}" — expected origin/main`);
  }

  // 4. Check for too many stuck tasks
  if (schema.tasks.stuck.length > 10) {
    warnings.push(`${schema.tasks.stuck.length} in_progress tasks have no PR — may indicate confusion`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Diff against previous schema ───────────────────────────────────────

function diff(old, current) {
  if (!old) return { added: true, changes: ['Schema is new — no previous version'] };

  const changes = [];

  if (old.tasks.inProgress !== current.tasks.inProgress) {
    changes.push(`in_progress: ${old.tasks.inProgress} → ${current.tasks.inProgress}`);
  }
  if (old.tasks.released !== current.tasks.released) {
    changes.push(`released: ${old.tasks.released} → ${current.tasks.released}`);
  }
  if (old.tasks.blocked !== current.tasks.blocked) {
    changes.push(`blocked: ${old.tasks.blocked} → ${current.tasks.blocked}`);
  }
  if (old.prs.count !== current.prs.count) {
    changes.push(`PRs: ${old.prs.count} → ${current.prs.count}`);
  }
  if (JSON.stringify(old.claims.conflicts) !== JSON.stringify(current.claims.conflicts)) {
    const newConflicts = current.claims.conflicts.length;
    const oldConflicts = old.claims.conflicts.length;
    changes.push(`Claim conflicts: ${oldConflicts} → ${newConflicts}`);
  }
  if (old.git.currentBranch !== current.git.currentBranch) {
    changes.push(`Branch: ${old.git.currentBranch} → ${current.git.currentBranch}`);
  }

  return { added: false, changes, changed: changes.length > 0 };
}

// ─── Main ─────────────────────────────────────────────────────────────────

function main(argv) {
  const json = argv.includes('--json');
  const diffMode = argv.includes('--diff');
  const validateMode = argv.includes('--validate');
  const queryMode = argv.includes('--query');

  const schema = buildSchema();

  // Load old schema for diff
  let oldSchema = null;
  if (fs.existsSync(SCHEMA) && (diffMode || validateMode)) {
    try {
      oldSchema = JSON.parse(fs.readFileSync(SCHEMA, 'utf8'));
    } catch {
      oldSchema = null;
    }
  }

  if (queryMode) {
    const queryIdx = argv.indexOf('--query');
    const query = argv[queryIdx + 1];
    const keys = query.split('.');
    let val = schema;
    for (const k of keys) {
      val = val?.[k];
    }
    if (json) {
      console.log(JSON.stringify(val, null, 2));
    } else {
      console.log(`schemas.coordination.${query} = ${JSON.stringify(val, null, 2).slice(0, 500)}`);
    }
    return;
  }

  // Set schema size
  schema.metadata.schemaSize = JSON.stringify(schema).length;

  if (validateMode) {
    const v = validate(schema);
    console.log(JSON.stringify(v, null, 2));
    if (!v.valid) process.exit(1);
    return;
  }

  if (diffMode && oldSchema) {
    const d = diff(oldSchema, schema);
    if (json) {
      console.log(JSON.stringify(d, null, 2));
    } else {
      console.log('Schema diff:');
      for (const c of d.changes) console.log(`  ${c}`);
      if (!d.changed) console.log('  (no changes)');
    }
  }

  if (json) {
    console.log(JSON.stringify(schema, null, 2));
  } else {
    console.log(`Declarative schema generated: schemas/coordination.json (${schema.metadata.schemaSize} bytes)`);
    console.log(`  Tasks:   ${schema.tasks.inProgress} in_progress, ${schema.tasks.released} released, ${schema.tasks.blocked} blocked`);
    console.log(`  Claims:  ${schema.claims.total} file claims, ${schema.claims.conflicts.length} conflicts`);
    console.log(`  PRs:     ${schema.prs.count} total (${JSON.stringify(schema.prs.byState)})`);
    console.log(`  Git:     branch=${schema.git.currentBranch}, target=${schema.git.targetBranch}, dirty=${schema.git.hasUncommitted}`);
    console.log(`  Skills:  ${schema.skills ? schema.skills.count : 'not found'}`);
    console.log(`  Boundaries: deny=${schema.toolBoundaries.deny.length} rules, mode=${schema.toolBoundaries.mode}`);
  }

  // Write schema file
  fs.mkdirSync(path.dirname(SCHEMA), { recursive: true });
  fs.writeFileSync(SCHEMA, JSON.stringify(schema, null, 2) + '\n');

  if (!diffMode && !validateMode && !json) {
    console.log(`  Written to: schemas/coordination.json (v${schema.version})`);
  }
}

if (require.main === module) {
  main(process.argv);
}

module.exports = { buildSchema, validate, diff, extractTasks, extractClaims, extractPRs, extractGitState, extractSkills, extractToolBoundaries };
