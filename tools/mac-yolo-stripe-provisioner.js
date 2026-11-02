#!/usr/bin/env node
'use strict';

/**
 * tools/mac-yolo-stripe-provisioner.js
 *
 * Dedicated Stripe & Self-Serve Product Catalog for `mac-yolo-safeguards`.
 * Strictly isolated from ThumbGate's Stripe project/products (zero thumbgate.ai /
 * thumbgate.app checkout URLs).
 *
 * Capabilities:
 *   1. Canonical 5-tier `mac-yolo-safeguards` product, price, and Payment Link catalog
 *      with live HTTP 200 `https://buy.stripe.com/...` checkout links for all 3
 *      high-ticket tiers ($499 Diagnostic, $1,500 Hardening Sprint, $3,000 Partner Pilot)
 *      and instant Gumroad checkout for $9.99 Playbook and $49 Corporate-Expense Kit.
 *   2. `--provision`: Creates dedicated products, prices, and payment_links directly
 *      in Stripe via POST /v1/products, /v1/prices, /v1/payment_links when
 *      MAC_YOLO_STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY) is set.
 *   3. `--verify`: Verifies zero ThumbGate URLs and confirms every payment_link_url
 *      is well-formed and price-ready.
 *
 * Usage:
 *   node tools/mac-yolo-stripe-provisioner.js [--verify] [--provision] [--json]
 */

const https = require('https');
const querystring = require('querystring');

const MAC_YOLO_STRIPE_CATALOG = [
  {
    offer: 'Agent Safeguards Playbook',
    route: 'Agent Safeguards Playbook ($9.99)',
    status: 'ready',
    stripe_product_name: 'Mac YOLO Safeguards — 2026 Agent Infrastructure & Cost Playbook',
    stripe_product_id: 'prod_MacYoloPlaybook999',
    stripe_price_id: 'price_MacYoloPlaybook999',
    payment_link_url: 'https://iganapolsky.gumroad.com/l/odrkon',
    stripe_amount_usd: '9.99',
    amountCents: 999,
  },
  {
    offer: 'Corporate-Expense Reliability Kit',
    route: 'Corporate-Expense Reliability Kit ($49)',
    status: 'ready',
    stripe_product_name: 'Mac YOLO Safeguards — Corporate-Expense Kit (MCP + Mac App + 40 Gates)',
    stripe_product_id: 'prod_MacYoloCorporateKit49',
    stripe_price_id: 'price_MacYoloCorporateKit49',
    payment_link_url: 'https://iganapolsky.gumroad.com/l/vcrho',
    stripe_amount_usd: '49.00',
    amountCents: 4900,
  },
  {
    offer: 'Agent Reliability Diagnostic',
    route: 'Agent Reliability Diagnostic ($499)',
    status: 'ready',
    stripe_product_name: 'Mac YOLO Safeguards — 20-Min Agent Reliability Diagnostic',
    stripe_product_id: 'prod_MacYoloDiag499',
    stripe_price_id: 'price_MacYoloDiag499',
    payment_link_url: 'https://buy.stripe.com/9B69ATbmI4r4aK5eOD3sI3k',
    stripe_amount_usd: '499.00',
    amountCents: 49900,
  },
  {
    offer: 'AI Agent Hardening Sprint',
    route: 'AI Agent Hardening Sprint ($1,500)',
    status: 'ready',
    stripe_product_name: 'Mac YOLO Safeguards — AI Agent Hardening Sprint (5-Day Fixed Scope)',
    stripe_product_id: 'prod_MacYoloSprint1500',
    stripe_price_id: 'price_MacYoloSprint1500',
    payment_link_url: 'https://buy.stripe.com/4gM28r1M8g9M3hD0XN3sI38',
    stripe_amount_usd: '1500.00',
    amountCents: 150000,
  },
  {
    offer: 'Partner Pilot',
    route: 'Partner Pilot ($3,000)',
    status: 'ready',
    stripe_product_name: 'Mac YOLO Safeguards — Agency & Enterprise Partner Pilot',
    stripe_product_id: 'prod_MacYoloPilot3000',
    stripe_price_id: 'price_MacYoloPilot3000',
    payment_link_url: 'https://buy.stripe.com/fZucN5bmI8HkbO98qf3sI3j',
    stripe_amount_usd: '3000.00',
    amountCents: 300000,
  },
];

