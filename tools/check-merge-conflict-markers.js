#!/usr/bin/env node
/**
 * Fail closed when unresolved VCS conflict markers land in always-on agent
 * surfaces. Incident class: AGENTS.md on branch fix/mobile-tab-pane… shipped
 * `<<<<<<< HEAD` … `>>>>>>> fbd788340` for ~200 lines (PR #1191), poisoning
 * every agent prefill. plan.md had a similar hit fixed in #1190.
 *
 *   node tools/check-merge-conflict-markers.js
 *   node tools/check-merge-conflict-markers.js --json
 *   git diff --name-only --cached | node tools/check-merge-conflict-markers.js --stdin
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

/** Always-on / high-blast-radius docs that agents inject every turn. */
const ALWAYS_ON_PATHS = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'plan.md',
  'hermes-mobile/AGENTS.md',
  'hermes-mobile/CLAUDE.md',
  'docs/agent-field-guide/index.md',
  'docs/agents/coordination.md',
];

const MARKER_RE = /^(<<<<<<< |>>>>>>> |=======\s*$|\|\|\|\|\|\|\| )/;

function parseArgs(argv) {
  const args = { json: false, stdin: false, paths: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--stdin') args.stdin = true;
    else if (a === '--paths') args.paths = requireValue(argv, ++i, a).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function readStdinPaths() {
  try {
    return fs
      .readFileSync(0, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function scanFile(relPath, repo = REPO) {
  const abs = path.join(repo, relPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return null;
  }
  const body = fs.readFileSync(abs, 'utf8');
  const hits = [];
  body.split('\n').forEach((line, idx) => {
    if (MARKER_RE.test(line)) {
      hits.push({ line: idx + 1, text: line.slice(0, 80) });
    }
  });
  if (hits.length === 0) return null;
  return { file: relPath, hits: hits.slice(0, 12), hitCount: hits.length };
}

/**
 * @param {{ repo?: string, paths?: string[]|null }} [opts]
 * @returns {{ ok: boolean, scanned: number, violations: object[] }}
 */
function checkMergeConflictMarkers({ repo = REPO, paths = null } = {}) {
  const list = paths && paths.length > 0 ? paths : ALWAYS_ON_PATHS;
  const violations = [];
  let scanned = 0;
  for (const rel of list) {
    // Only enforce always-on list unless caller passed explicit paths (staged files).
    if (paths && paths.length > 0) {
      const normalized = rel.replace(/^\.\//, '');
      const isAlwaysOn = ALWAYS_ON_PATHS.some(
        (p) => normalized === p || normalized.endsWith(`/${p}`) || normalized.startsWith(`${p}`),
      );
      // Staged mode: scan ANY staged text-ish path for markers (not only always-on).
      if (!/\.(md|txt|js|ts|tsx|mjs|cjs|yml|yaml|json|sh|rhai)$/i.test(normalized) && !ALWAYS_ON_PATHS.includes(normalized)) {
        continue;
      }
      void isAlwaysOn;
    }
    const result = scanFile(rel, repo);
    scanned += 1;
    if (result) violations.push(result);
  }
  return {
    ok: violations.length === 0,
    scanned,
    violations,
    alwaysOn: ALWAYS_ON_PATHS,
    checkedAt: new Date().toISOString(),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/check-merge-conflict-markers.js [--json] [--stdin] [--paths a,b]
Fail closed on unresolved VCS conflict markers in always-on agent docs (or stdin paths).`);
    process.exit(0);
  }
  let paths = args.paths;
  if (args.stdin) {
    paths = readStdinPaths();
  }
  const report = checkMergeConflictMarkers({ paths });
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.ok) {
    console.log(`✓ no merge conflict markers (${report.scanned} file(s) scanned)`);
  } else {
    console.error('✗ unresolved merge conflict markers:');
    for (const v of report.violations) {
      console.error(`  ${v.file} (${v.hitCount} hit(s))`);
      for (const h of v.hits.slice(0, 5)) {
        console.error(`    L${h.line}: ${h.text}`);
      }
    }
    console.error('Fix markers before commit. Never leave <<<<<<< / ======= / >>>>>>> in AGENTS.md or plan.md.');
  }
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  ALWAYS_ON_PATHS,
  MARKER_RE,
  checkMergeConflictMarkers,
  scanFile,
};

if (require.main === module) {
  main();
}
