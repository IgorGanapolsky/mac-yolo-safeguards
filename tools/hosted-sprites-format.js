#!/usr/bin/env node
'use strict';

/**
 * Fly.io Sprites / SBD FORMAT steal — not the SKU.
 *
 * Newsletter 2026-09-10: harness plugins, sprites.dev/mcp, SBD (S3 as
 * block device + ext4). We already have one always-on Fly Machine
 * (igor-hermes-cloud-runner). Do not buy Sprites, SBD, phoenix.new,
 * @fly/sprites, or sprites-py.
 *
 * Stolen FORMAT only:
 *  1. Reach without a local installer → probe our health URLs (not LIVE e2e)
 *  2. Point at a resource instead of pasting the prompt → publicRunReceipt.resourceRef
 *  3. Checkpoint is durable control-plane state, not VM disk / SBD
 */

const fs = require('fs');
const path = require('path');

const SCHEMA = 'hosted-sprites-format/v1';
const SOURCE = 'https://fly.io/blog/sprites-mcp/';
const NEWSLETTER = 'Fly.io Newsletter 2026-09-10 All agents welcome / SBD private beta';
const PRODUCT = 'hosted-hermes-chat-on-fenced-vps';
const PROTECTED_APP = 'igor-hermes-cloud-runner';
const HEALTH_URLS = Object.freeze([
  'https://thumbgate.app/api/health',
  'https://igor-hermes-cloud-runner.fly.dev/health',
]);
const NEVER_BUY = Object.freeze([
  'sprites',
  'sbd',
  'sprites.dev/mcp',
  'sprites-py',
  '@fly/sprites',
  'phoenix.new',
]);

const SPRITE_SKU_RE =
  /\b(sprites\.dev\/mcp|@fly\/sprites|sprites-py|sprites-adk|sprites-openai-agents|sprites block device|\bsbd\b|phoenix\.new)\b/i;
const SPRITE_NAME_RE = /\bsprites?\b/i;
const BUY_VERB_RE = /\b(install|subscribe|buy|enable|wire|pip install|npm install|point .+ mcp|private beta)\b/i;

function defaultRepoRoot() {
  return path.resolve(__dirname, '..');
}

function readRepoFile(repoRoot, rel) {
  try {
    return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  } catch {
    return '';
  }
}

function classify(prompt = '') {
  const text = String(prompt);
  if (SPRITE_SKU_RE.test(text) || (SPRITE_NAME_RE.test(text) && BUY_VERB_RE.test(text))) {
    return {
      place: 'refuse',
      reason: 'SPRITES_SKU_FORBIDDEN',
      product: PRODUCT,
      buy: false,
      weAreSprites: false,
      weAreSbd: false,
    };
  }
  return {
    place: 'hosted-vps',
    reason: 'EXISTING_FLY_MACHINE_NOT_SPRITES',
    product: PRODUCT,
    app: PROTECTED_APP,
    buy: false,
  };
}

function formatMap() {
  return {
    mcpReachWithoutInstall: {
      fly: 'https://sprites.dev/mcp (OAuth, nothing local)',
      ours: HEALTH_URLS.slice(),
      claim: 'probe_not_live_e2e',
    },
    resourceNotPaste: {
      fly: 'MCP resource instead of a pasted file wall',
      ours: 'publicRunReceipt.resourceRef is a task id pointer; never the prompt',
    },
    checkpointNotSbd: {
      fly: 'SBD presents S3 to the kernel as a block device and runs ext4',
      ours: 'D1 persist-before-live + inbound claim heartbeat; Machine disk is not the source of truth',
    },
  };
}

function inspectCheckpoint(repoRoot = defaultRepoRoot()) {
  const receipt = readRepoFile(repoRoot, 'apps/hermes-control-plane/lib/hosted-source-of-truth.ts');
  const heartbeat = readRepoFile(repoRoot, 'apps/hermes-control-plane/lib/cloud-runner-heartbeat.ts');
  const claim = readRepoFile(repoRoot, 'apps/hermes-control-plane/app/api/runner/tasks/claim/route.ts');
  const hasReceipt = /export function publicRunReceipt\(/.test(receipt)
    && /resourceRef/.test(receipt)
    && /sourceOfTruth/.test(receipt);
  const hasHeartbeat = /persistCloudRunnerHeartbeat/.test(heartbeat)
    && /persistCloudRunnerHeartbeat/.test(claim);
  return {
    hasReceiptPointer: hasReceipt,
    hasInboundHeartbeat: hasHeartbeat,
    vmDiskIsSourceOfTruth: false,
    sbdPresent: false,
    kind: hasReceipt && hasHeartbeat ? 'CONTROL_PLANE_CHECKPOINT' : 'MISSING_CHECKPOINT_RAILS',
  };
}

function runDoctor(options = {}) {
  const repoRoot = options.repoRoot || defaultRepoRoot();
  const checkpoint = inspectCheckpoint(repoRoot);
  return {
    schema: SCHEMA,
    source: SOURCE,
    newsletter: NEWSLETTER,
    weAreSprites: false,
    weAreSbd: false,
    buySprites: false,
    buySbd: false,
    product: PRODUCT,
    protect: PROTECTED_APP,
    neverBuy: NEVER_BUY.slice(),
    format: formatMap(),
    checkpoint,
    probeClaim: 'probe_not_live_e2e',
    status: checkpoint.kind === 'CONTROL_PLANE_CHECKPOINT'
      ? 'FORMAT_MAPPED_SKU_REFUSED'
      : 'FORMAT_GAPS',
  };
}

function formatDoctorText(doc) {
  return [
    `Hosted Sprites FORMAT: ${doc.status} (we are not Sprites/SBD)`,
    `  product=${doc.product} protect=${doc.protect}`,
    `  checkpoint=${doc.checkpoint.kind}`,
    `  neverBuy=${doc.neverBuy.join(',')}`,
    `  probeClaim=${doc.probeClaim}`,
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const cmd = argv.find((a) => !a.startsWith('--')) || 'doctor';
  if (cmd === 'route') {
    const prompt = argv.filter((a) => a !== 'route' && a !== '--json').join(' ');
    const decision = classify(prompt);
    console.log(JSON.stringify(decision, null, 2));
    if (decision.place === 'refuse') process.exitCode = 2;
    return decision;
  }
  const doc = runDoctor();
  if (json) console.log(JSON.stringify(doc, null, 2));
  else console.log(formatDoctorText(doc));
  if (doc.status === 'FORMAT_GAPS') process.exitCode = 1;
  return doc;
}

if (require.main === module) {
  main();
}

module.exports = {
  SCHEMA,
  SOURCE,
  NEVER_BUY,
  PROTECTED_APP,
  HEALTH_URLS,
  classify,
  formatMap,
  inspectCheckpoint,
  runDoctor,
  main,
};
