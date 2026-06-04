#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');

const usage = `Usage:
  node tools/pipeline-integrity.js [--date YYYY-MM-DD] [--pipeline pipeline-status.tsv ...] [--prospects prospects.tsv ...] [--out report.md]

Audits private sales pipeline integrity:
  - duplicate prospect labels across pipeline files
  - duplicate prospect labels across prospect files
  - pipeline rows missing prospect evidence
  - prospect rows missing pipeline rows
  - de-duplicated gross potential

This tool does not send outreach, mutate files, or prove revenue.`;

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
    pipelines: [],
    prospects: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--pipeline') {
      args.pipelines.push(argv[++i]);
    } else if (arg === '--prospects') {
      args.prospects.push(argv[++i]);
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function requireArgs(args) {
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date must be YYYY-MM-DD');
  }
  if (args.pipelines.length === 0 && args.prospects.length === 0) {
    const dataDate = latestDataDate(args.date, ['pipeline-status', 'prospects']);
    if (dataDate && dataDate !== args.date) {
      args.requestedDate = args.date;
      args.date = dataDate;
    }
  }
  if (args.pipelines.length === 0) {
    args.pipelines = discover('pipeline-status', args.date);
  }
  if (args.prospects.length === 0) {
    args.prospects = discover('prospects', args.date);
  }
  if (args.pipelines.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${args.date}`);
  }
  if (args.prospects.length === 0) {
    throw new Error(`No prospects*.tsv files found for ${args.date}`);
  }
}

function parseTsv(path) {
  const text = fs.readFileSync(path, 'utf8').trim();
  if (!text) {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  return lines.map((line, index) => {
    const values = line.split('\t');
    if (values.length !== headers.length) {
      throw new Error(`${path} line ${index + 2}: expected ${headers.length} fields, got ${values.length}`);
    }
    const row = {};
    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex];
    });
    row._source = path;
    row._line = index + 2;
    return row;
  });
}

function money(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be numeric`);
  }
  return number;
}

function currency(value) {
  return `$${value.toFixed(2)}`;
}

function groupByLabel(rows) {
  const byLabel = new Map();
  for (const row of rows) {
    const label = row.prospect_label;
    if (!byLabel.has(label)) {
      byLabel.set(label, []);
    }
    byLabel.get(label).push(row);
  }
  return byLabel;
}

function lineRef(row) {
  return `${row._source}:${row._line}`;
}

function summarize(args) {
  const pipelineRows = args.pipelines.flatMap((path) => parseTsv(path));
  const prospectRows = args.prospects.flatMap((path) => parseTsv(path));
  const pipelineByLabel = groupByLabel(pipelineRows);
  const prospectByLabel = groupByLabel(prospectRows);

  const duplicatePipeline = [...pipelineByLabel.entries()].filter(([, rows]) => rows.length > 1);
  const duplicateProspects = [...prospectByLabel.entries()].filter(([, rows]) => rows.length > 1);
  const missingProspect = [...pipelineByLabel.keys()].filter((label) => !prospectByLabel.has(label)).sort();
  const missingPipeline = [...prospectByLabel.keys()].filter((label) => !pipelineByLabel.has(label)).sort();

  let dedupedGross = 0;
  const dedupedRows = [];
  for (const [label, rows] of pipelineByLabel.entries()) {
    const sortedRows = [...rows].sort((a, b) => money(b.gross_potential_usd, `${b.prospect_label} gross`) - money(a.gross_potential_usd, `${a.prospect_label} gross`));
    const row = sortedRows[0];
    dedupedRows.push(row);
    dedupedGross += money(row.gross_potential_usd, `${label} gross_potential_usd`);
  }

  return {
    pipelineRows,
    prospectRows,
    pipelineByLabel,
    prospectByLabel,
    duplicatePipeline,
    duplicateProspects,
    missingProspect,
    missingPipeline,
    dedupedRows,
    dedupedGross,
  };
}

