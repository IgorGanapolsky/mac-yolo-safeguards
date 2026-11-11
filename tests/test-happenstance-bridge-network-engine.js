#!/usr/bin/env node
'use strict';

const assert = require('assert');
const zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  isBlockedEmail,
  decompressBridgePayload,
  crossJoinHappenstanceAndBridge,
  inferOfferTier,
  summarizeNetworkPipeline,
} = require('../tools/happenstance-bridge-network-engine');

// 1. Corporate air-gap diode + system address filtering
assert.strictEqual(isBlockedEmail('user@ecisolutions.com'), true, 'must block ecisolutions.com');
assert.strictEqual(isBlockedEmail('user@ecinexus.com'), true, 'must block ecinexus.com');
assert.strictEqual(isBlockedEmail('noreply@github.com'), true, 'must block noreply');
assert.strictEqual(isBlockedEmail('founder@example.ai'), false, 'must allow external founder email');

// 2. Gzip decompression for Bridge localStorage payloads
const samplePayload = { value: { c1: { name: 'Ada Lovelace', email: 'ada@analytical.engine' } } };
const gzLatin1 = zlib.gzipSync(Buffer.from(JSON.stringify(samplePayload), 'utf8')).toString('latin1');
const decompressed = decompressBridgePayload(gzLatin1);
assert.deepStrictEqual(decompressed, samplePayload, 'must gunzip Bridge latin1 localStorage payload');

// 3. Cross-join Happenstance leads (missing emails) with Bridge synced contacts + members
const happenstanceLeads = [
  {
    name: 'Jane Doe',
    company: 'Agentic Labs',
    role: 'Head of AI Labs',
    thinking: 'Leads AI coding agent rollout across engineering.',
  },
  {
    name: 'Alex Builder',
    company: 'Indie Stack',
    role: 'Senior Software Engineer',
    thinking: 'Hands-on Cursor and Claude Code user on macOS.',
  },
  {
    name: 'Blocked Corp',
    company: 'ECI',
    role: 'CTO',
    email: 'blocked@ecisolutions.com',
  },
];

const bridgeContacts = [
  {
    name: 'Jane Doe',
    email: 'jane@agenticlabs.example',
    company: 'Agentic Labs',
    position: 'Head of AI Labs',
    is_member: false,
  },
  {
    name: 'Alex Builder',
    email: 'alex@indiestack.example',
    company: 'Indie Stack',
    position: 'Senior Software Engineer',
    is_member: false,
  },
];

const bridgeMembers = [
  {
    name: 'Sam Connector',
    email: 'sam@superguard.example',
    company: 'Superguard',
    position: 'Founder & CEO',
    is_member: true,
  },
];

const joined = crossJoinHappenstanceAndBridge({
  happenstanceLeads,
  bridgeContacts,
  bridgeMembers,
});

assert.strictEqual(joined.length, 3, 'must resolve 2 Happenstance leads + 1 Bridge member and drop blocked corporate email');
assert.strictEqual(joined[0].email, 'jane@agenticlabs.example');
assert.strictEqual(joined[0].offer, 'team_sprint');
assert.strictEqual(joined[0].gross_potential_usd, 499);
assert.strictEqual(joined[1].email, 'alex@indiestack.example');
assert.strictEqual(joined[1].offer, 'pro');
assert.strictEqual(joined[1].gross_potential_usd, 149);
assert.strictEqual(joined[2].email, 'sam@superguard.example');
assert.strictEqual(joined[2].source, 'bridge_1st_degree_member');

// 4. Pipeline summary test on isolated tmp dir
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hb-net-test-'));
const day = '2026-11-11';
fs.writeFileSync(
  path.join(tmpDir, 'autonomous-contacts.json'),
  JSON.stringify({
    'jane@agenticlabs.example': {
      email: 'jane@agenticlabs.example',
      prospect: 'jane_doe_agentic_labs',
      person: 'Jane Doe',
      source: 'happenstance-bridge-1st-degree',
    },
  }),
);
fs.writeFileSync(
  path.join(tmpDir, `pipeline-status-${day}.tsv`),
  [
    'prospect_label\tstage\troute\tgross_potential_usd\tlast_touch\tnext_action\tnotes',
    'jane_doe_agentic_labs\tsent\tAgent Reliability Diagnostic ($499)\t499.00\t2026-11-11\twait_for_reply\tJane Doe <jane@agenticlabs.example>',
  ].join('\n') + '\n',
);
const sum = summarizeNetworkPipeline(tmpDir, day);
assert.strictEqual(sum.networkLeadsCount, 1);
assert.strictEqual(sum.networkSentCount, 1);
assert.strictEqual(sum.networkGrossUsd, 499);
fs.rmSync(tmpDir, { recursive: true, force: true });

assert.strictEqual(inferOfferTier({ role: 'CTO & Co-Founder' }), 'team_sprint');
assert.strictEqual(inferOfferTier({ role: 'Software Developer' }), 'pro');

console.log('PASS test-happenstance-bridge-network-engine');
