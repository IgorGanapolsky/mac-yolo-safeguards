#!/usr/bin/env node
/**
 * Ensure thumbgate_leash_monthly subscription exists in App Store Connect.
 * Creates subscription group + subscription if missing; sets US price tier 19.
 */
const path = require('path');
const { loadEnv, ascGet, ascPost } = require('./asc-api');

const ROOT = path.join(__dirname, '..');
const PRODUCT_ID = 'thumbgate_leash_monthly';
const GROUP_REF = 'Leash Pro';

async function main() {
  loadEnv(ROOT);
  const appId = process.env.EXPO_ASC_APP_ID;

  const groups = await ascGet(`/v1/apps/${appId}/subscriptionGroups?limit=50`);
  let group = (groups.data || []).find((g) => g.attributes?.referenceName === GROUP_REF) || groups.data?.[0];

  if (!group) {
    console.log('Creating subscription group…');
    const created = await ascPost('/v1/subscriptionGroups', {
      type: 'subscriptionGroups',
      attributes: { referenceName: GROUP_REF },
      relationships: { app: { data: { type: 'apps', id: appId } } },
    });
    group = created.data;
    console.log('Created group', group.id);
  } else {
    console.log('Found group', group.id, group.attributes?.referenceName);
  }

  const subs = await ascGet(`/v1/subscriptionGroups/${group.id}/subscriptions?limit=50`);
  let sub = (subs.data || []).find((s) => s.attributes?.productId === PRODUCT_ID);

  if (!sub) {
    console.log('Creating subscription', PRODUCT_ID, '…');
    const created = await ascPost('/v1/subscriptions', {
      type: 'subscriptions',
      attributes: {
        name: 'Leash Pro',
        productId: PRODUCT_ID,
        subscriptionPeriod: 'ONE_MONTH',
        reviewNote: 'Unlocks standing gate rule management and priority ThumbGate memory.',
      },
      relationships: {
        group: { data: { type: 'subscriptionGroups', id: group.id } },
      },
    });
    sub = created.data;
    console.log('Created subscription', sub.id);
  } else {
    console.log('Subscription exists', sub.id, sub.attributes?.productId, sub.attributes?.state);
  }

  const locs = await ascGet(`/v1/subscriptions/${sub.id}/subscriptionLocalizations?limit=10`);
  if (!(locs.data || []).some((l) => l.attributes?.locale === 'en-US')) {
    console.log('Adding en-US localization…');
    await ascPost('/v1/subscriptionLocalizations', {
      type: 'subscriptionLocalizations',
      attributes: {
        locale: 'en-US',
        name: 'Leash Pro',
        description: 'Standing gate rules + priority ThumbGate memory.',
      },
      relationships: { subscription: { data: { type: 'subscriptions', id: sub.id } } },
    });
  }

  const prices = await ascGet(`/v1/subscriptions/${sub.id}/prices?limit=5`);
  if (!(prices.data || []).length) {
    const points = await ascGet(
      `/v1/subscriptions/${sub.id}/pricePoints?filter[territory]=USA&limit=200`,
    );
    const targetCents = 1999;
    let best = null;
    for (const p of points.data || []) {
      const cents = Math.round(parseFloat(p.attributes?.customerPrice || '0') * 100);
      if (!best || Math.abs(cents - targetCents) < Math.abs(best.cents - targetCents)) {
        best = { id: p.id, cents };
      }
    }
    if (!best) throw new Error('No USA price points returned for subscription');
    console.log('Setting USA price', best.cents / 100, 'USD (point', best.id, ')…');
    await ascPost('/v1/subscriptionPrices', {
      type: 'subscriptionPrices',
      relationships: {
        subscription: { data: { type: 'subscriptions', id: sub.id } },
        subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: best.id } },
      },
    });
  }

  console.log(JSON.stringify({ ok: true, groupId: group.id, subscriptionId: sub.id, productId: PRODUCT_ID }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  process.exit(1);
});
