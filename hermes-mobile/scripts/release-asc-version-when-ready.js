#!/usr/bin/env node
/**
 * Poll ASC for a version (default 1.1). When READY_FOR_SALE or PENDING_DEVELOPER_RELEASE,
 * set release type AUTOMATIC if needed and/or mark as available.
 *
 * Usage:
 *   node scripts/release-asc-version-when-ready.js --version 1.1
 *   node scripts/release-asc-version-when-ready.js --version 1.1 --once
 *   node scripts/release-asc-version-when-ready.js --version 1.1 --poll-minutes 120
 */
const path = require('path');
const { loadEnv, ascGet, ascPatch } = require('./asc-api');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
function arg(name, fallback) {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  return fallback;
}
const versionString = arg('version', '1.1');
const once = args.includes('--once');
const pollMinutes = Number(arg('poll-minutes', '90'));
const dryRun = args.includes('--dry-run');

async function main() {
  loadEnv(ROOT);
  const appId = process.env.EXPO_ASC_APP_ID;
  const deadline = Date.now() + pollMinutes * 60 * 1000;

  for (;;) {
    const versions = await ascGet(
      `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=15`,
    );
    const v = (versions.data || []).find((x) => x.attributes?.versionString === versionString);
    if (!v) throw new Error(`Version ${versionString} not found`);

    const state = v.attributes.appStoreState;
    const appVersionState = v.attributes.appVersionState;
    const releaseType = v.attributes.releaseType;
    console.log(
      JSON.stringify({
        at: new Date().toISOString(),
        version: versionString,
        state,
        appVersionState,
        releaseType,
      }),
    );

    if (state === 'READY_FOR_SALE') {
      console.log(JSON.stringify({ ok: true, alreadyLive: true, version: versionString }));
      return;
    }

    // Manual release hold after approval
    if (
      state === 'PENDING_DEVELOPER_RELEASE' ||
      appVersionState === 'PENDING_DEVELOPER_RELEASE'
    ) {
      if (dryRun) {
        console.log(JSON.stringify({ dryRun: true, wouldRelease: true }));
        return;
      }
      // Prefer AUTOMATIC going forward; for pending developer release Apple uses a release call
      try {
        await ascPatch(`/v1/appStoreVersions/${v.id}`, {
          type: 'appStoreVersions',
          id: v.id,
          attributes: { releaseType: 'AFTER_APPROVAL' },
        });
      } catch (e) {
        console.warn('releaseType patch:', e.message?.slice(0, 200));
      }
      // Create app store version release if endpoint available
      try {
        const { ascPost } = require('./asc-api');
        await ascPost('/v1/appStoreVersionReleases', {
          type: 'appStoreVersionReleases',
          relationships: {
            appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } },
          },
        });
        console.log(JSON.stringify({ ok: true, released: true, via: 'appStoreVersionReleases' }));
      } catch (e) {
        console.warn('appStoreVersionReleases:', e.message?.slice(0, 400));
        // Fallback: phasing-release or manual
        console.log(
          JSON.stringify({
            ok: false,
            needsManualRelease: true,
            state,
            hint: 'Approve/release in ASC UI if still PENDING_DEVELOPER_RELEASE',
          }),
        );
      }
      return;
    }

    if (once || Date.now() > deadline) {
      console.log(JSON.stringify({ ok: false, stillWaiting: true, state }));
      process.exit(state === 'WAITING_FOR_REVIEW' || state === 'IN_REVIEW' ? 0 : 2);
    }

    await new Promise((r) => setTimeout(r, 120_000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
