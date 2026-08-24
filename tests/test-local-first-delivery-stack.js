#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { classify, catalog, COUNSEL_CLEARANCE } = require('../tools/local-first-delivery-stack');

const TOOL = path.join(__dirname, '..', 'tools', 'local-first-delivery-stack.js');

console.log('=== test-local-first-delivery-stack ===');

assert.equal(COUNSEL_CLEARANCE, false);
assert.equal(classify({ intent: 'implement the login form' }).codingDefault, 'glm-coding');
assert.equal(classify({ intent: 'implement the login form' }).rail, 'hermes_yolo_hybrid');
assert.equal(classify({ intent: 'implement the login form' }).inventedUsd, null);

const typo = classify({ intent: 'fix typo in README' });
assert.equal(typo.lane, 'local_leaf');
assert.equal(typo.codingDefault, 'glm-coding');

const ahls = classify({ intent: 'lead intake and CRM follow-up for HVAC missed calls' });
assert.equal(ahls.rail, 'agency_ahls');
assert.equal(ahls.priceUsd, 149);
assert.equal(ahls.sellable, true);
assert.equal(ahls.verticalTemplate, 'after_hours_leak_score');

const vps = classify({ intent: 'managed private agent on a fenced VPS' });
assert.equal(vps.rail, 'hosted_vps');
assert.equal(vps.priceUsd, 10);

const gpu = classify({ intent: 'buy H100 GPUs for local AI' });
assert.equal(gpu.ok, false);
assert.equal(gpu.deny, 'gpu_speculative');

const threek = classify({ intent: 'save $3000 per month cancel Claude savings' });
assert.equal(threek.ok, false);
assert.equal(threek.deny, 'invented_3000');
assert.equal(threek.inventedUsd, null);
assert.equal(threek.episodeAnecdoteIsOurs, false);

const replace = classify({ intent: 'replace every hosted model with local LLMs' });
assert.equal(replace.deny, 'replace_all_hosted');

const paid = classify({ intent: 'sell ThumbGate $499 Partner Pilot' });
assert.equal(paid.deny, 'eci_paid_pilot');

const consult = classify({ intent: 'generic local LLM consulting retainer' });
assert.equal(consult.deny, 'generic_consulting');

const audit = classify({ intent: 'cost audit and model routing spend reduction' });
assert.equal(audit.rail, 'cost_autonomy_cli');
assert.equal(audit.sellable, false);
assert.equal(audit.inventedUsd, null);

const namedAudit = classify({ intent: 'AI Cost & Autonomy Audit' });
assert.equal(namedAudit.rail, 'cost_autonomy_cli');
assert.equal(namedAudit.sellable, false);

const sellAudit = classify({ intent: 'sell AI Cost & Autonomy Audit outreach' });
assert.equal(sellAudit.deny, 'eci_paid_pilot');

const funnel = classify({ intent: 'content-to-lead funnel cancel claude video' });
assert.equal(funnel.deny, 'eci_funnel');

const cat = catalog();
assert.equal(cat.counselClearance, false);
assert.ok(cat.denials.includes('invented_3000'));
assert.ok(cat.denials.includes('eci_funnel'));

const BIN = path.join(__dirname, '..', 'bin', 'local-first-delivery');

function run(file, args) {
  return spawnSync(process.execPath, [file, ...args], { encoding: 'utf8' });
}
const denied = run(TOOL, ['--intent', 'buy H100 GPUs', '--json']);
assert.equal(denied.status, 2);
assert.equal(JSON.parse(denied.stdout).deny, 'gpu_speculative');

const ok = run(TOOL, ['--intent', 'hosted Hermes on thumbgate.app', '--json']);
assert.equal(ok.status, 0);
assert.equal(JSON.parse(ok.stdout).priceUsd, 10);

const binDenied = run(BIN, ['--intent', 'buy H100 GPUs', '--json']);
assert.equal(binDenied.status, 2);

console.log('PASS');
