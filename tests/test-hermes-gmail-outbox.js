#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildPlan, isEmail } = require('../tools/hermes-gmail-outbox');

function mkFixture(outbox) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-gmail-outbox-'));
  const outboxPath = path.join(root, 'outreach-outbox.json');
  fs.writeFileSync(outboxPath, `${JSON.stringify(outbox, null, 2)}\n`);
  return { root, outboxPath };
}

assert.strictEqual(isEmail('lead@example.com'), true);
assert.strictEqual(isEmail('missing'), false);
assert.strictEqual(isEmail(''), false);

{
  const fixture = mkFixture({
    generated_at: '2026-06-17T00:00:00',
    queue: [
      {
        lead_id: 'lead-with-email',
        label: 'Ava Buyer | Founder',
        status: 'pending',
        prospect_email: 'ava@example.com',
        assigned_channel: 'email',
        offer_sku: 'top1percent-ai-workflow',
        message_text: 'Hi Ava - quick question?',
      },
      {
        lead_id: 'lead-without-email',
        label: 'Ben Buyer | Founder',
        status: 'pending',
        prospect_handle: 'ben-buyer',
        assigned_channel: 'skool_dm',
        offer_sku: 'top1percent-ai-workflow',
        message_text: 'Hi Ben - quick question?',
      },
      {
        lead_id: 'already-sent',
        label: 'Sent Lead',
        status: 'sent',
        prospect_email: 'sent@example.com',
        message_text: 'skip me',
      },
    ],
  });

  const plan = buildPlan({
    outbox: fixture.outboxPath,
    operatorEmail: 'iganapolsky@gmail.com',
  });

  assert.strictEqual(plan.counts.source_queue, 3);
  assert.strictEqual(plan.counts.actions, 2);
  assert.strictEqual(plan.counts.prospect_drafts, 1);
  assert.strictEqual(plan.counts.operator_digest_drafts, 1);
  assert.strictEqual(plan.counts.missing_email_leads, 1);
  assert.strictEqual(plan.counts.skipped, 1);

  const prospect = plan.actions.find((action) => action.lead_id === 'lead-with-email');
  assert.strictEqual(prospect.mode, 'prospect');
  assert.strictEqual(prospect.to, 'ava@example.com');
  assert.strictEqual(prospect.missing_prospect_email, false);
  assert(prospect.body.includes('Hi Ava - quick question?'));
  assert(prospect.body.includes('Best,\nIgor'));
  assert(!prospect.body.includes('CEO review'));
  assert(!prospect.body.includes('Hermes could not find'));

  const digest = plan.actions.find((action) => action.lead_id === 'missing-email-digest');
  assert.strictEqual(digest.mode, 'operator_digest');
  assert.strictEqual(digest.to, 'iganapolsky@gmail.com');
  assert.strictEqual(digest.missing_prospect_email, true);
  assert.strictEqual(digest.digest_count, 1);
  assert(digest.subject.includes('Contact research needed for 1 outreach lead'));
  assert(digest.body.includes('Do not send this as outreach'));
  assert(digest.body.includes('Handle: ben-buyer'));
  assert(digest.body.includes('Suggested opener: Hi Ben - quick question?'));
  assert(!digest.subject.includes('CEO review'));
  assert(!digest.body.includes('Hermes could not find'));

  fs.rmSync(fixture.root, { recursive: true, force: true });
}

{
  const fixture = mkFixture({
    queue: [
      {
        lead_id: 'lead-invalid-email',
        label: 'Invalid Email',
        status: 'pending',
        prospect_email: 'not-an-email',
        message_text: 'hello',
      },
    ],
  });

  const plan = buildPlan({
    outbox: fixture.outboxPath,
    operatorEmail: 'iganapolsky@gmail.com',
  });

  assert.strictEqual(plan.counts.actions, 1);
  assert.strictEqual(plan.counts.prospect_drafts, 0);
  assert.strictEqual(plan.counts.operator_digest_drafts, 1);
  assert.strictEqual(plan.counts.missing_email_leads, 1);
  assert.strictEqual(plan.actions[0].mode, 'operator_digest');
  assert.strictEqual(plan.actions[0].to, 'iganapolsky@gmail.com');
  assert(plan.actions[0].body.includes('Do not send this as outreach'));

  fs.rmSync(fixture.root, { recursive: true, force: true });
}

console.log('test-hermes-gmail-outbox: PASS');