function renderText(summary) {
  const lines = [
    `Pipeline rows: ${summary.pipelineRows.length}`,
    `Unique pipeline labels: ${summary.pipelineByLabel.size}`,
    `Prospect rows: ${summary.prospectRows.length}`,
    `Unique prospect labels: ${summary.prospectByLabel.size}`,
    `Duplicate pipeline labels: ${summary.duplicatePipeline.length}`,
    `Duplicate prospect labels: ${summary.duplicateProspects.length}`,
    `Pipeline labels missing prospect evidence: ${summary.missingProspect.length}`,
    `Prospect labels missing pipeline row: ${summary.missingPipeline.length}`,
    `De-duplicated gross potential: ${currency(summary.dedupedGross)}`,
  ];

  if (summary.duplicatePipeline.length) {
    lines.push('', 'Duplicate pipeline labels:');
    for (const [label, rows] of summary.duplicatePipeline) {
      lines.push(`  ${label}: ${rows.map(lineRef).join(', ')}`);
    }
  }
  if (summary.duplicateProspects.length) {
    lines.push('', 'Duplicate prospect labels:');
    for (const [label, rows] of summary.duplicateProspects) {
      lines.push(`  ${label}: ${rows.map(lineRef).join(', ')}`);
    }
  }
  if (summary.missingProspect.length) {
    lines.push('', 'Pipeline labels missing prospect evidence:');
    for (const label of summary.missingProspect) {
      lines.push(`  ${label}`);
    }
  }
  if (summary.missingPipeline.length) {
    lines.push('', 'Prospect labels missing pipeline row:');
    for (const label of summary.missingPipeline) {
      lines.push(`  ${label}`);
    }
  }
  return lines.join('\n');
}

function renderMarkdown(args, summary) {
  const lines = [
    `# Pipeline Integrity - ${args.date}`,
    '',
    'Private working file. Do not commit prospect-specific pipeline state.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`, ''] : []),
    `- Pipelines: ${args.pipelines.join(', ')}`,
    `- Prospects: ${args.prospects.join(', ')}`,
    `- Pipeline rows: ${summary.pipelineRows.length}`,
    `- Unique pipeline labels: ${summary.pipelineByLabel.size}`,
    `- Prospect rows: ${summary.prospectRows.length}`,
    `- Unique prospect labels: ${summary.prospectByLabel.size}`,
    `- Duplicate pipeline labels: ${summary.duplicatePipeline.length}`,
    `- Duplicate prospect labels: ${summary.duplicateProspects.length}`,
    `- Pipeline labels missing prospect evidence: ${summary.missingProspect.length}`,
    `- Prospect labels missing pipeline row: ${summary.missingPipeline.length}`,
    `- De-duplicated gross potential: ${currency(summary.dedupedGross)}`,
    '',
    'This report is not revenue proof. It only checks whether the private pipeline is internally consistent.',
  ];

  if (summary.missingProspect.length) {
    lines.push('', '## Missing Prospect Evidence', '');
    for (const label of summary.missingProspect) {
      lines.push(`- ${label}`);
    }
  }
  if (summary.missingPipeline.length) {
    lines.push('', '## Missing Pipeline Rows', '');
    for (const label of summary.missingPipeline) {
      lines.push(`- ${label}`);
    }
  }
  if (summary.duplicatePipeline.length) {
    lines.push('', '## Duplicate Pipeline Labels', '');
    for (const [label, rows] of summary.duplicatePipeline) {
      lines.push(`- ${label}: ${rows.map(lineRef).join(', ')}`);
    }
  }
  if (summary.duplicateProspects.length) {
    lines.push('', '## Duplicate Prospect Labels', '');
    for (const [label, rows] of summary.duplicateProspects) {
      lines.push(`- ${label}: ${rows.map(lineRef).join(', ')}`);
    }
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const summary = summarize(args);
  console.log(renderText(summary));
  if (args.out) {
    fs.writeFileSync(args.out, `${renderMarkdown(args, summary)}\n`);
    console.log('');
    console.log(`Integrity report written: ${args.out}`);
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
