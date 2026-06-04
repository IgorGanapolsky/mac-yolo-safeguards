#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { discover, latestDataDate } = require('./revenue-date');

const usage = `Usage:
  node tools/pipeline-data-science.js [--date YYYY-MM-DD] [--out pipeline-data-science.md] [--limit N]

Builds a private descriptive analytics and heuristic propensity report for the
current revenue pipeline.

This tool is read-only except for the ignored report it writes. It does not
send outreach, create payment links, mutate pipeline rows, or prove revenue.`;

function log(msg) {
  console.log(`[pipeline-ds] ${msg}`);
}

function parseTsv(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) {
    return [];
  }
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  return lines.map((line, index) => {
    const values = line.split('\t');
    if (values.length !== headers.length) {
      throw new Error(`${filePath} line ${index + 2}: expected ${headers.length} fields, got ${values.length}`);
    }
    const row = {};
    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex];
    });
    return row;
  });
}

function parseBool(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['yes', 'true', '1'].includes(normalized);
}

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
    limit: 15,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--limit') {
      args.limit = Number(argv[++i]);
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
  const dataDate = latestDataDate(args.date, ['prospects', 'pipeline-status']);
  if (dataDate && dataDate !== args.date) {
    args.requestedDate = args.date;
    args.date = dataDate;
  }
  if (!Number.isFinite(args.limit) || args.limit < 1) {
    throw new Error('--limit must be a positive number');
  }
  if (!args.out) {
    args.out = `pipeline-data-science-${args.date}.md`;
  }
}

function routeForScore(score) {
  if (score >= 9) return 'Partner Pilot ($3,000)';
  if (score >= 6) return 'AI Agent Hardening Sprint ($1,500)';
  if (score >= 4) return 'Agent Reliability Diagnostic ($499)';
  return 'Free repo + ThumbGate link';
}

function valueForRoute(route) {
  if (route.includes('$3,000')) return 3000.00;
  if (route.includes('$1,500')) return 1500.00;
  if (route.includes('$499')) return 499.00;
  return 0.00;
}

