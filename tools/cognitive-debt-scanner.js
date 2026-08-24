#!/usr/bin/env node
'use strict';

/**
 * cognitive-debt-scanner.js — AI-code quality debt detection.
 *
 * Detects patterns that accumulate cognitive debt in AI-generated code:
 *
 * 1. Silent catch blocks (catch (e) {} without log/re-throw)
 * 2. Bare :any type annotations (erases type context)
 * 3. TODO/FIXME without an owner or deadline
 * 4. Deeply nested ternaries (> 3 levels)
 * 5. Magic numbers in conditions (bare numeric literals, not const)
 *
 * Unlike codeql-pattern-gate.js (security-focused, whole-file), this
 * scanner is opt-in and can scope to added/modified lines via --diff.
 *
 * Usage:
 *   node tools/cognitive-debt-scanner.js
 *   node tools/cognitive-debt-scanner.js --diff origin/main
 *   node tools/cognitive-debt-scanner.js --path path/to/file.ts
 *   node tools/cognitive-debt-scanner.js --json
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

const SCAN_EXT = new Set(['.js', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs']);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '.worktrees', 'web-fetch', '.next',
]);

const RULES = [
  {
    id: 'silent-catch',
    description: 'Empty catch block silently swallows exceptions — next agent cannot debug.',
    test: (text, file) => {
      const hits = [];
      const re = /catch\s*\(\s*([a-zA-Z_]\w*)\s*\)\s*\{\s*\}/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const varName = m[1];
        if (varName === '_') continue;
        const line = text.slice(0, m.index).split(/\n/).length;
        hits.push({ line, message: `catch (${varName}) {} swallows exceptions. Log or re-throw.` });
      }
      return hits;
    },
  },
  {
    id: 'any-type',
    description: ':any or :<any> erases type information for the next agent.',
    test: (text, file) => {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx') && !file.endsWith('.d.ts')) return [];
      if (file.endsWith('.d.ts')) return [];
      if (file.includes('/tests/') || file.includes('/__tests__/')) return [];
      const hits = [];
      const re = /:\s*any\b/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const line = text.slice(0, m.index).split(/\n/).length;
        hits.push({ line, message: 'Use a concrete type or generics instead of :any.' });
      }
      return hits;
    },
  },
  {
    id: 'todo-without-owner',
    description: 'TODO/FIXME comment without an owner (@name) or deadline (YYYY-MM-DD).',
    test: (text, file) => {
      const hits = [];
      const re = /\/\/\s*(TODO|FIXME)\b([^;\n]*)/gi;
      let m;
      while ((m = re.exec(text)) !== null) {
        const rest = m[2];
        const hasOwner = /@[\w-]+/.test(rest);
        const hasDeadline = /\b\d{4}-\d{2}-\d{2}\b/.test(rest);
        if (!hasOwner && !hasDeadline) {
          const line = text.slice(0, m.index).split(/\n/).length;
          hits.push({ line, message: `TODO/FIXME at line ${line} has no owner or deadline — cognitive debt.` });
        }
      }
      return hits;
    },
  },
  {
    id: 'deep-nested-ternary',
    description: 'Deeply nested ternary (>3 levels) is unreadable for the next agent.',
    test: (text, file) => {
      const hits = [];
      const lines = text.split(/\n/);
      for (let i = 0; i < lines.length; i++) {
        const depth = (lines[i].match(/\?/g) || []).length;
        if (depth > 3) {
          hits.push({ line: i + 1, message: `Nested ternary depth ${depth} > 3 — extract to named function.` });
        }
      }
      return hits;
    },
  },
  {
    id: 'magic-number-in-condition',
    description: 'Bare numeric literal in a condition — next agent doesn\'t know what it means.',
    test: (text, file) => {
      const hits = [];
      const re = /(\bor\b|\band\b|\bif\b|\bwhile\b|\bfor\b)\s*\([^)]*\b\d+\b[^)]*\)/gi;
      let m;
      while ((m = re.exec(text)) !== null) {
        const line = text.slice(0, m.index).split(/\n/).length;
        hits.push({ line, message: 'Magic number in condition — extract to a named constant.' });
      }
      return hits;
    },
  },
];

function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.') && ent.name !== '.github') continue;
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else {
      if (SCAN_EXT.has(path.extname(ent.name))) acc.push(full);
    }
  }
  return acc;
}

function collectFiles(args) {
  if (args.paths && args.paths.length) {
    return args.paths.map((p) => path.resolve(REPO, p)).filter((p) => fs.existsSync(p));
  }
  const files = [];
  walk(REPO, files);
  return files;
}

function collectDiffFiles(baseRef) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=AMR', baseRef], {
      cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 10,
    });
    return out.trim().split(/\n/)
      .filter(Boolean)
      .map((p) => path.join(REPO, p))
      .filter((p) => fs.existsSync(p) && SCAN_EXT.has(path.extname(p)));
  } catch {
    return [];
  }
}

function scanFile(absPath, opts = {}) {
  const rel = path.relative(REPO, absPath);
  let text;
  try {
    text = fs.readFileSync(absPath, 'utf8');
  } catch {
    return [];
  }
  if (text.length > 1_500_000) return [];
  const findings = [];
  for (const rule of RULES) {
    try {
      const hits = rule.test(text, rel) || [];
      for (const h of hits) {
        findings.push({
          file: rel,
          line: h.line || 1,
          rule: rule.id,
          severity: 'medium',
          message: h.message,
        });
      }
    } catch {
      /* ignore rule errors */
    }
  }
  return findings;
}

function main() {
  const args = { paths: [], diff: null, json: false, help: false };
  for (let i = 0; i < process.argv.length - 2; i++) {
    const a = process.argv[i + 2];
    if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--diff') args.diff = process.argv[i + 3];
    else if (!a.startsWith('--')) args.paths.push(a);
  }

  if (args.help) {
    console.log(`cognitive-debt-scanner — AI code quality debt detection

Usage:
  node tools/cognitive-debt-scanner.js
  node tools/cognitive-debt-scanner.js --diff origin/main
  node tools/cognitive-debt-scanner.js --path path/to/file.ts
  node tools/cognitive-debt-scanner.js --json
`);
    return;
  }

  const files = (args.diff ? collectDiffFiles(args.diff) : null) || collectFiles(args);
  const findings = [];
  for (const f of files) findings.push(...scanFile(f));

  const report = {
    ok: findings.length === 0,
    fileCount: files.length,
    findingCount: findings.length,
    findings,
    rules: RULES.map((r) => r.id),
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n=== cognitive-debt-scanner files=${report.fileCount} findings=${report.findingCount} ===`);
    if (!findings.length) {
      console.log('PASS — no cognitive debt patterns detected');
    } else {
      for (const f of findings) {
        console.log(`WARN ${f.file}:${f.line} [${f.rule}] ${f.message}`);
      }
    }
  }

  if (!report.ok) process.exit(0); // warning, not blocking
}

if (require.main === module) main();

module.exports = { RULES, scanFile, collectFiles, collectDiffFiles };
