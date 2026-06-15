#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/public-command-reference-check.js [--out public-command-reference-check.md]

Checks that public markdown docs only reference local tools/*.js files that
exist in the worktree.

This tool is read-only. It does not publish or prove revenue.`;

const publicMarkdown = [
  'README.md',
  'docs/CASE-STUDY.md',
  'docs/AI-AGENT-HARDENING.md',
  'docs/PARTNER-PILOT.md',
  'docs/REVENUE-OPERATING-PLAN.md',
  'docs/SALES-CLOSE-KIT.md',
  'docs/CHANGELOG.md',
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

function referencedTools() {
  const references = [];
  for (const file of publicMarkdown) {
    if (!fs.existsSync(file)) {
      references.push({ source: file, line: 0, tool: file, exists: false, problem: 'source file missing' });
      continue;
    }
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const matches = line.matchAll(/\btools\/[A-Za-z0-9._/-]+\.js\b/g);
      for (const match of matches) {
        const tool = match[0];
        references.push({
          source: file,
          line: index + 1,
          tool,
          exists: fs.existsSync(tool),
          problem: fs.existsSync(tool) ? '' : 'referenced tool missing',
        });
      }
    });
  }
  return references;
}

function build() {
  const references = referencedTools();
  const uniqueTools = Array.from(new Set(references.map((item) => item.tool))).sort();
  const failures = references.filter((item) => !item.exists);
  return { references, uniqueTools, failures };
}

function renderMarkdown(data) {
  const lines = [
    `# Public Command Reference Check - ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Read-only report. This checks local `tools/*.js` references in public docs.',
    '',
    `- Unique tools referenced: ${data.uniqueTools.length}`,
    `- References found: ${data.references.length}`,
    `- Missing references: ${data.failures.length}`,
    `- Status: ${data.failures.length === 0 ? 'PASS' : 'FAIL'}`,
    '',
    '## Referenced Tools',
    '',
    '| Tool | Exists |',
    '|---|---|',
  ];
  for (const tool of data.uniqueTools) {
    lines.push(`| ${tool} | ${fs.existsSync(tool) ? 'yes' : 'no'} |`);
  }
  lines.push('', '## Missing References', '', '| Source | Line | Tool | Problem |', '|---|---:|---|---|');
  if (data.failures.length === 0) {
    lines.push('| none | 0 | none | none |');
  } else {
    for (const failure of data.failures) {
      lines.push(`| ${failure.source} | ${failure.line} | ${failure.tool} | ${failure.problem} |`);
    }
  }
  lines.push('', 'This check is not revenue proof. It only prevents public docs from referencing missing local commands.');
  return lines.join('\n');
}

function renderConsole(data) {
  console.log(`Public command tools referenced: ${data.uniqueTools.length}`);
  console.log(`Public command references found: ${data.references.length}`);
  console.log(`Public command references missing: ${data.failures.length}`);
  console.log(`Public command reference status: ${data.failures.length === 0 ? 'PASS' : 'FAIL'}`);
  for (const failure of data.failures) {
    console.log(`fail\t${failure.source}:${failure.line}\t${failure.tool}\t${failure.problem}`);
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
    console.log(`Public command reference check written: ${args.out}`);
  }
  if (data.failures.length > 0) {
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
