#!/usr/bin/env node
'use strict';

/**
 * hermes-integration-paths.js — Three Hermes Agent integration paths for THIS repo.
 *
 * Inspired by Nous Research Hermes Agent multi-surface design + Block Buzz
 * (Nostr workspace) ACP bridge patterns (MarkTechPost 2026-07-31 coverage of
 * Hermes Agent + Buzz Blocks / open Nostr workspace for humans and agents).
 *
 * Paths (mapped onto mac-yolo-safeguards / ThumbGate / Hermes Mobile):
 *
 *  1. local_cli     — Mac-local gateway / hermes-yolo / pair tools (USB·Tailscale)
 *  2. control_plane — ThumbGate.app web + mobile phone remote (ACP-capable API)
 *  3. buzz_nostr    — Nostr event log (Buzz-compatible identity) ↔ ACP ↔ Hermes task
 *
 * Usage:
 *   node tools/hermes-integration-paths.js list [--json]
 *   node tools/hermes-integration-paths.js doctor [--json]
 *   node tools/hermes-integration-paths.js demo-nostr-acp [--json]
 *   node tools/hermes-integration-paths.js --self-test
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const PATHS = [
  {
    id: 'local_cli',
    name: 'Local CLI / Mac gateway',
    description:
      'Hermes runs on the user’s computer; pair via USB/Tailscale; agent tools stay on-box.',
    artifacts: [
      'tools/hermes-mobile-pair.js',
      'hermes-yolo-wrapper.js',
      'docs/HERMES-HARDWARE-LEASH.md',
    ],
    verify: 'node -e "require(\'fs\').accessSync(\'tools/hermes-mobile-pair.js\')"',
    nousAnalog: 'hermes CLI + local terminal backend',
  },
  {
    id: 'control_plane',
    name: 'Control plane (web + mobile)',
    description:
      'ThumbGate.app dashboard and Hermes Mobile remote the same Mac-side agent over relay/HTTP.',
    artifacts: [
      'apps/hermes-control-plane/',
      'hermes-mobile/',
      'apps/hermes-control-plane/lib/acp-transformer.ts',
    ],
    verify: 'node -e "require(\'fs\').accessSync(\'apps/hermes-control-plane/lib/acp-transformer.ts\')"',
    nousAnalog: 'Messaging gateway surfaces (Telegram/Discord/…) — we use web+mobile instead',
  },
  {
    id: 'buzz_nostr',
    name: 'Buzz / Nostr + ACP',
    description:
      'Signed Nostr events (Buzz-style workspace log) transform to ACP then Hermes tasks.',
    artifacts: [
      'tools/buzz-nostr-bridge.js',
      'apps/hermes-control-plane/lib/acp-transformer.ts',
      'docs/HERMES-BUZZ-INTEGRATION.md',
    ],
    verify: 'node tools/buzz-nostr-bridge.js >/dev/null',
    nousAnalog: 'hermes acp + buzz-acp (Block Buzz community relay)',
  },
];

function artifactExists(rel) {
  const p = path.join(ROOT, rel.replace(/\/$/, ''));
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function doctor() {
  const results = PATHS.map((p) => {
    const missing = (p.artifacts || []).filter((a) => !artifactExists(a));
    let verify = { ok: missing.length === 0, status: null, error: null };
    if (missing.length === 0 && p.verify) {
      const r = spawnSync('bash', ['-lc', p.verify], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 30_000,
      });
      verify = {
        ok: r.status === 0,
        status: r.status,
        error: r.status === 0 ? null : (r.stderr || r.stdout || '').slice(0, 300),
      };
    }
    return {
      id: p.id,
      name: p.name,
      ok: missing.length === 0 && verify.ok,
      missing,
      verify,
      nousAnalog: p.nousAnalog,
    };
  });
  return {
    ok: results.every((r) => r.ok),
    paths: results,
    sources: {
      hermesAgent: 'https://github.com/NousResearch/hermes-agent',
      buzz: 'https://github.com/block/buzz',
      article:
        'https://www.marktechpost.com/2026/07/31/nous-research-ships-three-integration-paths-for-hermes-agent-and-buzz-blocks-open-source-nostr-workspace-for-humans-and-agents/',
    },
  };
}

function demoNostrAcp() {
  // Dynamic require so doctor still works if optional crypto deps missing
  const {
    generateNostrAgentIdentity,
    createNostrAgentEvent,
    verifyNostrEvent,
    nostrEventToAcpMessage,
  } = require('./buzz-nostr-bridge');

  // Inline ACP transform (mirror of acp-transformer.ts) for Node without TS build
  function transformAcpToHermesTask(acp) {
    const rawText = acp.payload?.text ?? '';
    const prompt = rawText.trim();
    const tagMatch = prompt.match(/@(hermes-[a-z0-9-]+)/i);
    const targetAgent = tagMatch ? tagMatch[1].toLowerCase() : 'hermes';
    return {
      prompt,
      sourceProtocol: acp.metadata?.nostrEventId ? 'nostr' : 'acp',
      targetAgent,
      routePreference: 'auto',
      metadata: {
        acpProtocolVersion: acp.protocolVersion || '1.0',
        senderId: acp.sender.id,
        nostrEventId: acp.metadata?.nostrEventId ?? null,
      },
    };
  }

  const identity = generateNostrAgentIdentity();
  const event = createNostrAgentEvent({
    identity,
    content: '@hermes-coder implement three-path doctor under fenced lease',
  });
  const verified = verifyNostrEvent(event);
  if (!verified.valid) {
    return { ok: false, error: verified.error };
  }
  const acp = nostrEventToAcpMessage(event);
  const task = transformAcpToHermesTask(acp);
  return {
    ok: true,
    path: 'buzz_nostr',
    eventId: event.id,
    verified: true,
    targetAgent: task.targetAgent,
    sourceProtocol: task.sourceProtocol,
    promptPreview: task.prompt.slice(0, 120),
  };
}

function selfTest() {
  const assert = require('assert');
  const d = doctor();
  assert.ok(d.paths.length === 3, 'three paths');
  const demo = demoNostrAcp();
  assert.strictEqual(demo.ok, true, demo.error);
  assert.strictEqual(demo.verified, true);
  assert.strictEqual(demo.targetAgent, 'hermes-coder');
  assert.strictEqual(demo.sourceProtocol, 'nostr');

  // False-green guard: HMAC "sig" must fail verify
  const {
    generateNostrAgentIdentity,
    createNostrAgentEvent,
    verifyNostrEvent,
    computeEventId,
  } = require('./buzz-nostr-bridge');
  const crypto = require('crypto');
  const id = generateNostrAgentIdentity();
  const good = createNostrAgentEvent({ identity: id, content: 'x' });
  const fake = {
    ...good,
    sig: crypto.createHmac('sha256', id.hexPrivateKey).update(good.id).digest('hex'),
  };
  // recompute id may still match content; sig is wrong algorithm
  fake.id = computeEventId(fake);
  const bad = verifyNostrEvent(fake);
  assert.strictEqual(bad.valid, false, 'HMAC must not verify as Schnorr');

  console.log('PASS hermes-integration-paths self-test');
}

function parseArgs(argv) {
  const out = { cmd: 'list', json: false, selfTest: false, help: false };
  const rest = [];
  for (const a of argv) {
    if (a === '--json') out.json = true;
    else if (a === '--self-test') out.selfTest = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else rest.push(a);
  }
  if (rest[0]) out.cmd = rest[0];
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`hermes-integration-paths — three Hermes surfaces

  list | doctor | demo-nostr-acp | --self-test
`);
    process.exit(0);
  }
  if (args.selfTest) {
    selfTest();
    process.exit(0);
  }
  if (args.cmd === 'list') {
    if (args.json) console.log(JSON.stringify({ paths: PATHS }, null, 2));
    else {
      console.log('=== Hermes integration paths (this repo) ===');
      for (const p of PATHS) {
        console.log(`\n${p.id} — ${p.name}`);
        console.log(`  ${p.description}`);
        console.log(`  Nous analog: ${p.nousAnalog}`);
        console.log(`  artifacts: ${p.artifacts.join(', ')}`);
      }
    }
    process.exit(0);
  }
  if (args.cmd === 'doctor') {
    const d = doctor();
    if (args.json) console.log(JSON.stringify(d, null, 2));
    else {
      console.log(d.ok ? 'PASS doctor' : 'FAIL doctor');
      for (const p of d.paths) {
        console.log(`  ${p.ok ? 'OK' : 'XX'} ${p.id} missing=${p.missing.join(',') || '-'} verify=${p.verify.ok}`);
      }
    }
    process.exit(d.ok ? 0 : 1);
  }
  if (args.cmd === 'demo-nostr-acp') {
    const d = demoNostrAcp();
    if (args.json) console.log(JSON.stringify(d, null, 2));
    else {
      console.log(d.ok ? 'PASS demo-nostr-acp' : 'FAIL');
      if (d.ok) {
        console.log(`  eventId=${d.eventId}`);
        console.log(`  targetAgent=${d.targetAgent} protocol=${d.sourceProtocol}`);
      } else console.log(d.error);
    }
    process.exit(d.ok ? 0 : 1);
  }
  console.error('unknown command');
  process.exit(2);
}

module.exports = { PATHS, doctor, demoNostrAcp };

if (require.main === module) main();
