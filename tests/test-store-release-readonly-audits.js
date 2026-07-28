const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/store-release.yml'),
  'utf8',
);

const gateJob = workflow.slice(
  workflow.indexOf('  internal-proof-gate:'),
  workflow.indexOf('  asc-audit:'),
);

test('read-only audits never run the internal-signoff gate', () => {
  // Regression guard: a Play audit that only READS the live track state was
  // blocked by "Missing required successful commit status" — a publish signoff
  // demanded before you could look at what is already public.
  assert.match(gateJob, /inputs\.audit_play_track != 'true'/);
  assert.match(gateJob, /inputs\.audit_asc != 'true'/);
});

test('both store audits exist and are read-only', () => {
  assert.ok(workflow.includes('  asc-audit:'), 'expected an App Store Connect audit job');
  assert.ok(
    workflow.includes('  android-production-track-audit:'),
    'expected a Google Play track audit job',
  );
  const ascJob = workflow.slice(
    workflow.indexOf('  asc-audit:'),
    workflow.indexOf('  android-production-track-audit:'),
  );
  // An audit must never build or submit anything.
  assert.doesNotMatch(ascJob, /eas build|eas submit|eas-cli@latest build|eas-cli@latest submit/);
});

test('the iOS build job stands down during an ASC audit', () => {
  const iosJob = workflow.slice(workflow.indexOf('  ios-production:'));
  assert.match(iosJob, /inputs\.audit_asc != 'true'/);
});

test('the ASC audit script signs ES256 with raw r||s, not DER', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/asc-audit.cjs'), 'utf8');
  // Apple rejects DER-encoded ECDSA in JWS; Node needs an explicit dsaEncoding.
  assert.match(script, /dsaEncoding: 'ieee-p1363'/);
  assert.match(script, /alg: 'ES256'/);
  assert.match(script, /aud: 'appstoreconnect-v1'/);
});