const signals = [
  ['agent_stack', 2],
  ['repeated_failure', 2],
  ['business_cost', 2],
  ['budget_owner', 2],
  ['workflow_context', 1],
  ['needs_repeatability', 1],
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);

  const prospectFiles = discover('prospects', args.date);
  const statusFiles = discover('pipeline-status', args.date);
  if (prospectFiles.length === 0) {
    throw new Error(`No prospects*.tsv files found for ${args.date}`);
  }
  if (statusFiles.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${args.date}`);
  }

  const prospectMap = new Map();
  const statusMap = new Map();

  // Load status stages
  for (const statusFile of statusFiles) {
    const rows = parseTsv(statusFile);
    for (const row of rows) {
      statusMap.set(row.prospect_label, {
        stage: row.stage || 'new',
        route: row.route,
        value: Number(row.gross_potential_usd),
        file: statusFile,
      });
    }
  }

  // Load prospect details and compute features
  for (const prospectFile of prospectFiles) {
    const rows = parseTsv(prospectFile);
    for (const row of rows) {
      const label = row.prospect_label;

      // Calculate base score
      let score = 0;
      signals.forEach(([field, points]) => {
        if (parseBool(row[field])) {
          score += points;
        }
      });

      const statusInfo = statusMap.get(label) || { stage: 'new', file: 'unknown' };
      const route = statusInfo.route || routeForScore(score);
      const val = Number.isFinite(statusInfo.value) ? statusInfo.value : valueForRoute(route);

      // Heuristic propensity score: explicit buying signals plus segment/source premiums.
      let segmentPremium = 0;
      const segment = String(row.segment || '').toLowerCase();
      if (segment.includes('agency') || segment.includes('studio')) {
        segmentPremium = 2.0;
      } else if (segment.includes('consult') || segment.includes('vendor')) {
        segmentPremium = 1.0;
      }

      // Inbound source premium
      const sourcePremium = String(row.source || '').toLowerCase().includes('inbound') ? 1.5 : 0.0;

      // High repeated failure severity premium
      const repeatedFailurePremium = parseBool(row.repeated_failure) ? 1.0 : 0.0;

      const propensityScore = score + segmentPremium + sourcePremium + repeatedFailurePremium;

      prospectMap.set(label, {
        label,
        segment: row.segment,
        source: row.source,
        notes: row.notes,
        score,
        propensityScore,
        route,
        value: val,
        stage: statusInfo.stage,
        pipelineFile: statusInfo.file,
        sourceFile: prospectFile
      });
    }
  }

  const allProspects = Array.from(prospectMap.values());
  log(`Loaded ${allProspects.length} total prospects.`);

  // Perform descriptive analytics
  const segments = {};
  const sources = {};
  const stages = {};
  let totalGross = 0;

  for (const p of allProspects) {
    segments[p.segment] = (segments[p.segment] || 0) + 1;
    sources[p.source] = (sources[p.source] || 0) + 1;
    stages[p.stage] = (stages[p.stage] || 0) + 1;
    totalGross += p.value;
  }

  // Find average score per segment
  const segmentStats = [];
  Object.keys(segments).forEach(segName => {
    const list = allProspects.filter(p => p.segment === segName);
    const avgScore = list.reduce((sum, p) => sum + p.score, 0) / list.length;
    const avgPropensity = list.reduce((sum, p) => sum + p.propensityScore, 0) / list.length;
    const segGross = list.reduce((sum, p) => sum + p.value, 0);
    segmentStats.push({
      segment: segName,
      count: list.length,
      avgScore: avgScore.toFixed(2),
      avgPropensity: avgPropensity.toFixed(2),
      gross: segGross
    });
  });
  segmentStats.sort((a, b) => b.avgPropensity - a.avgPropensity);

  // Find top prospects in "ready" stage
  const readyProspects = allProspects
    .filter(p => p.stage === 'ready')
    .sort((a, b) => b.propensityScore - a.propensityScore || a.label.localeCompare(b.label));

  // Write report
  const reportPath = args.out;
  const mdContent = `## Pipeline Data Science & ML Analysis Report
Generated on: ${new Date().toISOString().slice(0, 19)}Z

Private working file. Do not commit prospect-specific sales state.

${args.requestedDate ? `- Requested date: ${args.requestedDate}\n- Data date: ${args.date}\n` : ''}- Prospect files: ${prospectFiles.join(', ')}
- Pipeline files: ${statusFiles.join(', ')}

### Descriptors & Aggregates
- Total prospects analyzed: ${allProspects.length}
- Gross pipeline potential: $${totalGross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Active stages: ${Object.entries(stages).map(([stage, count]) => `${stage}: ${count}`).join(', ')}

### Segment Performance Profiles
| Segment | Count | Avg Base Score | Avg Propensity | Gross Potential |
|---|---|---|---|---|
${segmentStats.map(s => `| ${s.segment} | ${s.count} | ${s.avgScore} | ${s.avgPropensity} | $${s.gross.toLocaleString('en-US', { minimumFractionDigits: 2 })} |`).join('\n')}

### Propensity Indexing Model
Our Propensity model weights prospects based on:
1. Base quality (0-10): calculated from internal signals (\`agent_stack\`, \`repeated_failure\`, \`business_cost\`, \`budget_owner\`, etc.).
2. Segment premium: \`+2.0\` for agency/studio, \`+1.0\` for consultancy/vendor.
3. Source premium: \`+1.5\` for inbound inquiries.
4. Behavioral premium: \`+1.0\` if prospect has explicit repeated agent failure patterns.

### Top Ready Prospects for Immediate Outreach
Below are the top prioritized ready prospects to drive revenue toward the $300/day after-tax target.

| Rank | Label | Segment | Base Score | Propensity Index | Recommended Route | Pipeline File |
|---|---|---|---|---|---|---|
${readyProspects.slice(0, args.limit).map((p, idx) => `| ${idx + 1} | ${p.label} | ${p.segment} | ${p.score} | ${p.propensityScore.toFixed(1)} | ${p.route} | ${p.pipelineFile} |`).join('\n')}

### Strategic Handoff Recommendation
Based on the propensity model:
1. Focus outreach strictly on the high-propensity agency and software-studio segments first.
2. Complete outreach for the top 10 prospects listed above to activate pipeline conversion.

This report is not revenue proof. Only cleared Stripe payments entered into a private ignored revenue ledger count.
`;

  fs.writeFileSync(reportPath, mdContent);
  log(`Successfully wrote analysis report to ${reportPath}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
