#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const { queryLinear } = require('./linear-agent-bridge');

const CWD = path.resolve(__dirname, '..');

function log(msg) {
  console.log(`[Autonomous Fleet Loop ${new Date().toISOString()}] ${msg}`);
}

async function markOldNotificationsRead() {
  log('Checking for old unread Linear notifications to auto-archive...');
  try {
    const listRes = await queryLinear('{ notifications(first: 50) { nodes { id readAt } } }');
    const nodes = listRes.data?.notifications?.nodes || [];
    const unread = nodes.filter(n => !n.readAt);

    if (unread.length > 0) {
      log(`Auto-archiving ${unread.length} unread Linear notifications...`);
      const mutation = `mutation MarkRead($id: String!, $input: NotificationUpdateInput!) { notificationUpdate(id: $id, input: $input) { success } }`;
      const now = new Date().toISOString();
      for (const n of unread) {
        await queryLinear(mutation, { id: n.id, input: { readAt: now } });
      }
      log(`✅ Auto-archived ${unread.length} notifications.`);
    } else {
      log('Linear notification inbox is already clean.');
    }
  } catch (err) {
    log(`Warning: Notification auto-archive failed: ${err.message}`);
  }
}

function runLoop() {
  log('Starting background autonomous sync & self-healing pass...');

  // 1. GitHub -> Linear Sync
  try {
    log('Running GitHub -> Linear Sync...');
    execSync('node tools/github-linear-sync.js', { cwd: CWD, encoding: 'utf8' });
  } catch (err) {
    log(`GitHub -> Linear Sync error: ${err.message}`);
  }

  // 2. Obsidian Vault Sync
  try {
    log('Running Obsidian Vault Sync...');
    execSync('node tools/obsidian-linear-sync.js', { cwd: CWD, encoding: 'utf8' });
  } catch (err) {
    log(`Obsidian Vault Sync error: ${err.message}`);
  }

  // 3. Vault Self-Healing & Hygiene
  try {
    log('Running Vault Self-Healing...');
    execSync('node tools/obsidian-self-healing-orchestration.js', { cwd: CWD, encoding: 'utf8' });
  } catch (err) {
    log(`Vault Self-Healing error: ${err.message}`);
  }

  // 4. Auto-clear Inbox Notifications
  markOldNotificationsRead().then(() => {
    log('🎉 Autonomous background loop completed successfully!');
  });
}

runLoop();
