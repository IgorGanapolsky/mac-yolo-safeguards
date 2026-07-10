#!/usr/bin/env node
/** Query ASC listing + IAP status for Hermes Mobile 1.0 */
const path = require('path');
const { loadEnv, ascGet } = require('./asc-api');
const { findReviewNotesViolations } = require('./asc-review-notes-guard');

const ROOT = path.join(__dirname, '..');
const LEASH_PRODUCT_ID = 'thumbgate_leash_monthly';

async function main() {
  loadEnv(ROOT);
  const appId = process.env.EXPO_ASC_APP_ID;

  const app = await ascGet(`/v1/apps/${appId}`);
  const versions = await ascGet(`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=5`);
  const v10 = (versions.data || []).find((v) => v.attributes?.versionString === '1.0');

  let screenshots = [];
  let localizations = [];
  if (v10) {
    const locs = await ascGet(`/v1/appStoreVersions/${v10.id}/appStoreVersionLocalizations?limit=5`);
    localizations = (locs.data || []).map((l) => ({
      locale: l.attributes?.locale,
      descriptionLen: l.attributes?.description?.length ?? 0,
      promo: l.attributes?.promotionalText?.slice(0, 60),
    }));
    for (const loc of locs.data || []) {
      const sets = await ascGet(
        `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=20`,
      );
      for (const set of sets.data || []) {
        const shots = await ascGet(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=20`);
        screenshots.push({
          locale: loc.attributes?.locale,
          displayType: set.attributes?.screenshotDisplayType,
          count: (shots.data || []).length,
        });
      }
      const previewSets = await ascGet(
        `/v1/appStoreVersionLocalizations/${loc.id}/appPreviewSets?limit=10`,
      );
      for (const set of previewSets.data || []) {
        const previews = await ascGet(`/v1/appPreviewSets/${set.id}/appPreviews?limit=5`);
        screenshots.push({
          locale: loc.attributes?.locale,
          displayType: `PREVIEW_${set.attributes?.previewType}`,
          count: (previews.data || []).length,
        });
      }
    }
  }

  const groups = await ascGet(`/v1/apps/${appId}/subscriptionGroups?limit=10`);
  const subscriptionGroups = [];
  const subs = [];
  for (const g of groups.data || []) {
    const groupLocs = await ascGet(`/v1/subscriptionGroups/${g.id}/subscriptionGroupLocalizations?limit=10`);
    subscriptionGroups.push({
      id: g.id,
      referenceName: g.attributes?.referenceName,
      localizations: (groupLocs.data || []).map((l) => ({
        locale: l.attributes?.locale,
        name: l.attributes?.name,
      })),
    });

    const list = await ascGet(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=20`);
    for (const s of list.data || []) {
      let reviewScreenshot = null;
      try {
        const shot = await ascGet(`/v1/subscriptions/${s.id}/appStoreReviewScreenshot`);
        reviewScreenshot = shot.data
          ? {
              id: shot.data.id,
              fileName: shot.data.attributes?.fileName,
              state: shot.data.attributes?.assetDeliveryState?.state,
            }
          : null;
      } catch {
        reviewScreenshot = null;
      }

      const subLocs = await ascGet(`/v1/subscriptions/${s.id}/subscriptionLocalizations?limit=10`);
      subs.push({
        productId: s.attributes?.productId,
        state: s.attributes?.state,
        name: s.attributes?.name,
        subscriptionLocalizations: (subLocs.data || []).map((l) => l.attributes?.locale),
        appStoreReviewScreenshot: reviewScreenshot,
      });
    }
  }

  const leash = subs.find((s) => s.productId === LEASH_PRODUCT_ID);
  const leashReady =
    leash?.state === 'READY_TO_SUBMIT' ||
    leash?.state === 'APPROVED' ||
    leash?.state === 'WAITING_FOR_REVIEW';
  const leashMetadataGaps = [];
  if (leash) {
    const group = subscriptionGroups.find((g) => g.referenceName === 'Leash Pro');
    if (!group?.localizations?.some((l) => l.locale === 'en-US')) {
      leashMetadataGaps.push('subscriptionGroupLocalizations.en-US');
    }
    if (!leash.appStoreReviewScreenshot?.id) {
      leashMetadataGaps.push('appStoreReviewScreenshot');
    }
    if (leash.state === 'MISSING_METADATA') {
      leashMetadataGaps.push('state:MISSING_METADATA');
    }
  }

  let privacyPolicyUrl = null;
  try {
    const info = await ascGet(`/v1/apps/${appId}/appInfos?limit=1`);
    const infoId = info.data?.[0]?.id;
    if (infoId) {
      const locs = await ascGet(`/v1/appInfos/${infoId}/appInfoLocalizations?limit=20`);
      const enUs = (locs.data || []).find((l) => l.attributes?.locale === 'en-US');
      privacyPolicyUrl = enUs?.attributes?.privacyPolicyUrl ?? null;
    }
  } catch {
    /* optional */
  }

  let reviewNotes = null;
  let reviewNotesSafe = { ok: true, violations: [] };
  if (v10) {
    try {
      const detail = await ascGet(`/v1/appStoreVersions/${v10.id}/appStoreReviewDetail`);
      reviewNotes = detail.data?.attributes?.notes ?? null;
      const violations = findReviewNotesViolations(reviewNotes || '');
      reviewNotesSafe = { ok: violations.length === 0, violations };
    } catch {
      reviewNotesSafe = { ok: false, violations: ['review_detail_unavailable'] };
    }
  }

  const payload = {
    appName: app.data?.attributes?.name,
    bundleId: app.data?.attributes?.bundleId,
    version10: v10
      ? {
          state: v10.attributes?.appStoreState,
          version: v10.attributes?.versionString,
        }
      : null,
    localizations,
    screenshots,
    subscriptionGroups,
    subscriptions: subs,
    leashSubscription: leash
      ? {
          readyToSubmit: leashReady && leashMetadataGaps.length === 0,
          metadataGaps: leashMetadataGaps,
        }
      : null,
    privacyPolicyUrl,
    reviewNotes: reviewNotes
      ? {
          len: reviewNotes.length,
          hasDemo: /demo=1/i.test(reviewNotes),
          safe: reviewNotesSafe.ok,
          violations: reviewNotesSafe.violations,
        }
      : null,
  };

  console.log(JSON.stringify(payload, null, 2));

  if (reviewNotesSafe.violations.some((v) => v !== 'review_detail_unavailable')) {
    console.error(
      `ASC review notes guard FAILED: ${reviewNotesSafe.violations.join(', ')} — run node scripts/patch-asc-review-notes.js`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
