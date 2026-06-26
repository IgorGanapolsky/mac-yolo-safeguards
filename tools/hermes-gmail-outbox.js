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

Rows with verified prospect emails become buyer-facing drafts. Rows without a
verified prospect email are grouped into one internal digest so Gmail never fills
with unusable one-off "missing email" drafts. With --execute, the tool creates
Gmail drafts only when google_api.py reports gmail_drafts_ready=true; otherwise
it writes the plan and exits 0 with execution.status=setup_needed.`;

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

function sentence(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([?.!,])/g, '$1')
    .trim();
}

function buildSubject(row) {
  const name = displayName(row);
  return `Quick question for ${name}`;
}

function buildProspectBody(row) {
  const name = displayName(row).split(/\s+/)[0] || 'there';
  const proposed = sentence(row.message_text);
  return [
    proposed || `Hi ${name}, quick question: where does follow-up currently slow down in your workflow?`,
    '',
    'If it is useful, I can send over a short same-day audit of the handoff points where leads or replies leak.',
    '',
    'Best,',
    'Igor',
  ].join('\n').trim();
}

function buildMissingEmailDigest(missingRows, options) {
  const lines = [
    `Outreach contact research needed: ${missingRows.length} lead(s) have no verified email.`,
    '',
    'Do not send this as outreach. Use it to find verified contact emails, LinkedIn profiles, or a permitted community DM path.',
    '',
    'Priority leads:',
  ];

  for (const [index, row] of missingRows.slice(0, 30).entries()) {
    lines.push(
      '',
      `${index + 1}. ${displayName(row)}`,
      `   Lead: ${row.lead_id || 'unknown'}`,
      `   Handle: ${row.prospect_handle || 'unknown'}`,
      `   Offer: ${row.offer_sku || 'unknown'}`,
      `   Channel found: ${row.assigned_channel || 'unknown'}`,
      `   Suggested opener: ${sentence(row.message_text) || 'missing'}`
    );
  }

  if (missingRows.length > 30) {
    lines.push('', `Plus ${missingRows.length - 30} more lead(s) in ${options.outbox}.`);
  }

  return {
    lead_id: 'missing-email-digest',
    mode: 'operator_digest',
    to: options.operatorEmail,
    subject: `Contact research needed for ${missingRows.length} outreach lead${missingRows.length === 1 ? '' : 's'}`,
    body: lines.join('\n'),
    missing_prospect_email: true,
    digest_count: missingRows.length,
  };
}

function classifyQueue(queue) {
  const prospectRows = [];
  const missingRows = [];
  const skipped = [];
  for (const row of queue) {
    if (row.status && row.status !== 'pending') {
      skipped.push({ lead_id: row.lead_id, reason: `status=${row.status}` });
      continue;
    }
    const email = String(row.prospect_email || row.email || '').trim();
    if (isEmail(email)) {
      prospectRows.push({ row, email });
    } else {
      missingRows.push(row);
    }
  }
  return { prospectRows, missingRows, skipped };
}

function buildPlan(options) {
  const { generatedAt, queue } = readOutbox(options.outbox);
  const { prospectRows, missingRows, skipped } = classifyQueue(queue);
  const actions = [];

  for (const { row, email } of prospectRows) {
    actions.push({
      lead_id: row.lead_id || '',
      mode: 'prospect',
      to: email,
      subject: buildSubject(row),
      body: buildProspectBody(row),
      source_channel: row.assigned_channel || '',
      prospect_handle: row.prospect_handle || '',
      offer_sku: row.offer_sku || '',
      missing_prospect_email: false,
    });
  }

  if (missingRows.length) {
    actions.push(buildMissingEmailDigest(missingRows, options));
  }

  return {
    generated_at: new Date().toISOString(),
    source_generated_at: generatedAt,
    source_outbox: options.outbox,
    operator_email: options.operatorEmail,
    counts: {
      source_queue: queue.length,
      actions: actions.length,
      prospect_drafts: prospectRows.length,
      operator_digest_drafts: missingRows.length ? 1 : 0,
      missing_email_leads: missingRows.length,
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
    console.log(`Operator digest drafts: ${plan.counts.operator_digest_drafts}`);
    console.log(`Missing-email leads: ${plan.counts.missing_email_leads}`);
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
  buildMissingEmailDigest,
  buildProspectBody,
};
