#!/usr/bin/env node
'use strict';

/**
 * A paid Mac offer has to name something the free app does not include, and
 * the paid file cannot be the free download. Prices and fee shares on the
 * source pages stay theirs.
 *
 * Sources read 2026-11-12:
 * https://www.raycast.com/blog/changing-how-raycast-ai-is-priced (2026-09-10)
 * https://setapp.com/tech-talks/distribute-app-on-setapp (2026-11-11)
 * https://applecorridor.com/products/setapp/ (updated 2026-11-11)
 *
 *   node tools/paid-extra-check.js offer.json
 */

const fs = require('fs');

function label(value) {
  return String(value || '').trim();
}

function finiteCents(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function centsFromOffer(offer) {
  if (!offer || typeof offer !== 'object') return undefined;
  const direct = finiteCents(offer.priceCents);
  if (direct !== undefined) return direct;
  const amount = finiteCents(offer.amountCents);
  if (amount !== undefined) return amount;
  const usd = finiteCents(offer.stripe_amount_usd);
  if (usd === undefined) return undefined;
  return Math.round(usd * 100);
}

function guardPaidExtra(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    return { ok: false, findings: ['missing-offer'] };
  }
  const findings = [];
  const price = finiteCents(packet.priceCents);
  const paid = label(packet.paidSha256);
  const free = label(packet.freeSha256);
  const extra = label(packet.paidOnlyBehavior);
  const freeName = label(packet.freeProductName);
  if (typeof price === 'number' && price > 0) {
    if (paid && free && paid === free) findings.push('paid-file-is-free-file');
    if (!extra) findings.push('paid-offer-names-no-extra');
    else if (freeName && extra.toLowerCase() === freeName.toLowerCase()) {
      findings.push('paid-name-is-free-name');
    }
  }
  return { ok: findings.length === 0, findings };
}

function guardOfferRow(offer) {
  if (!offer || typeof offer !== 'object' || Array.isArray(offer)) return guardPaidExtra(null);
  return guardPaidExtra({
    priceCents: centsFromOffer(offer),
    paidSha256: offer.paidSha256 || offer.paid_sha256 || '',
    freeSha256: offer.freeSha256 || offer.free_sha256 || '',
    paidOnlyBehavior: offer.paidOnlyBehavior || offer.paid_only_behavior || offer.offer || '',
    freeProductName: offer.freeProductName || offer.free_product_name || '',
  });
}

function readPacket() {
  if (process.argv[2]) return fs.readFileSync(process.argv[2], 'utf8');
  if (process.stdin.isTTY) return '';
  return fs.readFileSync(0, 'utf8');
}

function main() {
  const raw = readPacket();
  let packet = null;
  if (raw.trim()) {
    try {
      packet = JSON.parse(raw);
    } catch (error) {
      packet = null;
    }
  }
  const report = guardPaidExtra(packet);
  if (!report.ok) {
    process.stdout.write(report.findings.join('\n') + '\n');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { guardPaidExtra, guardOfferRow, centsFromOffer };
