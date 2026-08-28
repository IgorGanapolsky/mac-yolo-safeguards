#!/usr/bin/env node
'use strict';

/**
 * codeql-pattern-gate.js — OFFLINE prevention of CodeQL debt classes.
 *
 * Scans source for patterns that repeatedly produced open Security alerts.
 * Runs in CI without network. Does not replace CodeQL — shifts detection left.
 *
 *   node tools/codeql-pattern-gate.js
 *   node tools/codeql-pattern-gate.js --staged
 *   node tools/codeql-pattern-gate.js --diff origin/main
 *   node tools/codeql-pattern-gate.js --json
 *
 * Exit 0 clean · 1 violations · 2 usage
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.worktrees',
  'business_os',
  'android',
  'ios',
  'Pods',
  '.expo',
  'vendor',
  'parallel-research',
  'graphify-out',
  'tmp',
  'tmp-store-shots',
]);

const SCAN_EXT = new Set([
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.yml',
  '.yaml',
]);

/**
 * Files that OWN safe HTML handling (or describe the banned forms on purpose),
 * so `no-naive-script-strip` must never fire on them.
 */
const HTML_HELPER_OWNERS =
  /(?:safe-html-strip|html-to-markdown|codeql-pattern-gate|test-codeql-pattern-gate)\.js$/;

const HTML_HELPER_HINT =
  'Do not hand-roll HTML filtering: use tools/lib/html-to-markdown.js (tokenizer, for HTML to text/Markdown) or tools/lib/safe-html-strip.js (plain strip).';

/**
 * Each rule maps to a CodeQL class we burned down.
 * Keep patterns specific enough to avoid noise in tests/docs.
 */
