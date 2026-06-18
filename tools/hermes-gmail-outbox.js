#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_SKOOL_REPO = '/Users/igorganapolsky/workspace/git/igor/skool_top1percent';
const DEFAULT_OUTBOX = path.join(DEFAULT_SKOOL_REPO, 'docs', 'trajectories', 'outreach-outbox.json');
const DEFAULT_GOOGLE_API = path.join(process.env.HOME || '', '.hermes', 'skills', 'productivity', 'google-workspace', 'scripts', 'google_api.py');
const DEFAULT_OPERATOR_EMAIL = 'iganapolsky@gmail.com';

const usage = `Usage:
  node tools/hermes-gmail-outbox.js [--outbox FILE] [--out FILE] [--operator-email EMAIL] [--google-api FILE] [--execute] [--json]

Builds a Gmail draft plan from the Hermes/Skool outreach outbox.

Missing prospect emails are not blockers: they become CEO-review drafts sent to
the operator email with lead details and proposed copy. With --execute, the tool
creates Gmail drafts only when google_api.py reports gmail_drafts_ready=true;
otherwise it writes the plan and exits 0 with execution.status=setup_needed.`;

function parseArgs(argv) {
  const args = {
    outbox: DEFAULT_OUTBOX,
    out: '',
    operatorEmail: DEFAULT_OPERATOR_EMAIL,
    googleApi: DEFAULT_GOOGLE_API,
    execute: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--outbox') {
      args.outbox = requireValue(argv, ++i, arg);
    } else if (arg === '--out') {
      args.out = requireValue(argv, ++i, arg);
    } else if (arg === '--operator-email') {
      args.operatorEmail = requireValue(argv, ++i, arg);
    } else if (arg === '--google-api') {
      args.googleApi = requireValue(argv, ++i, arg);
    } else if (arg === '--execute') {
      args.execute = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function isEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || '').trim());
}

function readOutbox(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const queue = Array.isArray(parsed.queue) ? parsed.queue : [];
  return { generatedAt: parsed.generated_at || null, queue };
}

function displayName(row) {
  const label = String(row.label || row.lead_id || 'prospect');
  return label.split('|')[0].trim() || label.trim() || 'prospect';
}

function buildSubject(row, mode) {
  const name = displayName(row);
  if (mode === 'prospect') return `Quick question for ${name}`;
  return `CEO review: missing prospect email for ${name}`;
}

function buildBody(row, mode) {
  const lead = [
    `Lead: ${row.lead_id || ''}`,
    `Label: ${row.label || ''}`,
    `Handle: ${row.prospect_handle || ''}`,
    `Offer: ${row.offer_sku || ''}`,
    `Original channel: ${row.assigned_channel || ''}`,
  ].filter((line) => !line.endsWith(': ')).join('\n');

  if (mode === 'prospect') {
    return [
      row.message_text || '',
      '',
      '--',
      'Hermes generated this draft from the verified outreach outbox.',
      lead,
    ].join('\n').trim();
  }

  return [
    'Hermes could not find a verified prospect_email for this lead, so it routed the copy here instead of stopping.',
    '',
    lead,
    '',
    'Proposed copy:',
    row.message_text || '',
  ].join('\n').trim();
}

function buildPlan(options) {
  const { generatedAt, queue } = readOutbox(options.outbox);
  const actions = [];
  const skipped = [];

  for (const row of queue) {
    if (row.status && row.status !== 'pending') {
      skipped.push({ lead_id: row.lead_id, reason: `status=${row.status}` });
      continue;
    }
    const email = String(row.prospect_email || row.email || '').trim();
    const hasProspectEmail = isEmail(email);
    const mode = hasProspectEmail ? 'prospect' : 'operator_review';
    const to = hasProspectEmail ? email : options.operatorEmail;
    actions.push({
      lead_id: row.lead_id || '',
      mode,
      to,
      subject: buildSubject(row, mode),
      body: buildBody(row, mode),
      source_channel: row.assigned_channel || '',
      prospect_handle: row.prospect_handle || '',
      offer_sku: row.offer_sku || '',
      missing_prospect_email: !hasProspectEmail,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    source_generated_at: generatedAt,
    source_outbox: options.outbox,
    operator_email: options.operatorEmail,
    counts: {
      source_queue: queue.length,
      actions: actions.length,
      prospect_drafts: actions.filter((a) => a.mode === 'prospect').length,
      operator_review_drafts: actions.filter((a) => a.mode === 'operator_review').length,
      skipped: skipped.length,
    },
    actions,
    skipped,
  };
}

function gmailStatus(googleApi) {
  const result = spawnSync('python3', [googleApi, 'gmail', 'status', '--json'], {
    encoding: 'utf8',
  });
  if (result.error) {
    return { ok: false, status: 'error', error: result.error.message };
  }
  if (result.status !== 0) {
    return { ok: false, status: 'error', error: (result.stderr || result.stdout || '').trim() };
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return { ok: Boolean(parsed.gmail_drafts_ready), status: parsed.status, raw: parsed };
  } catch (error) {
    return { ok: false, status: 'error', error: `invalid status JSON: ${error.message}` };
  }
}

function executePlan(plan, options) {
  const status = gmailStatus(options.googleApi);
  const execution = {
    attempted: false,
    status: status.ok ? 'ready' : status.status,
    gmail_status: status.raw || null,
    created: [],
    failed: [],
  };
  if (!status.ok) {
    execution.reason = 'Gmail drafts are not ready; wrote plan without stopping.';
    if (status.error) execution.error = status.error;
    return execution;
  }

  execution.attempted = true;
  for (const action of plan.actions) {
    const result = spawnSync('python3', [
      options.googleApi,
      'gmail',
      'draft',
      '--to', action.to,
      '--subject', action.subject,
      '--body', action.body,
    ], { encoding: 'utf8' });

    if (result.status === 0) {
      let parsed = {};
      try {
        parsed = JSON.parse(result.stdout);
      } catch (_) {
        parsed = { raw: result.stdout.trim() };
      }
      execution.created.push({ lead_id: action.lead_id, to: action.to, result: parsed });
    } else {
      execution.failed.push({
        lead_id: action.lead_id,
        to: action.to,
        error: (result.stderr || result.stdout || result.error || '').toString().trim(),
      });
    }
  }
  execution.status = execution.failed.length ? 'partial_failure' : 'drafts_created';
  return execution;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }

  if (!isEmail(args.operatorEmail)) {
    throw new Error(`--operator-email is not valid: ${args.operatorEmail}`);
  }
  const plan = buildPlan(args);
  const report = { plan };
  if (args.execute) {
    report.execution = executePlan(plan, args);
  }

  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Actions: ${plan.counts.actions}`);
    console.log(`Prospect drafts: ${plan.counts.prospect_drafts}`);
    console.log(`CEO-review drafts: ${plan.counts.operator_review_drafts}`);
    if (report.execution) {
      console.log(`Execution: ${report.execution.status}`);
    }
    if (args.out) {
      console.log(`Wrote: ${args.out}`);
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildPlan,
  executePlan,
  gmailStatus,
  isEmail,
};
