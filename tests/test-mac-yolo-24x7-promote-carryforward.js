#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  seedOpsFiles,
  findLatestPriorTsv,
  CURATED_PROSPECTS,
} = require('../tools/mac-yolo-24x7-promote');
const {
  MAC_YOLO_STRIPE_CATALOG,
  verifyCatalogIsolation,
} = require('../tools/mac-yolo-stripe-provisioner');

function main() {
  // 1. Verify catalog uses real Stripe IDs and passes isolation
  const iso = verifyCatalogIsolation(MAC_YOLO_STRIPE_CATALOG);
  assert.strictEqual(iso.ok, true, `Catalog isolation failed: ${iso.violations.join('; ')}`);
  assert.strictEqual(MAC_YOLO_STRIPE_CATALOG.length, 5);
  const diag = MAC_YOLO_STRIPE_CATALOG.find((o) => o.offer === 'Agent Reliability Diagnostic');
  const sprint = MAC_YOLO_STRIPE_CATALOG.find((o) => o.offer === 'AI Agent Hardening Sprint');
  const pilot = MAC_YOLO_STRIPE_CATALOG.find((o) => o.offer === 'Partner Pilot');
  assert.strictEqual(diag.stripe_product_id, 'prod_VXQknQJDB6Vcjk');
  assert.strictEqual(diag.stripe_price_id, 'price_1UWLtAGGBpd520QYY4YLw7qG');
  assert.strictEqual(sprint.stripe_product_id, 'prod_Uor7uKfiDqiKbZ');
  assert.strictEqual(sprint.stripe_price_id, 'price_1TpDO4GGBpd520QY5xJsc1xI');
  assert.strictEqual(pilot.stripe_product_id, 'prod_UqI6dgjzkH2x1Y');
  assert.strictEqual(pilot.stripe_price_id, 'price_1UX2fNGGBpd520QYOES3xcnE');

  // 2. Verify day-rollover carryforward in an isolated temp directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-yolo-promote-cf-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, 'stripe-offer-map-2026-11-06.tsv'),
      [
        'offer\tstatus\tstripe_product_id\tstripe_price_id\tpayment_link_url\tstripe_amount_usd',
        'Mac YOLO Safeguards Pro\tready\tprod_VYvoKL9jDkHsXT\tprice_1UXnxBGGBpd520QYjQeJ11pl\thttps://buy.stripe.com/cNi6oH1M81eSg4pdKz3sJ10\t19.00',
      ].join('\n') + '\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'prospects-2026-11-06.tsv'),
      [
        'prospect_label\tsegment\tsource\tagent_stack\trepeated_failure\tbusiness_cost\tbudget_owner\tworkflow_context\tneeds_repeatability\tnotes',
        'bluefully\tai-agency\tgithub-inbound\tyes\tyes\tyes\tyes\tyes\tyes\tBrandon Veiseh <brandon@mindfort.ai> (MindFort AI)',
        'StephK\tai-agency\tinbound-partner\tyes\tyes\tyes\tyes\tyes\tyes\tDeidre Graham <deidre@meaningfulgigs.com> (Meaningful Gigs)',
      ].join('\n') + '\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'pipeline-status-2026-11-06.tsv'),
      [
        'prospect_label\tstage\troute\tgross_potential_usd\tlast_touch\tnext_action\tnotes',
        'bluefully\tsent\tPartner Pilot ($3,000)\t3000.00\t2026-11-03\twait_for_reply\tBrandon Veiseh <brandon@mindfort.ai> (MindFort AI)',
        'StephK\tsent\tPartner Pilot ($3,000)\t3000.00\t2026-11-03\twait_for_reply\tDeidre Graham <deidre@meaningfulgigs.com> (Meaningful Gigs)',
      ].join('\n') + '\n',
    );

    assert.strictEqual(
      findLatestPriorTsv(tmpDir, 'pipeline-status', '2026-11-11'),
      path.join(tmpDir, 'pipeline-status-2026-11-06.tsv'),
    );

    const seeded = seedOpsFiles('2026-11-11', tmpDir);
    const pipelineLines = fs
      .readFileSync(seeded.pipelinePath, 'utf8')
      .trim()
      .split(/\r?\n/);
    assert.strictEqual(
      pipelineLines.length,
      1 + 2 + CURATED_PROSPECTS.length,
      'Expected header + 2 carried-forward sent rows + 6 curated rows',
    );
    assert.ok(
      pipelineLines[1].startsWith('bluefully\tsent\tPartner Pilot ($3,000)\t3000.00\t2026-11-03\twait_for_reply\t'),
      'Expected bluefully sent stage and 2026-11-03 last_touch to be preserved across day rollover',
    );
    assert.ok(
      pipelineLines[2].startsWith('StephK\tsent\tPartner Pilot ($3,000)\t3000.00\t2026-11-03\twait_for_reply\t'),
      'Expected StephK sent stage and 2026-11-03 last_touch to be preserved across day rollover',
    );

    const stripeLines = fs
      .readFileSync(seeded.stripeMapPath, 'utf8')
      .trim()
      .split(/\r?\n/);
    assert.strictEqual(
      stripeLines.length,
      1 + 1 + MAC_YOLO_STRIPE_CATALOG.length,
      'Expected header + carried-forward Pro offer + 5 catalog offers',
    );

    // 3. Verify payment-readiness.js recognizes all carried-forward + curated rows as link-ready
    const outMd = path.join(tmpDir, 'payment-readiness-2026-11-11.md');
    const readinessRun = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, '../tools/payment-readiness.js'),
        '--date',
        '2026-11-11',
        '--stripe-offer-map',
        seeded.stripeMapPath,
        '--pipeline',
        seeded.pipelinePath,
        '--out',
        outMd,
      ],
      { encoding: 'utf8', timeout: 10000 },
    );
    assert.strictEqual(readinessRun.status, 0, readinessRun.stderr);
    assert.ok(
      readinessRun.stdout.includes('Missing/invalid-price open gross: $0.00'),
      readinessRun.stdout,
    );
    assert.ok(
      readinessRun.stdout.includes('Payment-link-ready open gross: $15998.00'),
      readinessRun.stdout,
    );

    // 4. Verify in-place healing if today's file was previously written with only curated rows
    fs.writeFileSync(
      seeded.pipelinePath,
      [
        'prospect_label\tstage\troute\tgross_potential_usd\tlast_touch\tnext_action\tnotes',
        ...CURATED_PROSPECTS.map((p) =>
          [p.label, 'ready', p.route, p.gross, '2026-11-11', 'send_governed_intro_or_partner_offer', p.notes].join('\t'),
        ),
      ].join('\n') + '\n',
    );
    seedOpsFiles('2026-11-11', tmpDir);
    const healedLines = fs.readFileSync(seeded.pipelinePath, 'utf8').trim().split(/\r?\n/);
    assert.strictEqual(healedLines.length, 1 + 2 + CURATED_PROSPECTS.length);
    assert.ok(healedLines[1].startsWith('bluefully\tsent\t'));
    assert.ok(healedLines[2].startsWith('StephK\tsent\t'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('test-mac-yolo-24x7-promote-carryforward: PASS');
}

main();