const RULES = [
  {
    id: 'no-createSign-SHA256-jwt-handroll',
    codeql: 'js/insufficient-password-hash',
    severity: 'high',
    // Prefer tools/lib/asc-jwt-es256.js (crypto.sign)
    test: (text, file) => {
      if (file.includes('tools/lib/asc-jwt-es256.js')) return [];
      if (!/createSign\s*\(\s*['"]SHA256['"]\s*\)/.test(text)) return [];
      return [
        {
          line: lineOf(text, /createSign\s*\(\s*['"]SHA256['"]\s*\)/),
          message:
            'Use tools/lib/asc-jwt-es256.js (crypto.sign) instead of createSign(SHA256) for ASC/JWT — CodeQL flags this as password-hash.',
        },
      ];
    },
  },
  {
    id: 'no-execSync-shell-template',
    codeql: 'js/shell-command-injection-from-environment',
    severity: 'high',
    test: (text, file) => {
      if (file.includes('codeql-pattern-gate.js')) return [];
      const hits = [];
      // execSync(`...${...}...`) shell interpolation
      const re = /execSync\s*\(\s*`[^`]*\$\{/;
      if (re.test(text)) {
        hits.push({
          line: lineOf(text, re),
          message:
            'execSync with template-literal interpolation is shell injection risk. Use execFileSync(bin, [args]) with shell:false.',
        });
      }
      // shell: true
      if (/shell\s*:\s*true/.test(text) && /execSync|spawnSync|exec\(/.test(text)) {
        hits.push({
          line: lineOf(text, /shell\s*:\s*true/),
          message: 'shell:true with child_process is banned for new code. Use argv form + shell:false.',
        });
      }
      return hits;
    },
  },
  {
    id: 'no-url-host-includes-substring',
    codeql: 'js/incomplete-url-substring-sanitization',
    severity: 'high',
    test: (text, file) => {
      if (file.includes('safe-url-host.js') || file.includes('codeql-pattern-gate.js')) return [];
      // u.includes('reddit.com') style host checks
      const re =
        /\.includes\s*\(\s*['"](?:https?:\/\/)?(?:www\.)?(?:medium\.com|reddit\.com|linkedin\.com|twitter\.com|x\.com|threads\.(?:net|com)|news\.ycombinator\.com|bsky\.(?:app|social)|dev\.to)/;
      if (!re.test(text)) return [];
      // allow array.includes exact hostname in tests is ok if not URL-like variable — still flag for safety
      return [
        {
          line: lineOf(text, re),
          message:
            'Do not check hosts with string.includes. Use tools/lib/safe-url-host.js (URL.hostname + hostIsOrSubdomain).',
        },
      ];
    },
  },
  {
    // Hand-rolled HTML / script filtering over untrusted markup.
    //
    // PR #2010 shipped exactly this and CodeQL raised 5 alerts on one file:
    // js/bad-tag-filter, 3x js/incomplete-multi-character-sanitization and
    // js/double-escaping. The rule that was meant to stop it knew a single
    // spelling, /<script[\s\S]*?<\/script>/, and did not even catch that one:
    // its patterns looked for an unescaped `</script>`, but a regex literal in
    // real source always carries the escaped `<\/script>`, so it never fired.
    //
    // Scope is deliberate: flag the SHAPES CodeQL actually alerts on. A lossy
    // `.replace(/<[^>]+>/g, ' ')` text extraction, an attribute-tolerant end
    // tag (`<\/script\b[^>]*>`), and an entity chain that unescapes `&amp;`
    // LAST are all correct-enough and are NOT flagged — main carries several of
    // each and CodeQL reports none of them. A gate that cries wolf gets
    // switched off, which is worse than the gap it closes.
    id: 'no-naive-script-strip',
    codeql: 'js/bad-tag-filter, js/incomplete-multi-character-sanitization, js/double-escaping',
    severity: 'high',
    test: (text, file) => {
      if (HTML_HELPER_OWNERS.test(file)) return [];
      const hits = [];
      const add = (re, message) => {
        if (re.test(text)) hits.push({ line: lineOf(text, re), message });
      };

      // 1. End tag matched as a literal `</script>` or `</script\s*>`.
      //    `</script >`, `</script\t>` and `</script bar>` all close the
      //    element, so the filter leaks the body it was supposed to remove.
      add(
        /<\\\/(?:script|style|noscript|iframe)(?:\\s\*)?>/i,
        `Tag filter anchored on a literal end tag leaks "</script >" and "</script bar>" (js/bad-tag-filter). ${HTML_HELPER_HINT}`
      );

      // 2. The negative-lookahead / nested-quantifier tag filter
      //    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi — the exact
      //    spelling that walked past this gate in PR #2010.
      add(
        /\(\?:\(\?!<\\\/[A-Za-z][A-Za-z0-9]*\s*>\)/,
        `Nested-quantifier tag filter is a single incomplete removal pass (js/incomplete-multi-character-sanitization). ${HTML_HELPER_HINT}`
      );

      // 3. Scanning for the end tag as a plain string has the same blind spot.
      add(
        /\.(?:indexOf|lastIndexOf|split|includes|startsWith|endsWith)\s*\(\s*(['"`])<\/(?:script|style|noscript|iframe)\s*>\1/i,
        `Searching for the literal string "</script>" misses "</script >" and "</script bar>" (js/bad-tag-filter). ${HTML_HELPER_HINT}`
      );

      // 4. Entity unescaping that decodes `&amp;` BEFORE another entity:
      //    `&amp;lt;` -> `&lt;` -> `<` (js/double-escaping). Decoding `&amp;`
      //    last is the safe order and is not flagged.
      add(
        /\.replace\(\s*\/&amp;\/[gimsuy]*\s*,[\s\S]{0,80}?\)\s*\.replace\(\s*\/&(?:lt|gt|quot|apos|nbsp|#x?[0-9a-fA-F]+)/,
        `Unescaping &amp; before other entities turns "&amp;lt;" into "<" (js/double-escaping). Decode in one pass — decodeBasicEntities() in tools/lib/safe-html-strip.js.`
      );

      // 5. Single-pass comment removal, reported only as part of a filter chain
      //    already flagged above: on its own it is not what CodeQL reports and
      //    main carries it in reviewed code.
      if (hits.length) {
        add(
          /\/<!--\[\\s\\S\]\*\?-->\//,
          `Single-pass comment removal is part of the same hand-rolled filter — "<!-->" and "--!>" also end a comment. ${HTML_HELPER_HINT}`
        );
      }

      return hits;
    },
  },
  {
    id: 'no-cleartext-env-log',
    codeql: 'js/clear-text-logging',
    severity: 'high',
    test: (text, file) => {
      if (file.includes('codeql-pattern-gate.js')) return [];
      const hits = [];
      // Only flag logging of secret-like env names (TOKEN/KEY/SECRET/PASSWORD/JSON credentials).
      const re =
        /console\.(log|error|info|warn|debug)\s*\([\s\S]{0,200}?process\.env\.[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL|API_KEY|SERVICE_ACCOUNT)[A-Z0-9_]*/;
      if (re.test(text)) {
        hits.push({
          line: lineOf(text, re),
          message:
            'Do not log secret-like process.env values (CodeQL clear-text-logging). Log booleans/lengths only.',
        });
      }
      return hits;
    },
  },
  {
    id: 'no-redos-trim-polyfill',
    codeql: 'js/polynomial-redos',
    severity: 'high',
    test: (text, file) => {
      if (file.includes('codeql-pattern-gate.js')) return [];
      // Only flag actual .replace(/^-+|-+$/g, ...) not docs/comments about the trap.
      const re = /\.replace\s*\(\s*\/\^-\+\|-\+\$\/g?\s*,/;
      if (re.test(text)) {
        return [
          {
            line: lineOf(text, re),
            message:
              'Split trim regex into .replace(/^-+/, "").replace(/-+$/, "") — CodeQL polynomial-redos.',
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'workflow-permissions-required',
    codeql: 'actions/missing-workflow-permissions',
    severity: 'medium',
    test: (text, file) => {
      if (!file.endsWith('.yml') && !file.endsWith('.yaml')) return [];
      if (!file.includes('.github/workflows/')) return [];
      if (!/^name:\s/m.test(text)) return [];
      // Must declare top-level permissions
      if (/^permissions:\s*$/m.test(text) || /^permissions:\s*\n/m.test(text) || /permissions:\s*\{/.test(text) || /permissions:\s*\w+/.test(text)) {
        return [];
      }
      // skip reusable workflow callers that inherit
      if (/uses:\s*\./.test(text) && !/runs-on:/.test(text)) return [];
      return [
        {
          line: 1,
          message:
            'Workflow missing top-level permissions: (e.g. permissions: contents: read). CodeQL actions/missing-workflow-permissions.',
        },
      ];
    },
  },
  {
    // AI-generated code often uses `: any` or `:<any>` type assertions,
    // which erases type-safety context for the next agent. Cognitive debt.
    id: 'no-any-type-annotation',
    codeql: 'js/any-type-assertion',
    severity: 'medium',
    test: (text, file) => {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) return [];
      // Exclude type declaration files (ambient types may legitimately use any).
      if (file.endsWith('.d.ts')) return [];
      // Allowlist files that intentionally use any (e.g. type test helpers, interop).
      if (file.includes('/tests/') || file.includes('/__tests__/')) return [];
      const re = /:\s*any\b/;
      if (!re.test(text)) return [];
      const hits = [];
      const lines = text.split(/\n/);
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          hits.push({
            line: i + 1,
            message:
              ': \': any\' erases type information for the next agent. Use a concrete type or generics — cognitive debt in AI-generated code.',
          });
        }
      }
      return hits;
    },
  },
];


function stripComments(text) {
  // Reduce false positives from explanatory comments/docs that mention banned APIs.
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (m) => {
      // keep URL schemes like http://
      if (m.includes('://') && !m.trimStart().startsWith('//')) return m;
      const i = m.indexOf('//');
      if (i < 0) return m;
      return m.slice(0, i);
    });
}

function lineOf(text, re) {
  const m = text.match(re);
  if (!m) return 1;
  const idx = text.indexOf(m[0]);
  if (idx < 0) return 1;
  return text.slice(0, idx).split(/\n/).length;
}

function parseArgs(argv) {
  const out = { staged: false, diff: null, json: false, help: false, paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--staged') out.staged = true;
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--diff') out.diff = argv[++i];
    else if (!a.startsWith('-')) out.paths.push(a);
  }
  return out;
}

function listFilesFromGit(args) {
  try {
    if (args.staged) {
      return execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
        cwd: REPO,
        encoding: 'utf8',
      })
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (args.diff) {
      return execFileSync('git', ['diff', '--name-only', `${args.diff}...HEAD`], {
        cwd: REPO,
        encoding: 'utf8',
      })
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {
    return [];
  }
  return null;
}

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
      const ext = path.extname(ent.name);
      if (ent.name === 'test-codeql-pattern-gate.js') continue;
      if (SCAN_EXT.has(ext)) acc.push(full);
    }
  }
  return acc;
}

function collectFiles(args) {
  if (args.paths.length) {
    return args.paths.map((p) => path.resolve(REPO, p)).filter((p) => fs.existsSync(p));
  }
  const fromGit = listFilesFromGit(args);
  if (fromGit) {
    return fromGit
      .map((p) => path.join(REPO, p))
      .filter((p) => fs.existsSync(p) && SCAN_EXT.has(path.extname(p)) && !p.endsWith('test-codeql-pattern-gate.js'));
  }
  // Default: tools, hermes-mobile/scripts, services, tests, .github/workflows
  const roots = [
    path.join(REPO, 'tools'),
    path.join(REPO, 'services'),
    path.join(REPO, 'tests'),
    path.join(REPO, 'hermes-mobile', 'scripts'),
    path.join(REPO, 'hermes-mobile', 'src'),
    path.join(REPO, '.github', 'workflows'),
  ];
  const files = [];
  for (const r of roots) {
    if (fs.existsSync(r)) walk(r, files);
  }
  return files;
}

function scanFile(absPath) {
  const rel = path.relative(REPO, absPath);
  let text;
  try {
    text = fs.readFileSync(absPath, 'utf8');
  } catch {
    return [];
  }
  // skip huge
  if (text.length > 1_500_000) return [];
  const findings = [];
  const code = stripComments(text);
  for (const rule of RULES) {
    try {
      const hits = rule.test(code, rel) || [];
      for (const h of hits) {
        findings.push({
          file: rel,
          line: h.line || 1,
          rule: rule.id,
          codeql: rule.codeql,
          severity: rule.severity,
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
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`codeql-pattern-gate — offline CodeQL-debt prevention

Usage:
  node tools/codeql-pattern-gate.js
  node tools/codeql-pattern-gate.js --staged
  node tools/codeql-pattern-gate.js --diff origin/main
  node tools/codeql-pattern-gate.js --json [paths...]
`);
    return;
  }

  const files = collectFiles(args);
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
    console.log(`\n=== codeql-pattern-gate files=${report.fileCount} findings=${report.findingCount} ===`);
    if (!findings.length) {
      console.log('PASS — no banned CodeQL-debt patterns');
    } else {
      for (const f of findings) {
        console.log(`FAIL ${f.file}:${f.line} [${f.rule}] ${f.message}`);
      }
      console.log('\nFix or use the shared helpers under tools/lib/. See docs/CODEQL-SECURITY-BURN-DOWN.md');
    }
  }

  if (!report.ok) process.exit(1);
}

if (require.main === module) main();

module.exports = { RULES, scanFile, collectFiles, summarize: (findings) => findings };
