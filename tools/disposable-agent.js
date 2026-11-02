#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  createDisposableLease,
  extractDisposableIntelligence,
  retireDisposableLease,
} = require('./disposable-agent-lease');

function sessionDirFor(taskId) {
  return path.join(process.env.HOME || '/tmp', '.disposable-sessions', taskId);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  if (command === 'create') {
    const taskId = String(args[1] || '').trim();
    if (!/^[\w.-]+$/.test(taskId)) {
      console.error('[DisposableAgent] task id must be a single name');
      process.exit(1);
    }
    const ttlMinutes = Number(args[2] || 30);
    const scopePath = args[3] || 'tools/';
    const lease = createDisposableLease({
      objective: taskId,
      outcome: taskId ? `finish ${taskId}` : '',
      tools: ['read', 'grep'],
      paths: [scopePath],
      ttlMinutes,
    });
    if (!lease.valid) {
      console.error(`[DisposableAgent] refused: ${lease.reasons.join(',')}`);
      process.exit(1);
    }
    const sessionDir = sessionDirFor(taskId);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'manifest.json'), JSON.stringify(lease, null, 2));
    console.log(`[DisposableAgent] lease written ${sessionDir} expires ${lease.expires_at}`);
    return;
  }

  if (command === 'retire') {
    const taskId = String(args[1] || '').trim();
    if (!/^[\w.-]+$/.test(taskId)) {
      console.error('[DisposableAgent] task id must be a single name');
      process.exit(1);
    }
    const sessionDir = sessionDirFor(taskId);
    const manifestPath = path.join(sessionDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.error(`[DisposableAgent] no lease at ${sessionDir}`);
      process.exit(1);
    }
    const lease = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const extractPath = path.join(sessionDir, 'extracted-intelligence.json');
    let outcomeMet = false;
    if (fs.existsSync(extractPath)) {
      const extracted = extractDisposableIntelligence(JSON.parse(fs.readFileSync(extractPath, 'utf8')));
      outcomeMet = extracted.persisted;
      fs.writeFileSync(extractPath, JSON.stringify(extracted.kept || {}, null, 2));
    }
    const retirement = retireDisposableLease(lease, { outcomeMet });
    if (retirement.status === 'still_active') {
      console.error(`[DisposableAgent] still active until ${lease.expires_at}. Pass a kept decision and evidence file to retire early.`);
      process.exit(1);
    }
    for (const file of fs.readdirSync(sessionDir)) {
      if (file === 'manifest.json' || file === 'extracted-intelligence.json') continue;
      fs.unlinkSync(path.join(sessionDir, file));
    }
    fs.writeFileSync(path.join(sessionDir, 'retirement.json'), JSON.stringify(retirement, null, 2));
    console.log(`[DisposableAgent] ${retirement.status} locks_deleted=${retirement.locks_deleted} credentials_revoked=${retirement.credentials_revoked}`);
    return;
  }

  console.log(`Usage:
  node tools/disposable-agent.js create <taskId> [ttlMinutes] [scopePath]
  node tools/disposable-agent.js retire <taskId>
A lease needs a task id, a time limit of 30 minutes or less, and a folder narrower than / or .
Retire keeps manifest.json and extracted-intelligence.json. It does not delete locks.`);
}

if (require.main === module) main();
