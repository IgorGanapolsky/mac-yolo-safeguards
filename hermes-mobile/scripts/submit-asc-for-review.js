#!/usr/bin/env node
/** Submit Hermes Mobile 1.0 for App Review via App Store Connect API. */
const path = require('path');
const { makeAscJwt } = require('../../tools/lib/asc-jwt-es256');
const { loadEnv, ascGet, ascPost } = require('./asc-api');

const ROOT = path.join(__dirname, '..');

async function ascPatch(type, id, attributes = {}) {
  const token = makeAscJwt();

  const res = await fetch(`https://api.appstoreconnect.apple.com/v1/${type}/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: { type, id, attributes } }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`ASC PATCH ${res.status}: ${body.slice(0, 800)}`);
  return JSON.parse(body);
}

async function main() {
  loadEnv(ROOT);
  const appId = process.env.EXPO_ASC_APP_ID;
  const versionString = process.env.ASC_APP_VERSION || '1.0';

  const versions = await ascGet(`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=10`);
  const version = (versions.data || []).find((v) => v.attributes?.versionString === versionString);
  if (!version) throw new Error(`Version ${versionString} not found`);

  const state = version.attributes?.appStoreState;
  console.log('Version state before submit:', state, version.id);

  if (state === 'WAITING_FOR_REVIEW' || state === 'IN_REVIEW') {
    console.log(JSON.stringify({ ok: true, alreadySubmitted: true, state }, null, 2));
    return;
  }

  const existing = await ascGet(`/v1/apps/${appId}/reviewSubmissions?filter[platform]=IOS&limit=5`);
  let submission = (existing.data || []).find((s) => s.attributes?.state === 'READY_FOR_REVIEW');

  if (!submission) {
    console.log('Creating review submission…');
    const created = await ascPost('/v1/reviewSubmissions', {
      type: 'reviewSubmissions',
      attributes: { platform: 'IOS' },
      relationships: { app: { data: { type: 'apps', id: appId } } },
    });
    submission = created.data;
  }

  const items = await ascGet(`/v1/reviewSubmissions/${submission.id}/items?limit=10`);
  const hasVersion = (items.data || []).some(
    (item) => item.relationships?.appStoreVersion?.data?.id === version.id,
  );
  if (!hasVersion) {
    console.log('Adding version to review submission…');
    await ascPost('/v1/reviewSubmissionItems', {
      type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } },
        appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } },
      },
    });
  }

  console.log('Submitting for review…');
  await ascPatch('reviewSubmissions', submission.id, { submitted: true });

  const after = await ascGet(`/v1/appStoreVersions/${version.id}`);
  console.log(
    JSON.stringify(
      {
        ok: true,
        submissionId: submission.id,
        versionState: after.data?.attributes?.appStoreState,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
