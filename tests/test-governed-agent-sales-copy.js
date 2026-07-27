#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  TEMPLATE_VERSION,
  OFFER_LADDER,
  buildGovernedFollowupEmail,
  buildGithubFollowupBody,
  buildBuyerReplyPacket,
  offerShort,
  ladderMarkdown,
} = require('../tools/governed-agent-sales-copy');

let n = 0;
function check(label, fn) {
  fn();
  n += 1;
  console.log(`  ok - ${label}`);
}

check('template version is v2 governed', () => {
  assert.match(TEMPLATE_VERSION, /v2-governed/);
});

check('ladder has three offers', () => {
  assert.strictEqual(OFFER_LADDER.length, 3);
  assert.ok(ladderMarkdown().includes('Diagnostic'));
});

check('offerShort maps routes', () => {
  assert.match(offerShort('Partner Pilot ($3,000)'), /Partner Pilot/);
  assert.match(offerShort('Hardening Sprint'), /Hardening/);
  assert.match(offerShort('Agent Reliability Diagnostic ($499)'), /Diagnostic/);
});

check('followup includes live link only when http 200', () => {
  const withLink = buildGovernedFollowupEmail(
    { prospect_label: 'acme', route: 'Agent Reliability Diagnostic ($499)' },
    { email: 'a@b.com', person: 'Ann Smith' },
    { url: 'https://buy.stripe.com/x', http: 200 },
  );
  assert.match(withLink.body, /buy\.stripe\.com\/x/);
  assert.match(withLink.body, /Hi Ann/);
  assert.match(withLink.body, /visibility/);
  assert.match(withLink.subject, /Governed agents/i);
  assert.strictEqual(withLink.template, TEMPLATE_VERSION);

  const noLink = buildGovernedFollowupEmail(
    { prospect_label: 'acme', route: 'Agent Reliability Diagnostic ($499)' },
    { email: 'a@b.com', person: 'Ann' },
    { url: 'https://buy.stripe.com/x', http: 403 },
  );
  assert.doesNotMatch(noLink.body, /buy\.stripe\.com\/x/);
  assert.strictEqual(noLink.link, null);
});

check('github followup mentions diagnostic path', () => {
  const body = buildGithubFollowupBody();
  assert.match(body, /hard stop/i);
  assert.match(body, /diagnostic/i);
});

check('buyer packets cover objections', () => {
  const eng = buildBuyerReplyPacket({ kind: 'engaged', name: 'Levent', link: 'https://buy.stripe.com/ok' });
  assert.match(eng.body, /Levent/);
  assert.match(eng.body, /buy\.stripe\.com\/ok/);

  const ls = buildBuyerReplyPacket({ kind: 'langsmith', name: 'A' });
  assert.match(ls.body, /hard-stop|hard stop/i);

  const host = buildBuyerReplyPacket({ kind: 'hosting' });
  assert.match(host.body, /Hosting|hosting|Orchestration/i);

  const nn = buildBuyerReplyPacket({ kind: 'not_now' });
  assert.match(nn.body, /closing the loop/i);
  assert.strictEqual(nn.kind, 'not_now');
});

console.log(`\nPASS ${n}/${n} governed-agent-sales-copy`);
