#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const usage = `Usage:
  node tools/public-local-link-check.js [--out public-local-link-check.md]

Checks local links in public markdown docs used by the revenue funnel.

This tool is read-only. It does not check external URLs, publish, or prove
revenue.`;

const publicMarkdown = [
  'README.md',
  'docs/CASE-STUDY.md',
  'docs/AI-AGENT-HARDENING.md',
  'docs/PARTNER-PILOT.md',
  'docs/REVENUE-OPERATING-PLAN.md',
  'docs/SALES-CLOSE-KIT.md',
  'CHANGELOG.md',
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function localTarget(rawTarget) {
  const target = rawTarget.trim();
  if (!target || target.startsWith('#')) {
    return null;
  }
  if (/^(https?:|mailto:|tel:)/i.test(target)) {
    return null;
  }
  if (target.startsWith('`')) {
    return null;
  }
  const withoutFragment = target.split('#')[0];
  return withoutFragment || null;
}

function stripImagePrefix(line) {
  return line.replace(/!\[[^\]]*]\([^)]+\)/g, '');
}

function scanFile(file) {
  if (!fs.existsSync(file)) {
    return [{ file, line: 0, target: file, problem: 'source file missing' }];
  }
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const findings = [];
  lines.forEach((line, index) => {
    const lineWithoutImages = stripImagePrefix(line);
    const pattern = /\[[^\]]+]\(([^)]+)\)/g;
    let match;
    while ((match = pattern.exec(lineWithoutImages)) !== null) {
      const target = localTarget(match[1]);
      if (!target) {
        continue;
      }
      const resolved = path.normalize(path.join(path.dirname(file), decodeURIComponent(target)));
      if (!fs.existsSync(resolved)) {
        findings.push({
          file,
          line: index + 1,
          target,
          problem: `missing local target ${resolved}`,
        });
      }
    }
  });
  return findings;
}

function build() {
  const findings = publicMarkdown.flatMap(scanFile);
  return { files: publicMarkdown, findings };
}

function renderMarkdown(data) {
  const lines = [
    `# Public Local Link Check - ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Read-only report. External URLs are out of scope.',
    '',
    `- Markdown files checked: ${data.files.length}`,
    `- Broken local links: ${data.findings.length}`,
    `- Status: ${data.findings.length === 0 ? 'PASS' : 'FAIL'}`,
    '',
    '| File | Line | Target | Problem |',
    '|---|---:|---|---|',
  ];
  if (data.findings.length === 0) {
    lines.push('| none | 0 | none | none |');
  } else {
    for (const finding of data.findings) {
      lines.push(`| ${finding.file} | ${finding.line} | ${finding.target} | ${finding.problem} |`);
    }
  }
  lines.push('', 'This check is not revenue proof. It only reduces broken-link risk before publishing.');
  return lines.join('\n');
}

function renderConsole(data) {
  console.log(`Public markdown files checked: ${data.files.length}`);
  console.log(`Broken local links: ${data.findings.length}`);
  console.log(`Public local link status: ${data.findings.length === 0 ? 'PASS' : 'FAIL'}`);
  for (const finding of data.findings) {
    console.log(`fail\t${finding.file}:${finding.line}\t${finding.target}\t${finding.problem}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  const data = build();
  renderConsole(data);
  if (args.out) {
    fs.writeFileSync(args.out, `${renderMarkdown(data)}\n`);
    console.log('');
    console.log(`Public local link check written: ${args.out}`);
  }
  if (data.findings.length > 0) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
