'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'hooks', 'thumbgate-spend-guard', 'pre-tool-use.js');
const { evaluateSpend } = require(GUARD);
const { installSpendGuard } = require(
  path.join(ROOT, 'scripts', 'install-thumbgate-spend-guard.js'),
);

const allowCases = [
  ['Bash', { command: 'apollo usage credits --format json' }],
  ['Bash', { command: 'apollo people search --titles CTO --format json' }],
  ['mcp__apollo_io__analytics_get', { date: 'today' }],
  ['mcp__apollo_io__billing_plan_retrieve', { plan: 'basic' }],
  ['mcp__stripe__payment_link_create', { price_id: 'price_test' }],
  ['mcp__stripe__invoice_retrieve', { invoice_id: 'invoice_test' }],
  ['browser.screenshot', { url: 'https://app.apollo.io/settings' }],
  ['Read', { file_path: '~/.claude/settings.json' }],
  ['read_file', { file_path: '/Users/test/.claude/settings.json' }],
  ['Read', { file_path: '/tmp/apollo-pricing-notes.md' }],
  ['Bash', { command: 'git checkout main' }],
  ['Bash', { command: 'git checkout -- README.md' }],
  ['Bash', { command: 'rg checkout docs/' }],
  ['Bash', { command: 'curl https://api.stripe.com/v1/payment_intents/pi_test' }],
];
for (const [toolName, toolInput] of allowCases) {
  assert.strictEqual(
    evaluateSpend(toolName, toolInput).decision,
    'allow',
    `${toolName} should remain read-only`,
  );
}

const denyCases = [
  ['mcp__codex_apps__apollo_io_apollo_domain_purchase_index', { domain: 'example.com' }],
  ['mcp__codex_apps__apollo_io_apollo_email_account_purchase_index', { count: 1 }],
  ['mcp__stripe__checkout_session_create', { amount: 58800 }],
  ['mcp__stripe__invoice_pay', { invoice_id: 'invoice_test' }],
  ['mcp__stripe__refund_create', { charge_id: 'charge_test' }],
  ['mcp__stripe__charge_create', { amount: 58800 }],
  ['mcp__stripe__payment_intent_confirm', { payment_intent_id: 'pi_test' }],
  ['mcp__apollo__subscription_update', { plan: 'basic', cadence: 'annual' }],
  ['confirm_cost', { amount: 588 }],
  ['Bash', { command: 'apollo upgrade --plan basic --annual --amount $588' }],
  ['Bash', { command: 'apollo buy credits --count 1000' }],
  ['browser.click', { text: 'Upgrade to Basic $588/year', url: 'https://app.apollo.io/billing' }],
  ['browser.navigate', { url: 'https://app.apollo.io/checkout/annual-basic' }],
  ['mcp__computer_use__interact', { action: 'click', coordinate: [640, 410] }],
  ['mcp__browser__type', { action: 'type', text: 'card data is never logged' }],
  ['Bash', { command: 'billing subscription cancel --id sub_123' }],
  ['Bash', { command: 'curl -X POST https://api.example.com/billing/subscription' }],
  ['Bash', { command: 'curl -X POST https://api.stripe.com/v1/payment_intents/pi_test/confirm' }],
  ['Bash', { command: 'rm "$HOME/.thumbgate/bin/thumbgate-spend-guard.js"' }],
  ['Bash', { command: 'printf "{}" > ~/.claude/settings.json' }],
  ['Edit', { file_path: '/Users/test/.claude/settings.json', new_string: '{}' }],
];
for (const [toolName, toolInput] of denyCases) {
  assert.strictEqual(
    evaluateSpend(toolName, toolInput).decision,
    'deny',
    `${toolName} should be blocked`,
  );
}

const receiptDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbgate-spend-receipt-'));
const forbiddenInput = 'apollo upgrade --plan basic --annual --amount $588 --token secret-value';
const cli = spawnSync(process.execPath, [GUARD], {
  input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: forbiddenInput } }),
  encoding: 'utf8',
  env: { ...process.env, THUMBGATE_SPEND_GUARD_RECEIPT_DIR: receiptDirectory },
});
assert.strictEqual(cli.status, 2);
const cliOutput = JSON.parse(cli.stdout.trim());
assert.strictEqual(cliOutput.decision, 'deny');
assert.strictEqual(cliOutput.hookSpecificOutput.permissionDecision, 'deny');
const receipt = fs.readFileSync(path.join(receiptDirectory, 'denies.jsonl'), 'utf8');
assert(!receipt.includes(forbiddenInput));
assert(!receipt.includes('secret-value'));
assert.match(receipt, /financial_mutation_denied/);

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbgate-spend-install-'));
fs.mkdirSync(path.join(tempHome, '.claude'), { recursive: true });
fs.writeFileSync(
  path.join(tempHome, '.claude', 'settings.json'),
  JSON.stringify({
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'node existing-session-hook.js' }] }],
      PreToolUse: [
        { matcher: 'Read', hooks: [{ type: 'command', command: 'node existing-read-hook.js' }] },
        {
          matcher: '.*',
          hooks: [
            { type: 'command', command: 'node /old/thumbgate-spend-guard.js' },
            { type: 'command', command: 'node sibling-audit-hook.js' },
          ],
        },
      ],
    },
  }),
);
installSpendGuard(tempHome);
installSpendGuard(tempHome);
const installedSettings = JSON.parse(
  fs.readFileSync(path.join(tempHome, '.claude', 'settings.json'), 'utf8'),
);
assert.strictEqual(installedSettings.hooks.SessionStart.length, 1);
assert.strictEqual(installedSettings.hooks.PreToolUse.length, 3);
assert.strictEqual(
  installedSettings.hooks.PreToolUse.filter((entry) =>
    JSON.stringify(entry).includes('thumbgate-spend-guard.js'),
  ).length,
  1,
);
assert.strictEqual(
  installedSettings.hooks.PreToolUse.filter((entry) =>
    JSON.stringify(entry).includes('sibling-audit-hook.js'),
  ).length,
  1,
);
assert(fs.existsSync(path.join(tempHome, '.thumbgate', 'bin', 'thumbgate-spend-guard.js')));

console.log('test-thumbgate-spend-guard: ok');
