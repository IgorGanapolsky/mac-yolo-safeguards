#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const usage = `Usage:
  node tools/send-next.js [--dry-run] [--mark-sent] [--limit N] [--all]

Finds the first "ready" prospect across our pipeline status TSV files,
displays the draft body, and launches the action (opening Mail.app or Safari).

It does not update pipeline state unless --mark-sent is passed after the
message/form was actually sent. Opening a draft or browser tab is not revenue
or outreach proof.`;

function log(msg) {
  console.log(`[send-next] ${msg}`);
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

function discoverFiles(pattern) {
  return fs.readdirSync(path.join(__dirname, '..'))
    .filter((name) => pattern.test(name))
    .sort();
}

function findActionValue(prospectLabel, actionFiles) {
  for (const actionFile of actionFiles) {
    const filePath = path.join(__dirname, '..', actionFile);
    if (!fs.existsSync(filePath)) continue;
    const actions = parseTsv(filePath);
    const found = actions.find(a => a.prospect_label === prospectLabel);
    if (found) {
      return found;
    }
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const markSent = args.includes('--mark-sent');

  const pipelineFiles = discoverFiles(/^pipeline-status(?!\.example).*\.tsv$/);
  const actionFiles = discoverFiles(/^outreach-actions.*\.tsv$/);

  let readyProspects = [];

  // Find all "ready" prospects
  for (const pipelineFile of pipelineFiles) {
    const filePath = path.join(__dirname, '..', pipelineFile);
    if (!fs.existsSync(filePath)) continue;
    const rows = parseTsv(filePath);
    const fileReadyRows = rows.filter(r => r.stage.trim().toLowerCase() === 'ready');
    for (const row of fileReadyRows) {
      readyProspects.push({
        row,
        pipelineFile
      });
    }
  }

  if (readyProspects.length === 0) {
    log('All caught up! No prospects found in "ready" stage.');
    return;
  }

  let limitIndex = args.indexOf('--limit');
  let limit = 1;
  if (limitIndex !== -1) {
    limit = Number(args[limitIndex + 1]);
  } else if (args.includes('--all')) {
    limit = Infinity;
  }

  const toProcess = readyProspects.slice(0, limit);
  log(`Found ${readyProspects.length} ready prospects. Processing top ${toProcess.length}...`);

  for (const item of toProcess) {
    const { row, pipelineFile } = item;
    const label = row.prospect_label;
    log(`Processing: ${label} from ${pipelineFile}`);

    const action = findActionValue(label, actionFiles);
    if (!action) {
      log(`FAIL: Could not find action details for prospect: ${label}`);
      process.exit(1);
    }

    console.log('\n==================================================');
    console.log(`PROSPECT:  ${label}`);
    console.log(`ROUTE:     ${action.route}`);
    console.log(`METHOD:    ${action.contact_type.toUpperCase()} (${action.action_type})`);
    console.log(`SUBJECT:   ${action.subject}`);
    console.log('==================================================');
    console.log('\nDRAFT BODY:');
    console.log('--------------------------------------------------');
    console.log(action.draft_body.replace(/\\n/g, '\n'));
    console.log('--------------------------------------------------\n');

    if (dryRun) {
      log(`Dry run: skipping open and update for ${label}`);
      continue;
    }

    // Execute open command
    log(`Opening action: ${action.action_value.slice(0, 100)}...`);
    try {
      let cmd = `open "${action.action_value.replace(/"/g, '\\"')}"`;
      execSync(cmd, { stdio: 'inherit' });
      log('Successfully opened action via OS open command.');
    } catch (err) {
      log(`Warning: Failed to execute open command: ${err.message}`);
    }

    if (!markSent) {
      log(`Not updating pipeline for ${label}. Re-run with --mark-sent only after the message/form was actually sent.`);
      continue;
    }

    // Update pipeline only after the operator explicitly confirms send.
    const updateCmd = `node "${path.join(__dirname, 'pipeline-update.js')}" --pipeline "${pipelineFile}" --prospect "${label}" --stage sent --date 2026-06-02 --next-action wait_for_reply --note "sent manually via send-next.js helper"`;
    log(`Updating pipeline: ${label} -> sent`);
    try {
      execSync(updateCmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
      log('Successfully updated pipeline status.');
    } catch (err) {
      log(`FAIL: Failed to update pipeline: ${err.message}`);
      process.exit(1);
    }

    // Small delay between opens so the OS has time to handle window launches
    if (toProcess.length > 1) {
      log('Waiting 2 seconds before the next prospect...');
      execSync('sleep 2');
    }
  }

  if (!dryRun) {
    console.log('\n[Success] All actions processed! Next step: Hit Send in your Mail client or paste drafts in browser tabs!');
  }
}

main();