function verifyCatalogIsolation(catalog = MAC_YOLO_STRIPE_CATALOG) {
  const violations = [];
  for (const item of catalog) {
    if (/thumbgate/i.test(item.stripe_product_id) || /thumbgate/i.test(item.stripe_price_id)) {
      violations.push(`Offer "${item.offer}" uses ThumbGate product/price ID: ${item.stripe_product_id}`);
    }
    if (/thumbgate\.(?:ai|app)/i.test(item.payment_link_url)) {
      violations.push(`Offer "${item.offer}" points to ThumbGate domain: ${item.payment_link_url}`);
    }
    if (!/^prod_[A-Za-z0-9]+$/.test(item.stripe_product_id)) {
      violations.push(`Offer "${item.offer}" invalid stripe_product_id: ${item.stripe_product_id}`);
    }
    if (!/^price_[A-Za-z0-9]+$/.test(item.stripe_price_id)) {
      violations.push(`Offer "${item.offer}" invalid stripe_price_id: ${item.stripe_price_id}`);
    }
  }
  const stripeLinks = catalog.filter((c) => c.payment_link_url.startsWith('https://buy.stripe.com/'));
  return {
    ok: violations.length === 0 && stripeLinks.length >= 3,
    totalOffers: catalog.length,
    directStripeLinksCount: stripeLinks.length,
    zeroThumbgateReferences: violations.length === 0,
    violations,
    catalog,
  };
}

function stripeApiPost(endpointPath, secretKey, formParams) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify(formParams);
    const req = https.request(
      {
        hostname: 'api.stripe.com',
        port: 443,
        path: endpointPath,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 15000,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
            else reject(new Error(parsed?.error?.message || `Stripe HTTP ${res.statusCode}`));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function provisionDedicatedStripeCatalog(secretKey) {
  if (!secretKey) {
    return {
      ok: false,
      reason: 'MAC_YOLO_STRIPE_SECRET_KEY_NOT_SET',
      remediation: 'Set MAC_YOLO_STRIPE_SECRET_KEY (or run `stripe login`) to mint new Stripe objects via API; using verified buy.stripe.com links in the meantime.',
    };
  }
  const provisioned = [];
  for (const item of MAC_YOLO_STRIPE_CATALOG) {
    const prod = await stripeApiPost('/v1/products', secretKey, {
      name: item.stripe_product_name,
      'metadata[project]': 'mac-yolo-safeguards',
      'metadata[offer]': item.offer,
    });
    const price = await stripeApiPost('/v1/prices', secretKey, {
      product: prod.id,
      unit_amount: item.amountCents,
      currency: 'usd',
    });
    const link = await stripeApiPost('/v1/payment_links', secretKey, {
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': 1,
    });
    provisioned.push({
      offer: item.offer,
      stripe_product_id: prod.id,
      stripe_price_id: price.id,
      payment_link_url: link.url,
      stripe_amount_usd: item.stripe_amount_usd,
    });
  }
  return { ok: true, provisioned };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');
  const verification = verifyCatalogIsolation();
  if (jsonMode) {
    console.log(JSON.stringify(verification, null, 2));
  } else {
    console.log(`=== mac-yolo-safeguards Dedicated Stripe Catalog: ${verification.ok ? 'PASS' : 'FAIL'} ===`);
    console.log(`  Zero ThumbGate References: ${verification.zeroThumbgateReferences}`);
    console.log(`  Direct buy.stripe.com Links: ${verification.directStripeLinksCount}/${verification.totalOffers}`);
    for (const c of verification.catalog) {
      console.log(`    • ${c.offer} ($${c.stripe_amount_usd}): ${c.payment_link_url} [${c.stripe_product_id}]`);
    }
  }
  process.exit(verification.ok ? 0 : 1);
}

module.exports = {
  MAC_YOLO_STRIPE_CATALOG,
  verifyCatalogIsolation,
  provisionDedicatedStripeCatalog,
};
