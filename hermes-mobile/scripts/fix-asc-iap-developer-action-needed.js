#!/usr/bin/env node
/**
 * Repair thumbgate_leash_monthly when ASC state is DEVELOPER_ACTION_NEEDED
 * because en-US subscriptionLocalization is REJECTED (API cannot PATCH/DELETE it).
 *
 * Fix: POST a fresh en-US subscriptionLocalization (PREPARE_FOR_SUBMISSION), then
 * POST /v1/subscriptionSubmissions to move product → WAITING_FOR_REVIEW.
 *
 * Idempotent when already WAITING_FOR_REVIEW / READY_TO_SUBMIT / APPROVED.
 */
const path = require('path');
const { loadEnv, ascGet, ascPost } = require('./asc-api');

const ROOT = path.join(__dirname, '..');
const PRODUCT_ID = 'thumbgate_leash_monthly';
const EN_US = {
  name: 'Leash Pro',
  description: 'Standing gate rules + priority ThumbGate memory.',
};

async function findSubscription(appId) {
  const groups = await ascGet(`/v1/apps/${appId}/subscriptionGroups?limit=20`);
  for (const g of groups.data || []) {
    const subs = await ascGet(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=20`);
    const sub = (subs.data || []).find((s) => s.attributes?.productId === PRODUCT_ID);
    if (sub) return sub;
  }
  return null;
}

async function ensureActiveEnUsLocalization(subscriptionId) {
  const locs = await ascGet(`/v1/subscriptions/${subscriptionId}/subscriptionLocalizations?limit=20`);
  const rows = locs.data || [];
  const good = rows.find(
    (l) =>
      l.attributes?.locale === 'en-US' &&
      !['REJECTED', 'DEVELOPER_REMOVED'].includes(l.attributes?.state),
  );
  if (good) {
    return { localizationId: good.id, state: good.attributes.state, created: false };
  }

  const created = await ascPost('/v1/subscriptionLocalizations', {
    type: 'subscriptionLocalizations',
    attributes: { locale: 'en-US', ...EN_US },
    relationships: { subscription: { data: { type: 'subscriptions', id: subscriptionId } } },
  });
  return {
    localizationId: created.data.id,
    state: created.data.attributes?.state,
    created: true,
  };
}

async function submitSubscription(subscriptionId) {
  await ascPost('/v1/subscriptionSubmissions', {
    type: 'subscriptionSubmissions',
    relationships: { subscription: { data: { type: 'subscriptions', id: subscriptionId } } },
  });
  return { submitted: true };
}

async function main() {
  loadEnv(ROOT);
  const appId = process.env.EXPO_ASC_APP_ID;
  const jsonOut = process.argv.includes('--json');

  const sub = await findSubscription(appId);
  if (!sub) throw new Error(`Subscription ${PRODUCT_ID} not found`);

  const beforeState = sub.attributes?.state;
  const steps = [];

  if (['WAITING_FOR_REVIEW', 'READY_TO_SUBMIT', 'APPROVED'].includes(beforeState)) {
    const result = {
      ok: true,
      productId: PRODUCT_ID,
      subscriptionId: sub.id,
      beforeState,
      afterState: beforeState,
      action: 'noop',
      steps,
    };
    if (jsonOut) console.log(JSON.stringify(result, null, 2));
    else console.log(`IAP already ${beforeState} — no action`);
    return;
  }

  if (beforeState !== 'DEVELOPER_ACTION_NEEDED' && beforeState !== 'MISSING_METADATA') {
    throw new Error(`Unsupported state ${beforeState} — manual ASC UI required`);
  }

  const loc = await ensureActiveEnUsLocalization(sub.id);
  steps.push({ step: 'ensure-en-us-localization', ...loc });

  let submit = { submitted: false };
  if (beforeState === 'DEVELOPER_ACTION_NEEDED' || beforeState === 'MISSING_METADATA') {
    submit = await submitSubscription(sub.id);
    steps.push({ step: 'subscriptionSubmissions', ...submit });
  }

  const refreshed = await ascGet(`/v1/subscriptions/${sub.id}`);
  const afterState = refreshed.data?.attributes?.state;

  const result = {
    ok: afterState === 'WAITING_FOR_REVIEW' || afterState === 'READY_TO_SUBMIT',
    productId: PRODUCT_ID,
    subscriptionId: sub.id,
    beforeState,
    afterState,
    steps,
  };

  if (jsonOut) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`IAP ${PRODUCT_ID}: ${beforeState} → ${afterState}`);
    for (const s of steps) console.log(' ', JSON.stringify(s));
  }

  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  process.exit(1);
});
