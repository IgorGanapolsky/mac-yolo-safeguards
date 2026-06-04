#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/public-funnel-safety-scan.js [--out public-funnel-safety-scan.md]

Scans public revenue-funnel artifacts for obvious secrets, private ops files,
and placeholder live payment claims before publication.

This tool is read-only. It does not add, commit, push, or publish anything.`;

const publicArtifacts = [
  'README.md',
  'CASE-STUDY.md',
  'CHANGELOG.md',
  'AI-AGENT-HARDENING.md',
  'PARTNER-PILOT.md',
  'REVENUE-OPERATING-PLAN.md',
  'SALES-CLOSE-KIT.md',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/free-incident-report.yml',
  '.github/ISSUE_TEMPLATE/paid-hardening-inquiry.yml',
];

const patterns = [
  {
    label: 'Stripe secret key',
    pattern: /sk_(live|test)_[A-Za-z0-9]{10,}/,
    severity: 'fail',
  },
  {
    label: 'Stripe publishable key',
    pattern: /pk_(live|test)_[A-Za-z0-9]{10,}/,
    severity: 'warn',
  },
  {
    label: 'GitHub token',
    pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/,
    severity: 'fail',
  },
  {
    label: 'OpenAI API key',
    pattern: /sk-[A-Za-z0-9]{20,}/,
    severity: 'fail',
  },
  {
    label: 'AWS access key',
    pattern: /AKIA[0-9A-Z]{16}/,
    severity: 'fail',
  },
  {
    label: 'Private pipeline file reference',
    pattern: /\b(pipeline-status|prospects|contacts|send-queue|outreach-actions|stripe-offer-map|revenue-ledger)-\d{4}-\d{2}-\d{2}\b/,
    severity: 'warn',
  },
  {
    label: 'Placeholder payment link',
    pattern: /TODO_PAYMENT_LINK|https:\/\/buy\.stripe\.com\/LIVE_LINK_HERE/,
    severity: 'fail',
  },
  {
    label: 'Placeholder Stripe object ID',
    pattern: /TODO_(PRODUCT|PRICE)_ID|prod_LIVE_ID_HERE|price_LIVE_ID_HERE/,
    severity: 'fail',
  },
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

function scanFile(path) {
  if (!fs.existsSync(path)) {
    return [{ path, line: 0, label: 'Missing public artifact', severity: 'fail', text: '' }];
  }
  const text = fs.readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  const findings = [];
  lines.forEach((line, index) => {
    for (const item of patterns) {
      if (item.pattern.test(line)) {
        findings.push({
          path,
          line: index + 1,
          label: item.label,
          severity: item.severity,
          text: line.trim().slice(0, 160),
        });
      }
    }
  });
  return findings;
}

function build() {
  const findings = publicArtifacts.flatMap(scanFile);
  return {
    artifacts: publicArtifacts,
    findings,
    failures: findings.filter((item) => item.severity === 'fail'),
    warnings: findings.filter((item) => item.severity === 'warn'),
  };
}

function renderMarkdown(data) {
  const lines = [
    `# Public Funnel Safety Scan - ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Read-only report. This scans only public revenue-funnel artifacts.',
    '',
    `- Artifacts scanned: ${data.artifacts.length}`,
    `- Failures: ${data.failures.length}`,
    `- Warnings: ${data.warnings.length}`,
    `- Status: ${data.failures.length === 0 ? 'PASS' : 'FAIL'}`,
    '',
    '| Severity | File | Line | Finding | Evidence |',
    '|---|---|---:|---|---|',
  ];
  if (data.findings.length === 0) {
    lines.push('| none | none | 0 | none | none |');
  } else {
    for (const finding of data.findings) {
      lines.push(`| ${finding.severity} | ${finding.path} | ${finding.line} | ${finding.label} | ${finding.text || 'n/a'} |`);
    }
  }
  lines.push('', 'This scan is not revenue proof. It only reduces publication risk for public buyer-facing assets.');
  return lines.join('\n');
}

function renderConsole(data) {
  console.log(`Public funnel artifacts scanned: ${data.artifacts.length}`);
  console.log(`Public funnel safety failures: ${data.failures.length}`);
  console.log(`Public funnel safety warnings: ${data.warnings.length}`);
  console.log(`Public funnel safety status: ${data.failures.length === 0 ? 'PASS' : 'FAIL'}`);
  for (const finding of data.findings) {
    console.log(`${finding.severity}\t${finding.path}:${finding.line}\t${finding.label}`);
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
    console.log(`Public funnel safety scan written: ${args.out}`);
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
