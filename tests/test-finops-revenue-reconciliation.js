#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { MAC_YOLO_STRIPE_CATALOG } = require('../tools/mac-yolo-stripe-provisioner');
const { LIVE_OFFERS } = require('../tools/poolside-money-engine');
const { parseTsv, detectCatalogAnomalies, stripeReadiness } = require('../tools/payment-readiness');
const { extractPaymentId, isSyntheticOrOwnerTest, recordClearedPayment } = require('../tools/record-cleared-payment');
const { parseLedger, summarize, computeRollingWindows, buildReceiptPayload } = require('../tools/revenue-goal-audit');

function runTests() {
  // 1. Canonical Stripe catalog has 5 unique Mac YOLO offers with 0 cross-tenant ThumbGate offers
  assert.strictEqual(MAC_YOLO_STRIPE_CATALOG.length, 5, 'Expected 5 canonical Mac YOLO offers');
  assert.strictEqual(LIVE_OFFERS.length, 5, 'poolside-money-engine LIVE_OFFERS must have 5 canonical offers');
  const priceIds = new Set(MAC_YOLO_STRIPE_CATALOG.map((o) => o.stripe_price_id));
  const productIds = new Set(MAC_YOLO_STRIPE_CATALOG.map((o) => o.stripe_product_id));
  const urls = new Set(MAC_YOLO_STRIPE_CATALOG.map((o) => o.payment_link_url));
  assert.strictEqual(priceIds.size, 5, 'All 5 stripe_price_ids must be unique');
  assert.strictEqual(productIds.size, 5, 'All 5 stripe_product_ids must be unique');
  assert.strictEqual(urls.size, 5, 'All 5 payment_link_urls must be unique');

  // 2. Canonical offer map TSV has 0 catalog anomalies and 100% price/link readiness
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finops-test-'));
  try {
    const mapPath = path.join(tmpDir, 'stripe-offer-map-test.tsv');
    const lines = [
      'offer\tstatus\tstripe_product_id\tstripe_price_id\tpayment_link_url\tstripe_amount_usd',
      ...LIVE_OFFERS.map((o) => `${o.offer}\t${o.status}\t${o.stripe_product_id}\t${o.stripe_price_id}\t${o.payment_link_url}\t${o.stripe_amount_usd}`),
    ];
    fs.writeFileSync(mapPath, `${lines.join('\n')}\n`, 'utf8');
    const parsed = parseTsv(mapPath);
    assert.strictEqual(parsed.length, 5);
    const cleanAnomalies = detectCatalogAnomalies(parsed);
    assert.strictEqual(cleanAnomalies.duplicatePriceIds.size, 0, 'Canonical offer map must have 0 duplicate price IDs');
    assert.strictEqual(cleanAnomalies.duplicateProductIds.size, 0, 'Canonical offer map must have 0 duplicate product IDs');
    assert.strictEqual(cleanAnomalies.crossTenantOffers.size, 0, 'Canonical offer map must have 0 cross-tenant offers');
    for (const offer of parsed) {
      const readiness = stripeReadiness(offer, { anomalies: cleanAnomalies, expectedGrossUsd: Number(offer.stripe_amount_usd) });
      assert.strictEqual(readiness.priceReady, true, `${offer.offer} must be priceReady`);
      assert.strictEqual(readiness.linkReady, true, `${offer.offer} must be linkReady`);
    }

    // 3. Corrupted offer map (duplicate price_id + cross-tenant ThumbGate + amount mismatch) is caught by detectCatalogAnomalies & stripeReadiness
    const corruptedMapPath = path.join(tmpDir, 'stripe-offer-map-corrupted.tsv');
    fs.writeFileSync(
      corruptedMapPath,
      [
        'offer\tstatus\tstripe_product_id\tstripe_price_id\tpayment_link_url\tstripe_amount_usd',
        'Agent Reliability Diagnostic\tready\tprod_UFjF1W0WgwB636\tprice_1THDRo2N337dTGDkpKLRYk46\thttps://buy.stripe.com/9B600jaiE7Dg6tPayn3sI2L\t19.00',
        'AI Agent Hardening Sprint\tready\tprod_UFjF1W0WgwB636\tprice_1THDRo2N337dTGDkpKLRYk46\thttps://buy.stripe.com/9B600jaiE7Dg6tPayn3sI2L\t1500.00',
        'ThumbGate Pro\tready\tprod_ThumbGate19\tprice_ThumbGate19\thttps://thumbgate.app/pricing\t19.00',
      ].join('\n') + '\n',
      'utf8'
    );
    const corruptedRows = parseTsv(corruptedMapPath);
    const anomalies = detectCatalogAnomalies(corruptedRows);
    assert.strictEqual(anomalies.duplicatePriceIds.has('price_1THDRo2N337dTGDkpKLRYk46'), true, 'Must detect duplicate_price_id');
    assert.strictEqual(anomalies.duplicateProductIds.has('prod_UFjF1W0WgwB636'), true, 'Must detect duplicate_product_id');
    assert.strictEqual(anomalies.crossTenantOffers.has('ThumbGate Pro'), true, 'Must detect cross_tenant_offer');
    const dupReadiness = stripeReadiness(corruptedRows[0], { anomalies, expectedGrossUsd: 499 });
    assert.strictEqual(dupReadiness.priceReady, false);
    assert.strictEqual(dupReadiness.priceStatus, 'duplicate_price_id');
    const crossReadiness = stripeReadiness(corruptedRows[2], { anomalies, expectedGrossUsd: 19 });
    assert.strictEqual(crossReadiness.priceReady, false);
    assert.strictEqual(crossReadiness.priceStatus, 'cross_tenant_offer');
    const mismatchRow = {
      offer: 'Agent Reliability Diagnostic',
      status: 'ready',
      stripe_product_id: 'prod_MacYoloDiag499',
      stripe_price_id: 'price_MacYoloDiag499',
      payment_link_url: 'https://buy.stripe.com/9B69ATbmI4r4aK5eOD3sI3k',
      stripe_amount_usd: '19.00',
    };
    const mismatchReadiness = stripeReadiness(mismatchRow, { anomalies: cleanAnomalies, expectedGrossUsd: 499 });
    assert.strictEqual(mismatchReadiness.priceReady, false);
    assert.strictEqual(mismatchReadiness.priceStatus, 'amount_mismatch');

    // 4. Payment ID extraction, owner/test filtering, and duplicate rejection
    assert.strictEqual(
      extractPaymentId('Stripe charge ch_3QAbCdEfGhIjKlMn cleared; client handoff proof delivered'),
      'ch_3QAbCdEfGhIjKlMn'
    );
    assert.strictEqual(
      isSyntheticOrOwnerTest({ buyer_label: 'Owner Test', proof_note: 'Stripe charge ch_test_1234567890 owner_test cleared; client delivery proof' }),
      true
    );
    assert.strictEqual(
      isSyntheticOrOwnerTest({ buyer_label: 'Acme Corp', proof_note: 'Stripe charge ch_1234567890 cleared; client delivery proof' }),
      false
    );

    // 5. Ledger parsing, duplicate paymentId skipping, owner/test exclusion, and 7/30/90d rolling window reconciliation
    const ledgerPath = path.join(tmpDir, 'revenue-ledger-2026-11.tsv');
    fs.writeFileSync(
      ledgerPath,
      [
        'date_paid\tbuyer_label\tbuyer_segment\tsource\toffer\tgross_usd\tstripe_fee_usd\trefund_usd\ttax_reserve_pct\tstatus\tproof_note',
        '2026-11-01\tAcme Eng\tdevtools\toutbound\tCorporate-Expense Reliability Kit\t49.00\t1.72\t0.00\t0.30\tcleared\tStripe charge ch_3RRealBuyerOne001 cleared; client delivery proof',
        '2026-11-01\tAcme Eng Dup\tdevtools\toutbound\tCorporate-Expense Reliability Kit\t49.00\t1.72\t0.00\t0.30\tcleared\tStripe charge ch_3RRealBuyerOne001 duplicate webhook; client delivery proof',
        '2026-11-02\tIgor Test\tinternal\tdirect\tAgent Safeguards Playbook\t9.99\t0.59\t0.00\t0.30\tcleared\tStripe charge ch_test_OwnerSmoke99 owner_test cleared; delivery proof',
      ].join('\n') + '\n',
      'utf8'
    );

    const rows = parseLedger(ledgerPath);
    const summary = summarize(rows, new Date('2026-11-01T00:00:00Z'), new Date('2026-11-30T00:00:00Z'));
    assert.strictEqual(summary.countedRows, 1, 'Must count only the 1 unique non-test cleared payment');
    assert.strictEqual(summary.duplicateRowsSkipped, 1, 'Must skip 1 duplicate payment_id row');
    assert.strictEqual(summary.ownerOrTestRowsSkipped, 1, 'Must skip 1 owner/test row');
    assert.strictEqual(Number(summary.gross.toFixed(2)), 49.00);

    const windows = computeRollingWindows(rows, '2026-11-02');
    assert.strictEqual(windows['7d'].grossUsd, 49.00);
    assert.strictEqual(windows['30d'].grossUsd, 49.00);
    const receipt = buildReceiptPayload({
      date: '2026-11-02',
      ledgers: [ledgerPath],
      allRows: rows,
      summary,
      windows,
    });
    assert.strictEqual(receipt.stripe_7d_usd, 49.00);
    assert.strictEqual(receipt.duplicate_rows_skipped, 1);
    assert.strictEqual(receipt.owner_or_test_rows_skipped, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('test-finops-revenue-reconciliation: PASS (all 5 FinOps & revenue reconciliation invariants verified)');
}

runTests();
