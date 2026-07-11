#!/usr/bin/env node
/**
 * Ensure thumbgate_leash_monthly subscription exists in App Store Connect.
 * Creates subscription group + subscription if missing; sets US price tier 19;
 * en-US group localization + subscription review screenshot for MISSING_METADATA.
 */
const fs = require('fs');
const path = require('path');
const { loadEnv, ascGet, ascPost, ascUploadBinaryAsset } = require('./asc-api');

const ROOT = path.join(__dirname, '..');
const PRODUCT_ID = 'thumbgate_leash_monthly';
const GROUP_REF = 'Leash Pro';
const GROUP_DISPLAY_NAME = 'Leash Pro';

const DEFAULT_REVIEW_SCREENSHOT_CANDIDATES = [
  'fastlane/screenshots/en-US/05_thumbgate_67.png',
  'fastlane/screenshots/en-US/03_standing_67.png',
  'fastlane/screenshots/en-US/01_approve_67.png',
  'docs/store-assets/subscription-review-screenshot.png',
];

function resolveReviewScreenshotPath() {
  const fromEnv = process.env.ASC_SUBSCRIPTION_REVIEW_SCREENSHOT?.trim();
  if (fromEnv) {
    const abs = path.isAbsolute(fromEnv) ? fromEnv : path.join(ROOT, fromEnv);
    if (!fs.existsSync(abs)) throw new Error(`ASC_SUBSCRIPTION_REVIEW_SCREENSHOT not found: ${abs}`);
    return abs;
  }
  for (const rel of DEFAULT_REVIEW_SCREENSHOT_CANDIDATES) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

async function ensureGroupLocalization(groupId) {
  const locs = await ascGet(`/v1/subscriptionGroups/${groupId}/subscriptionGroupLocalizations?limit=10`);
  if ((locs.data || []).some((l) => l.attributes?.locale === 'en-US')) {
    console.log('Group en-US localization exists');
    return;
  }
  console.log('Adding subscription group en-US localization…');
  await ascPost('/v1/subscriptionGroupLocalizations', {
    type: 'subscriptionGroupLocalizations',
    attributes: {
      locale: 'en-US',
      name: GROUP_DISPLAY_NAME,
    },
    relationships: {
      subscriptionGroup: { data: { type: 'subscriptionGroups', id: groupId } },
    },
  });
}

async function ensureReviewScreenshot(subscriptionId) {
  const existing = await ascGet(`/v1/subscriptions/${subscriptionId}/appStoreReviewScreenshot`);
  if (existing.data?.id) {
    console.log('Subscription review screenshot exists', existing.data.id);
    return { skipped: true, screenshotId: existing.data.id };
  }

  const screenshotPath = resolveReviewScreenshotPath();
  if (!screenshotPath) {
    console.warn('No local subscription review screenshot found; set ASC_SUBSCRIPTION_REVIEW_SCREENSHOT');
    return { skipped: true, missingAsset: true };
  }

  console.log('Uploading subscription review screenshot from', path.relative(ROOT, screenshotPath));
  const screenshotId = await ascUploadBinaryAsset(screenshotPath, {
    reservePath: '/v1/subscriptionAppStoreReviewScreenshots',
    reserveData: {
      type: 'subscriptionAppStoreReviewScreenshots',
      attributes: {},
      relationships: {
        subscription: { data: { type: 'subscriptions', id: subscriptionId } },
      },
    },
    assetType: 'subscriptionAppStoreReviewScreenshots',
  });
  console.log('Uploaded subscription review screenshot', screenshotId);
  return { uploaded: true, screenshotId };
}

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

  await ensureGroupLocalization(group.id);

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

  const screenshot = await ensureReviewScreenshot(sub.id);

  const refreshed = await ascGet(`/v1/subscriptions/${sub.id}`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        groupId: group.id,
        subscriptionId: sub.id,
        productId: PRODUCT_ID,
        state: refreshed.data?.attributes?.state,
        reviewScreenshot: screenshot,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err.message);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  process.exit(1);
});
