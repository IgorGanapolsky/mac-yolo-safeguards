#!/usr/bin/env node
/**
 * Patch ASC en-US listing copy.
 *
 * READY_FOR_SALE versions only allow promotionalText edits.
 * PREPARE_FOR_SUBMISSION versions allow description/keywords/urls.
 * App info PREPARE_FOR_SUBMISSION allows name/subtitle/privacyPolicyUrl.
 * Live subtitle for READY_FOR_SALE apps requires the next version ship.
 */
const fs = require('fs');
const path = require('path');
const { loadEnv, ascGet, ascPatch } = require('./asc-api');

const ROOT = path.join(__dirname, '..');
const META = path.join(ROOT, 'fastlane/metadata/ios/en-US');

function read(name) {
  const p = path.join(META, name);
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  return fs.readFileSync(p, 'utf8').replace(/\s+$/, '');
}

async function patchVersionLoc(version, attributes, label) {
  const locs = await ascGet(
    `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=10`,
  );
  const en = (locs.data || []).find((l) => l.attributes?.locale === 'en-US');
  if (!en) {
    console.warn(`${label}: no en-US localization`);
    return { skipped: true };
  }
  try {
    const result = await ascPatch(`/v1/appStoreVersionLocalizations/${en.id}`, {
      type: 'appStoreVersionLocalizations',
      id: en.id,
      attributes,
    });
    if (result?.errors) {
      return { ok: false, errors: result.errors };
    }
    return { ok: true, localizationId: en.id };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

async function main() {
  loadEnv(ROOT);
  const appId = process.env.EXPO_ASC_APP_ID;
  const dryRun = process.argv.includes('--dry-run');

  const name = read('name.txt');
  const subtitle = read('subtitle.txt');
  const promotionalText = read('promotional_text.txt');
  const description = read('description.txt');
  const keywords = read('keywords.txt');
  const marketingUrl = read('marketing_url.txt');
  const supportUrl = read('support_url.txt');
  const privacyUrl = read('privacy_url.txt');

  if (name.length > 30) throw new Error(`name ${name.length} > 30`);
  if (subtitle.length > 30) throw new Error(`subtitle ${subtitle.length} > 30`);
  if (promotionalText.length > 170) {
    throw new Error(`promotionalText ${promotionalText.length} > 170`);
  }
  if (keywords.length > 100) throw new Error(`keywords ${keywords.length} > 100`);
  if (/in App Store review/i.test(description) || /in App Store review/i.test(promotionalText)) {
    throw new Error('ASC copy still claims App Store review — fix metadata first');
  }

  const versions = await ascGet(
    `/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=20`,
  );
  const plan = {
    dryRun,
    promotionalText,
    subtitle,
    versions: (versions.data || []).map((v) => ({
      version: v.attributes?.versionString,
      state: v.attributes?.appStoreState,
    })),
  };
  console.log(JSON.stringify({ plan }, null, 2));
  if (dryRun) {
    console.log('dry-run: no ASC PATCH');
    return;
  }

  const results = [];
  for (const version of versions.data || []) {
    const state = version.attributes?.appStoreState;
    const label = `${version.attributes?.versionString} (${state})`;
    if (state === 'READY_FOR_SALE') {
      results.push({
        version: label,
        versionLoc: await patchVersionLoc(version, { promotionalText }, label),
      });
    } else if (state === 'PREPARE_FOR_SUBMISSION' || state === 'WAITING_FOR_REVIEW' || state === 'REJECTED') {
      results.push({
        version: label,
        versionLoc: await patchVersionLoc(
          version,
          {
            promotionalText,
            description,
            keywords,
            marketingUrl,
            supportUrl,
          },
          label,
        ),
      });
    }
  }

  const infos = await ascGet(`/v1/apps/${appId}/appInfos?limit=10`);
  for (const info of infos.data || []) {
    const state = info.attributes?.appStoreState || info.attributes?.state;
    const infoLocs = await ascGet(`/v1/appInfos/${info.id}/appInfoLocalizations?limit=10`);
    const infoEn = (infoLocs.data || []).find((l) => l.attributes?.locale === 'en-US');
    if (!infoEn) continue;
    // Live READY_FOR_SALE appInfo locks name+subtitle (ASC 409 INVALID_STATE).
    // Public rename ships with the next approved version's appInfo (already staged there).
    if (state === 'READY_FOR_SALE') {
      results.push({
        appInfo: state,
        currentName: infoEn.attributes?.name,
        currentSubtitle: infoEn.attributes?.subtitle,
        infoLoc: {
          skipped: true,
          reason:
            'READY_FOR_SALE locks name/subtitle; wait for WAITING_FOR_REVIEW/PREPARE version to release',
        },
      });
      continue;
    }
    try {
      const result = await ascPatch(`/v1/appInfoLocalizations/${infoEn.id}`, {
        type: 'appInfoLocalizations',
        id: infoEn.id,
        attributes: { name, subtitle, privacyPolicyUrl: privacyUrl },
      });
      results.push({
        appInfo: state,
        previousName: infoEn.attributes?.name,
        previousSubtitle: infoEn.attributes?.subtitle,
        infoLoc: result?.errors ? { ok: false, errors: result.errors } : { ok: true },
      });
    } catch (err) {
      results.push({
        appInfo: state,
        previousName: infoEn.attributes?.name,
        previousSubtitle: infoEn.attributes?.subtitle,
        infoLoc: { ok: false, error: err.message || String(err) },
      });
    }
  }

  console.log(JSON.stringify({ results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
