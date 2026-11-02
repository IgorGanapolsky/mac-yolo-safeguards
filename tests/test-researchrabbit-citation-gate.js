'use strict';

const assert = require('assert');
const { assessResearchRabbit } = require('../tools/researchrabbit-citation-gate');

const empty = assessResearchRabbit();
assert.strictEqual(empty.passed, false);
assert.strictEqual(empty.files_written, false);
assert.strictEqual(empty.monetization_pack_written, false);
assert.strictEqual(empty.monetization_pack_path, null);
assert.strictEqual(empty.outreach_sent, false);
assert.strictEqual(empty.upgrade_purchased, false);
assert.strictEqual(empty.account_email_seen, false);
assert.strictEqual(empty.authenticated_google_sso, null);
assert.strictEqual(empty.papers_named, 0);
assert.strictEqual(empty.discovered_guardrail_papers_count, 0);
assert.strictEqual(empty.buyer_emails_named, 0);
assert.strictEqual(empty.outbound_spend_usd, null);
assert.strictEqual(empty.cash_received_usd, null);
assert.strictEqual(empty.live_search_url, null);
assert.strictEqual(empty.vendor_counts_stored, false);

const secret = 'rabbit-secret-do-not-echo-7e1d';
const named = assessResearchRabbit({
  displayName: 'Igor',
  accountEmail: secret + '@gmail.com',
  collectionTitle: secret,
  collectionUrl: 'https://app.researchrabbit.ai/library/collection/93c4a77c-dc03-4e8e-a3d0-10ee1a51fa1e',
  papers: [
    { author: secret, title: secret, buyer_email: secret + '@buyer.example' },
    { author: 'Chen', title: '' },
  ],
});
assert.strictEqual(named.passed, false);
assert.strictEqual(named.display_name_named, true);
assert.strictEqual(named.account_email_seen, false);
assert.strictEqual(named.authenticated_google_sso, null);
assert.strictEqual(named.caller_email_accepted, false);
assert.strictEqual(named.collection_title_named, true);
assert.strictEqual(named.collection_url_named, true);
assert.strictEqual(named.papers_named, 1);
assert.strictEqual(named.buyer_emails_named, 0);
assert.strictEqual(named.buyer_emails_accepted, false);
assert.strictEqual(named.outreach_sent, false);
assert.strictEqual(named.cash_received_usd, null);
assert.strictEqual(named.outbound_spend_usd, null);
const body = JSON.stringify(named);
assert.ok(!body.includes(secret));
assert.ok(!body.includes('320'));
assert.ok(!body.includes('1,000,000'));
assert.ok(!body.includes('$0'));
assert.ok(!body.includes('gmail.com'));

const badUrl = assessResearchRabbit({
  collectionUrl: 'https://app.researchrabbit.ai/search/3eae3d13-9fc2-4649-8809-10dc88200f66/0',
});
assert.strictEqual(badUrl.collection_url_named, false);
assert.strictEqual(badUrl.live_search_url, null);
assert.strictEqual(badUrl.passed, false);

console.log('test-researchrabbit-citation-gate: PASS');
