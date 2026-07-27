#!/usr/bin/env node
/**
 * Refuse a production store build whose config would compile OTA OUT.
 *
 * This exact mistake shipped: the Android binary live on Play (v1.4, versionCode 19) was
 * built during the Expo billing freeze, so app.config.js baked in
 * `updates.enabled=false, checkAutomatically=NEVER`. Those users can NEVER receive a hotfix —
 * every fix needs a full store review. It nearly happened a SECOND time on 2026-07-27:
 * HERMES_OTA_BILLING_THAW was set as a GitHub Actions variable, but EAS builds use the EAS
 * environment, where it was absent — so the rebuild was silently compiling OTA off again.
 *
 * Usage: node scripts/assert-ota-enabled-for-store-build.js
 * Exit 1 if updates are disabled. Override for a deliberate no-OTA build:
 *   HERMES_ALLOW_OTA_DISABLED_BUILD=1
 */
const path = require('path');

function evaluateUpdates(cfg) {
  const u = (cfg && cfg.updates) || {};
  const enabled = u.enabled !== false;
  const checks = String(u.checkAutomatically || '').toUpperCase();
  return { enabled, checkAutomatically: checks, willReceiveOta: enabled && checks !== 'NEVER' };
}

function main() {
  const appConfig = require(path.join(process.cwd(), 'app.config.js'));
  const cfg = appConfig({ config: {} });
  const verdict = evaluateUpdates(cfg);

  console.log(`updates.enabled=${verdict.enabled} checkAutomatically=${verdict.checkAutomatically || '(default)'}`);

  if (verdict.willReceiveOta) {
    console.log('OTA is compiled IN — this binary can receive hotfixes.');
    return 0;
  }
  if (process.env.HERMES_ALLOW_OTA_DISABLED_BUILD === '1') {
    console.warn('OTA is compiled OUT, but HERMES_ALLOW_OTA_DISABLED_BUILD=1 — proceeding deliberately.');
    return 0;
  }
  console.error('');
  console.error('REFUSING BUILD: OTA would be compiled OUT of this binary.');
  console.error('Users of this build could never receive a hotfix without a full store review.');
  console.error('');
  console.error('Most likely cause: HERMES_OTA_BILLING_THAW is missing from the EAS environment.');
  console.error('  npx eas-cli env:list production          # confirm');
  console.error('  npx eas-cli env:set --name HERMES_OTA_BILLING_THAW --value 1 --environment production');
  console.error('');
  console.error('A GitHub Actions variable is NOT enough — EAS builds read the EAS environment.');
  console.error('Deliberate no-OTA build? HERMES_ALLOW_OTA_DISABLED_BUILD=1');
  return 1;
}

module.exports = { evaluateUpdates };
if (require.main === module) process.exit(main());
