#!/usr/bin/env node
/**
 * Best-effort: remove thumbgate_leash_monthly from sale in App Store Connect.
 *
 * Product lock (2026-07-20): Hermes Mobile must not sell subscriptions in-app.
 * ASC API currently rejects PATCH on subscriptions.state (ATTRIBUTE.NOT_ALLOWED)
 * and does not accept availableInNewTerritories on this resource. This script
 * documents product state and exits 0 when the app client already blocks
 * purchase (primary gate). Manual Chrome remove-from-sale remains optional.
 *
 * Usage:
 *   node scripts/deactivate-asc-leash-subscription.js           # inspect + note
 *   node scripts/deactivate-asc-leash-subscription.js --dry-run  # inspect only
 */
const path = require('path');
const { loadEnv, ascGet, ascPatch } = require('./asc-api');

const ROOT = path.join(__dirname, '..');
const PRODUCT_ID = 'thumbgate_leash_monthly';
const DRY = process.argv.includes('--dry-run');

async function main() {
  loadEnv(ROOT);
  const appId = process.env.EXPO_ASC_APP_ID || '6786778037';

  const groups = await ascGet(
    `/v1/apps/${appId}/subscriptionGroups?limit=50&include=subscriptions`,
  );
  const included = groups.included || [];
  const subs = included.filter((item) => item.type === 'subscriptions');
  let sub = subs.find((s) => s.attributes?.productId === PRODUCT_ID);

  if (!sub) {
    for (const g of groups.data || []) {
      const page = await ascGet(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=50`);
      sub = (page.data || []).find((s) => s.attributes?.productId === PRODUCT_ID);
      if (sub) break;
    }
  }

  if (!sub) {
    console.log(JSON.stringify({ ok: true, found: false, productId: PRODUCT_ID }, null, 2));
    return;
  }

  const before = {
    id: sub.id,
    productId: sub.attributes?.productId,
    state: sub.attributes?.state,
    name: sub.attributes?.name,
  };
  console.log('Found subscription', before);

  if (before.state === 'DEVELOPER_REMOVED_FROM_SALE' || before.state === 'REMOVED_FROM_SALE') {
    console.log(JSON.stringify({ ok: true, alreadyRemoved: true, before }, null, 2));
    return;
  }

  if (DRY) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          wouldAttempt: 'DEVELOPER_REMOVED_FROM_SALE',
          before,
          note: 'ASC API often rejects state PATCH; app client is the hard purchase block.',
        },
        null,
        2,
      ),
    );
    return;
  }

  try {
    await ascPatch(`/v1/subscriptions/${sub.id}`, {
      type: 'subscriptions',
      id: sub.id,
      attributes: { state: 'DEVELOPER_REMOVED_FROM_SALE' },
    });
    const refreshed = await ascGet(`/v1/subscriptions/${sub.id}`);
    console.log(
      JSON.stringify(
        {
          ok: true,
          before,
          after: { id: refreshed.data?.id, state: refreshed.data?.attributes?.state },
        },
        null,
        2,
      ),
    );
  } catch (err) {
    // Non-fatal: mobile client already refuses type:'subs' purchase.
    console.log(
      JSON.stringify(
        {
          ok: true,
          ascApiCannotRemoveFromSale: true,
          before,
          error: err.message?.slice?.(0, 400) || String(err),
          chromeUrl: `https://appstoreconnect.apple.com/apps/${appId}/distribution/subscriptions`,
          note:
            'Hard gate is app code (IN_APP_SUBSCRIPTION_PURCHASES_ENABLED=false; no type:subs). ASC orphan APPROVED is acceptable until Chrome remove-from-sale.',
        },
        null,
        2,
      ),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
