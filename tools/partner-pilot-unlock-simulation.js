#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { discover, latestDataDate } = require('./revenue-date');

const usage = `Usage:
  node tools/partner-pilot-unlock-simulation.js [--date YYYY-MM-DD] [--stripe-offer-map stripe-offer-map.tsv] [--out partner-pilot-unlock-simulation.md]

Simulates the close plan after Partner Pilot has a live Stripe product, price,
and payment link. This is read-only; it writes a temporary synthetic offer map
under /tmp and does not mutate the ignored real Stripe offer map.`;

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--stripe-offer-map') {
      args.stripeOfferMap = argv[++i];
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
  const dataDate = latestDataDate(
    args.date,
    args.stripeOfferMap ? ['pipeline-status', 'prospects'] : ['stripe-offer-map', 'pipeline-status', 'prospects']
  );
  if (dataDate && dataDate !== args.date) {
    args.requestedDate = args.date;
    args.date = dataDate;
  }
  if (!args.stripeOfferMap) {
    args.stripeOfferMap = `stripe-offer-map-${args.date}.tsv`;
  }
  if (!fs.existsSync(args.stripeOfferMap)) {
    throw new Error(`Stripe offer map not found: ${args.stripeOfferMap}`);
  }
  if (!args.out) {
    args.out = `partner-pilot-unlock-simulation-${args.date}.md`;
  }
}

function parseTsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) {
    return { headers: [], rows: [] };
  }
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  const rows = lines.map((line, index) => {
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
  return { headers, rows };
}

function renderTsv(headers, rows) {
  return [
    headers.join('\t'),
    ...rows.map((row) => headers.map((header) => row[header] || '').join('\t')),
  ].join('\n');
}

function syntheticMap(args) {
  const parsed = parseTsv(args.stripeOfferMap);
  const partner = parsed.rows.find((row) => row.offer === 'Partner Pilot');
  if (!partner) {
    throw new Error(`${args.stripeOfferMap}: missing Partner Pilot row`);
  }
  partner.status = 'ready';
  partner.stripe_product_id = 'prod_SIMULATEDPARTNER';
  partner.stripe_price_id = 'price_SIMULATEDPARTNER';
  partner.payment_link_url = 'https://buy.stripe.com/SIMULATED_PARTNER_LINK';
  partner.note = `SIMULATION ONLY - Partner Pilot link assumed ready ${args.requestedDate || args.date}`;
  const out = path.join(os.tmpdir(), `stripe-offer-map-partner-pilot-simulated-${process.pid}-${Date.now()}.tsv`);
  fs.writeFileSync(out, `${renderTsv(parsed.headers, parsed.rows)}\n`);
  return out;
}

function selectedRows(closePlanPath) {
  const text = fs.readFileSync(closePlanPath, 'utf8');
  const table = text.match(/## Selected Close Sequence[\s\S]*?\n\n## Payment Handoff Commands/);
  if (!table) {
    throw new Error(`${closePlanPath}: selected close sequence not found`);
  }
  return table[0]
    .split(/\r?\n/)
    .filter((line) => /^\| \d+ \|/.test(line))
    .map((line) => {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      return {
        rank: Number(cells[0]),
        prospect: cells[1],
        stage: cells[2],
        offer: cells[3],
        gross: cells[4],
        net: cells[5],
        linkReady: cells[7],
      };
    });
}

function runCloseTarget(args, simulatedMap) {
  const actionDate = args.requestedDate || args.date;
  const closePlan = path.join(os.tmpdir(), `close-target-partner-pilot-unlock-${process.pid}-${Date.now()}.md`);
  const pipelines = discover('pipeline-status', args.date);
  const prospects = discover('prospects', args.date);
  if (pipelines.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${args.date}`);
  }
  if (prospects.length === 0) {
    throw new Error(`No prospects*.tsv files found for ${args.date}`);
  }
  const result = spawnSync('node', [
    'tools/close-target-plan.js',
    '--date',
    actionDate,
    ...pipelines.flatMap((file) => ['--pipeline', file]),
    ...prospects.flatMap((file) => ['--prospects', file]),
    '--stripe-offer-map',
    simulatedMap,
    '--limit',
    '20',
    '--out',
    closePlan,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'close-target simulation failed').trim());
  }
  return {
    closePlan,
    stdout: result.stdout,
    rows: selectedRows(closePlan),
  };
}

function renderMarkdown(args, simulatedMap, closeTarget) {
  const actionDate = args.requestedDate || args.date;
  const partnerRows = closeTarget.rows.filter((row) => row.offer === 'Partner Pilot');
  const lines = [
    `# Partner Pilot Unlock Simulation - ${args.date}`,
    '',
    'Read-only simulation. This did not create Stripe objects, mutate the real offer map, send payment requests, or prove revenue.',
    '',
    ...(args.requestedDate ? [`- Requested date: ${args.requestedDate}`, `- Data date: ${args.date}`] : []),
    `- Action date: ${actionDate}`,
    `- Real Stripe offer map: ${args.stripeOfferMap}`,
    `- Temporary simulated offer map: ${simulatedMap}`,
    `- Selected closes after simulated unlock: ${closeTarget.rows.length}`,
    `- Partner Pilot selected closes after simulated unlock: ${partnerRows.length}`,
    `- Target status after simulated unlock: ${/Target status from selected closes: MET/.test(closeTarget.stdout) ? 'MET' : 'NOT MET'}`,
    '',
    '## Simulated Selected Close Sequence',
    '',
    '| Rank | Prospect | Stage | Offer | Gross | Estimated net | Link ready |',
    '|---:|---|---|---|---:|---:|---|',
  ];
  for (const row of closeTarget.rows) {
    lines.push(`| ${row.rank} | ${row.prospect} | ${row.stage} | ${row.offer} | ${row.gross} | ${row.net} | ${row.linkReady} |`);
  }
  lines.push(
    '',
    '## Operator Meaning',
    '',
    '- If the real Partner Pilot Stripe row is imported with a live product, price, and payment link, the standard close-target planner should switch from ten $1,500 Sprint closes to five $3,000 Partner Pilot closes.',
    '- This simulation is only a rehearsal. Re-run the real command center after importing the live link and use only the real ignored offer map for buyer/payment handoffs.',
    '',
    '```sh',
    `node tools/revenue-command-center.js --date ${actionDate} --limit 10`,
    '```',
    '',
    'This simulation is not revenue proof. Only cleared Stripe payments entered into a private ignored ledger count.'
  );
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  requireArgs(args);
  const simulatedMap = syntheticMap(args);
  const closeTarget = runCloseTarget(args, simulatedMap);
  fs.writeFileSync(args.out, `${renderMarkdown(args, simulatedMap, closeTarget)}\n`);
  const partnerRows = closeTarget.rows.filter((row) => row.offer === 'Partner Pilot');
  console.log(`Partner Pilot unlock simulation written: ${args.out}`);
  if (args.requestedDate) {
    console.log(`Requested date: ${args.requestedDate}`);
    console.log(`Data date: ${args.date}`);
  }
  console.log(`Selected closes after simulated unlock: ${closeTarget.rows.length}`);
  console.log(`Partner Pilot selected closes after simulated unlock: ${partnerRows.length}`);
  console.log(`Target status after simulated unlock: ${/Target status from selected closes: MET/.test(closeTarget.stdout) ? 'MET' : 'NOT MET'}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
