#!/usr/bin/env node
'use strict';

/**
 * Detect commands that can seize or mutate the interactive macOS login session.
 *
 * Usage:
 *   node tools/zero-focus-automation-audit.js audit [--json] [paths...]
 *   node tools/zero-focus-automation-audit.js enforce [--json] paths...
 *
 * `audit` reports findings without failing so legacy surfaces can be inventoried.
 * `enforce` fails closed and is intended for every scheduled/background entrypoint.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

const RULES = Object.freeze([
  {
    id: 'macos-open-app',
    category: 'desktop-activation',
    pattern: /(?:^|[;&|]\s*|\s)open\s+(?:-[^\s]+\s+)*-a\s+(?:['"][^'"]+['"]|[^\s;&|]+)/i,
    reason: '`open -a` can launch or foreground an app in the user login session',
  },
  {
    id: 'applescript-process',
    category: 'desktop-activation',
    pattern: /(?:\/usr\/bin\/)?osascript\b/i,
    reason: 'AppleScript runs in the user automation/Aqua authority boundary',
  },
  {
    id: 'applescript-activate',
    category: 'desktop-activation',
    pattern: /(?:tell\s+application[^\n]+\s+to\s+activate|^\s*activate\s*$)/i,
    reason: 'AppleScript activate explicitly steals application focus',
  },
  {
    id: 'synthetic-input',
    category: 'input-injection',
    pattern: /\b(?:cliclick|CGEventPost|launchOrFocus|hs\.eventtap)\b/i,
    reason: 'synthetic input or application focus can take over keyboard/mouse',
  },
  {
    id: 'headed-browser',
    category: 'browser-session',
    pattern: /\bheadless\s*(?::|=)\s*(?:false|False|0)\b/,
    reason: 'headed browser automation creates visible interactive windows',
  },
  {
    id: 'personal-browser-cdp',
    category: 'browser-session',
    pattern: /\b(?:connectOverCDP|remote-debugging-port|chrome\.debugger)\b/i,
    reason: 'CDP/debugger attachment can mutate a personal browser session',
  },
  {
    id: 'personal-browser-app',
    category: 'browser-session',
    pattern: /(?:Google Chrome|Comet)\.app\/Contents\/MacOS\/(?:Google Chrome|Comet)/,
    reason: 'direct personal-browser executable launch is not an isolated headless session',
  },
  {
    id: 'personal-browser-profile',
    category: 'browser-session',
    pattern: /(?:~|\/Users\/[^/]+)\/Library\/Application Support\/(?:Google\/Chrome|Comet)(?:\/|\b)/i,
    reason: 'personal browser profile reuse can mutate cookies, tabs, extensions, and signed-in state',
  },
  {
    id: 'computer-use-driver',
    category: 'desktop-activation',
    pattern: /\b(?:computer-use|Computer Use|tinker-yolo-computer)\b/i,
    reason: 'computer-use drivers are foreground-capable by design',
  },
]);

const SKIP_PARTS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'docs',
  'parallel-research',
  'tests',
  '__tests__',
]);

const AUDITABLE_EXTENSIONS = new Set([
  '.bash',
  '.cjs',
  '.js',
  '.lua',
  '.mjs',
  '.plist',
  '.py',
  '.rb',
  '.scpt',
  '.sh',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
  '.zsh',
]);

function parseArgs(argv) {
  const args = { mode: 'audit', json: false, paths: [] };
  for (const arg of argv) {
    if (arg === 'audit' || arg === 'enforce') args.mode = arg;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else args.paths.push(arg);
  }
  return args;
}

function shouldSkip(relativePath) {
  if (relativePath === 'tools/zero-focus-automation-audit.js') return true;
  return relativePath.split(path.sep).some((part) => SKIP_PARTS.has(part));
}

function isAuditableFile(filePath) {
  if (AUDITABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return true;
  try {
    return path.extname(filePath) === '' && (fs.statSync(filePath).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function repoFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return output
    .split('\0')
    .filter(Boolean)
    .filter((relativePath) => !shouldSkip(relativePath))
    .map((relativePath) => path.join(REPO_ROOT, relativePath))
    .filter(isAuditableFile);
}

function walk(target, files = []) {
  const absolute = path.resolve(REPO_ROOT, target);
  if (!fs.existsSync(absolute)) throw new Error(`Path does not exist: ${target}`);
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    if (isAuditableFile(absolute)) files.push(absolute);
    return files;
  }
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(absolute, entry.name);
    const relative = path.relative(REPO_ROOT, child);
    if (shouldSkip(relative)) continue;
    if (entry.isDirectory()) walk(child, files);
    else if (entry.isFile() && isAuditableFile(child)) files.push(child);
  }
  return files;
}

function candidateFiles(paths) {
  if (paths.length === 0) return repoFiles();
  return [...new Set(paths.flatMap((target) => walk(target)))];
}

function scanText(filePath, text) {
  const relativePath = path.relative(REPO_ROOT, filePath) || filePath;
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (!rule.pattern.test(line)) continue;
      findings.push({
        rule: rule.id,
        category: rule.category,
        path: relativePath,
        line: index + 1,
        reason: rule.reason,
        evidence: line.trim().slice(0, 220),
      });
    }
  });
  return findings;
}

function scanFile(filePath) {
  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (error) {
    return [{
      rule: 'unreadable',
      category: 'audit-error',
      path: path.relative(REPO_ROOT, filePath),
      line: 0,
      reason: error.message,
      evidence: '',
    }];
  }
  if (buffer.includes(0)) return [];
  return scanText(filePath, buffer.toString('utf8'));
}

function buildReport(paths = []) {
  const files = candidateFiles(paths);
  const findings = files.flatMap(scanFile);
  const byCategory = findings.reduce((counts, finding) => {
    counts[finding.category] = (counts[finding.category] || 0) + 1;
    return counts;
  }, {});
  return {
    generatedAt: new Date().toISOString(),
    modeContract: {
      audit: 'inventory only; exits zero even when findings exist',
      enforce: 'fails closed when any foreground-capable construct exists',
    },
    scannedFiles: files.length,
    findingCount: findings.length,
    byCategory,
    findings,
  };
}

function printHuman(report) {
  console.log(`Zero-focus audit: ${report.scannedFiles} files, ${report.findingCount} findings`);
  for (const finding of report.findings) {
    console.log(
      `${finding.path}:${finding.line} [${finding.rule}] ${finding.reason}`,
    );
  }
}

function help() {
  console.log('Usage: zero-focus-automation-audit.js [audit|enforce] [--json] [paths...]');
  console.log('Use enforce for every scheduled/background entrypoint; it fails on any finding.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    return;
  }
  const report = buildReport(args.paths);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (args.mode === 'enforce' && report.findingCount > 0) process.exitCode = 2;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`zero-focus audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  RULES,
  parseArgs,
  shouldSkip,
  isAuditableFile,
  candidateFiles,
  scanText,
  scanFile,
  buildReport,
};
