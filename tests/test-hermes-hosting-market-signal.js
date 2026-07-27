#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  parseArgs,
  buildOutboundDraft,
  buildSignal,
  DEFAULT_SIGNAL,
} = require('../tools/hermes-hosting-market-signal');

let n = 0;
function check(label, fn) {
  fn();
  n += 1;
  console.log(`  ok - ${label}`);
}

check('parseArgs defaults', () => {
  const a = parseArgs([]);
  assert.strictEqual(a.applyPipeline, false);
  assert.strictEqual(a.json, false);
});

check('buildSignal demo uses default MyClaw source', () => {
  const s = buildSignal({ demo: true });
  // Exact hostname match (not a raw substring test) so a lookalike host such as
  // "https://evil.com/x.com" or "https://x.com.evil.com" cannot pass this check.
  const sourceHost = new URL(s.source).hostname;
  assert.ok(s.source.includes('hasantoxr') || sourceHost === 'x.com');
  assert.ok(s.icp.toLowerCase().includes('hermes') || s.icp.includes('always-on'));
});

check('buildOutboundDraft includes live diagnostic link when ok', () => {
  const drafts = buildOutboundDraft(DEFAULT_SIGNAL, {
    links: {
      'Agent Reliability Diagnostic': {
        url: 'https://buy.stripe.com/test499',
        http: 200,
        ok: true,
      },
    },
  });
  assert.match(drafts.xReply, /buy\.stripe\.com\/test499/);
  assert.match(drafts.emailBody, /Hosted Hermes/);
  assert.doesNotMatch(
    buildOutboundDraft(DEFAULT_SIGNAL, {
      links: {
        'Agent Reliability Diagnostic': {
          url: 'https://buy.stripe.com/bad',
          http: 403,
          ok: false,
        },
      },
    }).xReply,
    /buy\.stripe\.com\/bad/,
  );
});

check('parseArgs source and apply', () => {
  const a = parseArgs(['--source', 'https://x.com/a/status/1', '--apply-pipeline', '--json']);
  assert.strictEqual(a.source, 'https://x.com/a/status/1');
  assert.strictEqual(a.applyPipeline, true);
  assert.strictEqual(a.json, true);
});

check('enterprise-sdlc preset prefers Partner Pilot CTA when ok', () => {
  const s = buildSignal({ preset: 'enterprise-sdlc', demo: true });
  assert.match(s.offer, /Partner Pilot/i);
  const drafts = buildOutboundDraft(s, {
    links: {
      'Partner Pilot': { url: 'https://buy.stripe.com/pilot', http: 200, ok: true },
      'Agent Reliability Diagnostic': { url: 'https://buy.stripe.com/d', http: 200, ok: true },
    },
  });
  assert.match(drafts.cta, /buy\.stripe\.com\/pilot/);
  assert.match(drafts.xReply, /safely, repeatedly, economically|multi-agent SDLC|IBM Bob/i);
});

check('parseArgs preset', () => {
  const a = parseArgs(['--preset', 'enterprise-sdlc']);
  assert.strictEqual(a.preset, 'enterprise-sdlc');
});

console.log(`\nPASS ${n}/${n} hermes-hosting-market-signal`);
