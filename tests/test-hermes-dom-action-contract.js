#!/usr/bin/env node
'use strict';

const assert = require('assert');

const {
  buildActionPlan,
  buildBrief,
  cleanText,
  dehydrateHtml,
  generateInPageJavaScript,
  parseAttributes,
  safeHref,
} = require('../tools/hermes-dom-action-contract');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

const sampleHtml = `
<main>
  <a href="https://example.com/login?token=abc123&keep=1#frag" aria-label="Open login">Log In</a>
  <input type="hidden" name="csrf" value="dont-leak-me" />
  <label>Email <input id="email:field" name="email" placeholder="Email Address" value="igor@example.com" /></label>
  <input id="password-field" type="password" name="password" value="Rockland26&*" />
  <button id="send button" type="submit">Send payment request</button>
  <button data-testid="delete-project">Delete project</button>
  <div role="button" aria-label="Choose workspace">Workspace</div>
</main>`;

test('parseAttributes handles quoted, single-quoted, bare, and boolean attrs', () => {
  const attrs = parseAttributes('id="send button" data-testid=\'cta-primary\' disabled value=abc');
  assert.strictEqual(attrs.id, 'send button');
  assert.strictEqual(attrs['data-testid'], 'cta-primary');
  assert.strictEqual(attrs.disabled, '');
  assert.strictEqual(attrs.value, 'abc');
});

test('cleanText decodes entities and removes script/style content', () => {
  assert.strictEqual(cleanText('<style>.x{}</style><span>Submit &amp; Continue</span>'), 'Submit & Continue');
  assert.strictEqual(cleanText('<script>alert(1)</script> Safe'), 'Safe');
});

test('dehydrateHtml masks all values and strips hidden inputs', () => {
  const dom = dehydrateHtml(sampleHtml);
  const serialized = JSON.stringify(dom);
  assert.strictEqual(dom.version, 'hermes-dom-action-contract/v1');
  assert(!serialized.includes('dont-leak-me'));
  assert(!serialized.includes('igor@example.com'));
  assert(!serialized.includes('Rockland26'));
  assert(dom.elements.some((element) => element.label === 'Email Address' && element.attributes.value === '<redacted>'));
  assert(dom.elements.some((element) => element.label === 'password' && element.attributes.sensitive === true));
  assert(!dom.elements.some((element) => element.attributes.name === 'csrf'));
});

test('safeHref redacts credential-like query params but keeps useful routing info', () => {
  assert.strictEqual(
    safeHref('https://example.com/login?token=abc123&keep=1#frag'),
    'https://example.com/login?token=%3Credacted%3E&keep=1#...',
  );
});

test('buildActionPlan maps input commands without approval for ordinary text fields', () => {
  const dom = dehydrateHtml(sampleHtml);
  const plan = buildActionPlan('Type test@example.com in Email Address', dom);
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.action, 'input');
  assert.strictEqual(plan.target.label, 'Email Address');
  assert.strictEqual(plan.requiresApproval, false);
  assert(plan.sideEffects.includes('form_value_change'));
});

test('buildActionPlan approval-gates credential input', () => {
  const dom = dehydrateHtml(sampleHtml);
  const plan = buildActionPlan('Type hunter2 in password', dom);
  assert.strictEqual(plan.ok, true);
  assert.strictEqual(plan.action, 'input');
  assert.strictEqual(plan.requiresApproval, true);
  assert(plan.approvalReasons.includes('credential'));
});

test('buildActionPlan approval-gates submit, money, and destructive clicks', () => {
  const dom = dehydrateHtml(sampleHtml);
  const payment = buildActionPlan('Click send payment request', dom);
  assert.strictEqual(payment.ok, true);
  assert(payment.approvalReasons.includes('submit'));
  assert(payment.approvalReasons.includes('money'));

  const destructive = buildActionPlan('Click delete project', dom);
  assert.strictEqual(destructive.ok, true);
  assert(destructive.approvalReasons.includes('destructive'));
});

test('generateInPageJavaScript refuses unapproved risky actions', () => {
  const dom = dehydrateHtml(sampleHtml);
  const plan = buildActionPlan('Click send payment request', dom);
  const js = generateInPageJavaScript(plan);
  assert(js.includes('approval_required'));
  assert(!js.includes('Send payment request"; el.click'));
});

test('generateInPageJavaScript uses attribute equality matching instead of raw selector interpolation', () => {
  const dom = dehydrateHtml(sampleHtml);
  const plan = buildActionPlan('Type hello@example.com in Email Address', dom);
  const js = generateInPageJavaScript(plan);
  assert(js.includes('const descriptor ='));
  assert(js.includes('const attr = (name) => el.getAttribute(name) || "";'));
  assert(js.includes('valueWritten: true'));
  assert(!js.includes('querySelector("input[id='));
});

test('buildBrief carries source adaptation and not-adopted defaults', () => {
  const brief = buildBrief('Click workspace', sampleHtml);
  assert.strictEqual(brief.source, 'page-agent-inspired-dom-contract');
  assert(brief.upstreamPattern.adaptedIdeas.includes('DOM dehydration'));
  assert(brief.upstreamPattern.notAdoptedByDefault.includes('demo LLM endpoint'));
  assert.strictEqual(brief.plan.ok, true);
});

if (process.exitCode) process.exit(process.exitCode);
console.log('test-hermes-dom-action-contract: PASS');
