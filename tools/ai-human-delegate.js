#!/usr/bin/env node
/**
 * ai-human-delegate.js — Autonomous AI-to-Human Delegation & Economic Requisition Engine
 * Inspired by Liam Fallen's workflow where an AI bot hires and pays humans for real-world tasks.
 * Uses ThumbGate purchase requisitions and agent-mesh coordination.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REQ_FILE = path.join(process.cwd(), '.thumbgate', 'human-delegations.json');

function ensureStore() {
  const dir = path.dirname(REQ_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(REQ_FILE)) {
    fs.writeFileSync(REQ_FILE, JSON.stringify([], null, 2));
  }
}

export function createDelegationTask({ task, vendor, amountUsd, purpose, sourceMessageId }) {
  ensureStore();
  const list = JSON.parse(fs.readFileSync(REQ_FILE, 'utf8'));
  const record = {
    id: `del_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    task,
    vendor: vendor || 'Fiverr / RentAHuman / Independent',
    amountUsd: amountUsd || 149.0,
    purpose: purpose || 'Autonomous real-world execution task requiring human labor',
    sourceMessageId: sourceMessageId || 'msg_autonomous_delegate',
    status: 'PENDING_HUMAN_APPROVAL',
    createdAt: new Date().toISOString()
  };
  list.push(record);
  fs.writeFileSync(REQ_FILE, JSON.stringify(list, null, 2));
  console.log(`[AI-Delegation] Created delegation task:`, JSON.stringify(record, null, 2));
  return record;
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename || process.argv[1].endsWith('ai-human-delegate.js')) {
  const argTask = process.argv[2] || 'Day of promotional fieldwork';
  const argAmount = parseFloat(process.argv[3]) || 149;
  createDelegationTask({ task: argTask, amountUsd: argAmount });
}
