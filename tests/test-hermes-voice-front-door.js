#!/usr/bin/env node
'use strict';

/**
 * tests/test-hermes-voice-front-door.js
 * Run: node tests/test-hermes-voice-front-door.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  scoreSignals,
  routeOffer,
  decideTransfer,
  gateTool,
  mapHubspotToPipeline,
  mapPipelineToHubspot,
  buildDemoAgentPack,
  buildPipelineUpdateFromVoice,
  applyPipelineFromVoice,
  suggestStageFromDecision,
  normalizeSignals,
  buildAgentSystemPrompt,
  run,
  OFFERS,
} = require('../tools/hermes-voice-front-door');

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`  ok - ${label}`);
}

check('score matches Sales Close Kit weights (max 10)', () => {
  const allYes = normalizeSignals({
    agent_stack: 'yes',
    repeated_failure: 'yes',
    business_cost: 'yes',
    budget_owner: 'yes',
    workflow_context: 'yes',
    needs_repeatability: 'yes',
  });
  const scored = scoreSignals(allYes);
  assert.strictEqual(scored.score, 10);
  assert.strictEqual(routeOffer(10).id, OFFERS.pilot.id);
  assert.strictEqual(routeOffer(6).id, OFFERS.sprint.id);
  assert.strictEqual(routeOffer(4).id, OFFERS.diagnostic.id);
  assert.strictEqual(routeOffer(2).id, OFFERS.free.id);
});

check('qualify holds until discovery is complete', () => {
  const d = decideTransfer({
    current_agent: 'qualify',
    agent_stack: 'yes',
    repeated_failure: 'no',
    business_cost: 'no',
    budget_owner: 'yes',
  });
  assert.strictEqual(d.next_agent, 'qualify');
  assert.strictEqual(d.transfer, false);
  assert.strictEqual(d.quote_allowed, false);
});

check('qualify transfers to close on paid route after discovery', () => {
  const d = decideTransfer({
    current_agent: 'qualify',
    agent_stack: 'yes',
    repeated_failure: 'yes',
    business_cost: 'yes',
    budget_owner: 'yes',
    workflow_context: 'yes',
  });
  assert.strictEqual(d.score, 9); // 2+2+2+2+1 = 9 without needs_repeatability
  // score 9 is partner pilot → human, not close
  assert.strictEqual(d.next_agent, 'human');
  assert.strictEqual(d.transfer, true);
  assert.ok(d.human_triggers.includes('score_partner_pilot'));
});

check('score 6–8 goes qualify → close with sprint offer', () => {
  const d = decideTransfer({
    current_agent: 'qualify',
    agent_stack: 'yes',
    repeated_failure: 'yes',
    business_cost: 'yes',
    budget_owner: 'no',
    workflow_context: 'no',
    needs_repeatability: 'no',
    segment: 'founder',
  });
  // 2+2+2 = 6
  assert.strictEqual(d.score, 6);
  assert.strictEqual(d.next_agent, 'close');
  assert.strictEqual(d.transfer, true);
  assert.strictEqual(d.offer.id, OFFERS.sprint.id);
  assert.strictEqual(d.quote_allowed, true);
});

check('close cannot send payment links; human needs approval flag', () => {
  const closeGate = gateTool('close', 'send_payment_link', {
    current_agent: 'close',
    agent_stack: 'yes',
    repeated_failure: 'yes',
    business_cost: 'yes',
    budget_owner: 'yes',
    pipeline_stage: 'proposed',
    human_approved_payment: 'yes',
  });
  assert.strictEqual(closeGate.allowed, false);

  const humanDenied = gateTool('human', 'send_payment_link', {
    current_agent: 'human',
    pipeline_stage: 'proposed',
    human_approved_payment: 'no',
  });
  assert.strictEqual(humanDenied.allowed, false);

  const humanOk = gateTool('human', 'send_payment_link', {
    current_agent: 'human',
    pipeline_stage: 'proposed',
    human_approved_payment: 'yes',
  });
  assert.strictEqual(humanOk.allowed, true);
});

check('qualify cannot quote_offer', () => {
  const g = gateTool('qualify', 'quote_offer', {
    current_agent: 'qualify',
    agent_stack: 'yes',
    repeated_failure: 'yes',
    business_cost: 'yes',
    budget_owner: 'yes',
  });
  assert.strictEqual(g.allowed, false);
  assert.match(g.reason, /only_close|explicitly_denied/);
});

check('compliance utterance forces human transfer', () => {
  const d = decideTransfer({
    current_agent: 'close',
    agent_stack: 'yes',
    repeated_failure: 'yes',
    business_cost: 'yes',
    budget_owner: 'yes',
    utterance: 'We need SOC 2 compliance artifacts before any pilot.',
  });
  assert.strictEqual(d.next_agent, 'human');
  assert.ok(d.human_triggers.includes('compliance'));
});

check('HubSpot proposal sent maps to pipeline proposed', () => {
  const m = mapHubspotToPipeline('proposal sent');
  assert.strictEqual(m.ok, true);
  assert.strictEqual(m.pipeline_stage, 'proposed');
  assert.strictEqual(m.pipeline_next_action, 'send_stripe_invoice_human_only');
});

check('pipeline paid maps to HubSpot closed won', () => {
  const m = mapPipelineToHubspot('paid');
  assert.strictEqual(m.hubspot_stage, 'closed won');
});

check('unmapped HubSpot stage fails closed', () => {
  const m = mapHubspotToPipeline('totally-made-up-stage');
  assert.strictEqual(m.ok, false);
  assert.ok(m.error);
});

check('pipeline-from-voice advances score-6 call to booked for pipeline-update', () => {
  const out = buildPipelineUpdateFromVoice(
    {
      prospect_label: 'acme-agency',
      current_agent: 'qualify',
      agent_stack: 'yes',
      repeated_failure: 'yes',
      business_cost: 'yes',
      budget_owner: 'no',
      segment: 'founder',
      pipeline_stage: 'replied',
    },
    null,
  );
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.pipeline_update.prospect, 'acme-agency');
  // close route + score 6 → suggest booked (not paid)
  assert.strictEqual(out.pipeline_update.stage, 'booked');
  assert.ok(out.pipeline_update.route.includes('$1,500') || out.pipeline_update.gross_potential_usd === 1500);
  assert.strictEqual(out.hubspot.properties.hermes_score, 6);
});

check('suggestStageFromDecision never returns paid', () => {
  const d = decideTransfer({
    current_agent: 'close',
    agent_stack: 'yes',
    repeated_failure: 'yes',
    business_cost: 'yes',
    budget_owner: 'yes',
    workflow_context: 'yes',
    needs_repeatability: 'yes',
    pipeline_stage: 'proposed',
  });
  assert.notStrictEqual(suggestStageFromDecision(d), 'paid');
});

check('apply-pipeline dry-run does not write TSV', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfd-pipe-'));
  const pipe = path.join(dir, 'pipeline.tsv');
  fs.writeFileSync(
    pipe,
    [
      'prospect_label\tstage\troute\tgross_potential_usd\tlast_touch\tnext_action\tnotes',
      'acme-agency\treplied\tTBD\t0\t2026-07-13\tbook_triage_call\tseed',
    ].join('\n') + '\n',
  );
  const before = fs.readFileSync(pipe, 'utf8');
  const out = applyPipelineFromVoice({
    rawSignals: {
      prospect_label: 'acme-agency',
      current_agent: 'qualify',
      agent_stack: 'yes',
      repeated_failure: 'yes',
      business_cost: 'yes',
      budget_owner: 'no',
      segment: 'founder',
      pipeline_stage: 'replied',
    },
    pipelinePath: pipe,
    date: '2026-07-14',
    apply: false,
  });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.dry_run, true);
  assert.strictEqual(out.applied, false);
  assert.match(out.command, /pipeline-update\.js/);
  assert.strictEqual(fs.readFileSync(pipe, 'utf8'), before);
  fs.rmSync(dir, { recursive: true, force: true });
});

check('apply-pipeline --apply writes booked stage via pipeline-update.js', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfd-pipe-a-'));
  const pipe = path.join(dir, 'pipeline.tsv');
  fs.writeFileSync(
    pipe,
    [
      'prospect_label\tstage\troute\tgross_potential_usd\tlast_touch\tnext_action\tnotes',
      'acme-agency\treplied\tTBD\t0\t2026-07-13\tbook_triage_call\tseed',
    ].join('\n') + '\n',
  );
  const out = applyPipelineFromVoice({
    rawSignals: {
      prospect_label: 'acme-agency',
      current_agent: 'qualify',
      agent_stack: 'yes',
      repeated_failure: 'yes',
      business_cost: 'yes',
      budget_owner: 'no',
      segment: 'founder',
      pipeline_stage: 'replied',
    },
    pipelinePath: pipe,
    date: '2026-07-14',
    apply: true,
  });
  assert.strictEqual(out.ok, true, out.error || out.stderr);
  assert.strictEqual(out.applied, true);
  const body = fs.readFileSync(pipe, 'utf8');
  assert.match(body, /acme-agency\tbooked\t/);
  assert.match(body, /2026-07-14/);
  fs.rmSync(dir, { recursive: true, force: true });
});

check('demo pack has three agents, ladder, and no secrets', () => {
  const pack = buildDemoAgentPack();
  assert.strictEqual(pack.agents.length, 3);
  assert.strictEqual(pack.money_ladder.length, 4);
  const blob = JSON.stringify(pack);
  assert.doesNotMatch(blob, /sk-|api[_-]?key|ghp_|xoxb-/i);
  assert.ok(buildAgentSystemPrompt('close').includes('$1,500'));
});

check('CLI transfer --json exits 0', () => {
  const out = run([
    '--event',
    'transfer',
    '--json',
    '--signals-json',
    JSON.stringify({
      current_agent: 'qualify',
      agent_stack: 'yes',
      repeated_failure: 'yes',
      business_cost: 'yes',
      budget_owner: 'no',
      segment: 'founder',
    }),
  ]);
  assert.strictEqual(out.exitCode, 0);
  const parsed = JSON.parse(out.stdout);
  assert.strictEqual(parsed.next_agent, 'close');
});

check('CLI demo-pack --json is paste-ready', () => {
  const out = run(['--event', 'demo-pack', '--json']);
  assert.strictEqual(out.exitCode, 0);
  const parsed = JSON.parse(out.stdout);
  assert.strictEqual(parsed.ok, true);
  assert.ok(parsed.agents[0].system_prompt.length > 100);
});

check('receipt write is private and utterance-free', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-fd-'));
  const realHome = os.homedir;
  os.homedir = () => tmpHome;
  try {
    const d = decideTransfer({
      current_agent: 'qualify',
      agent_stack: 'yes',
      repeated_failure: 'yes',
      business_cost: 'yes',
      budget_owner: 'no',
      segment: 'founder',
      utterance: 'SECRET_PHONE_NUMBER_555',
    });
    d.event = 'receipt';
    d._utterance_len = 'SECRET_PHONE_NUMBER_555'.length;
    const { writeReceipt } = require('../tools/hermes-voice-front-door');
    const p = writeReceipt(d);
    const body = fs.readFileSync(p, 'utf8');
    assert.doesNotMatch(body, /SECRET_PHONE_NUMBER/);
    assert.match(body, /utterance_len/);
    const mode = fs.statSync(p).mode & 0o777;
    // On some FS, mode may be umask-influenced; require not world-writable.
    assert.strictEqual(mode & 0o002, 0);
  } finally {
    os.homedir = realHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

console.log(`\nPASS ${passed}/${passed} hermes-voice-front-door tests`);
