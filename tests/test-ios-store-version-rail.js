const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/store-release.yml'),
  'utf8',
);

const iosJob = workflow.slice(
  workflow.indexOf('  ios-production:'),
  workflow.indexOf('  require-internal-proof:'),
);

test('iOS release derives its marketing version from app.json', () => {
  assert.match(
    iosJob,
    /APP_VERSION="\$\(node -p "require\('\.\/hermes-mobile\/app\.json'\)\.expo\.version"\)"/,
  );
  assert.match(
    iosJob,
    /--message "Production Hermes Mobile iOS \$\{APP_VERSION\} from \$\{GITHUB_SHA\}"/,
  );
  assert.doesNotMatch(iosJob, /--app-version\s+1\.1/);
  assert.doesNotMatch(iosJob, /iOS 1\.1/);
  assert.doesNotMatch(iosJob, /build:version:set/);
});

test('iOS EAS read-back fails closed on a marketing-version mismatch', () => {
  assert.match(
    iosJob,
    /const expectedAppVersion = require\('\.\/hermes-mobile\/app\.json'\)\.expo\.version;/,
  );
  assert.match(
    iosJob,
    /if \(build\.appVersion !== expectedAppVersion\) throw new Error/,
  );
  assert.match(iosJob, /Expected app version \$\{expectedAppVersion\}/);
  assert.doesNotMatch(iosJob, /build:version:[\s\S]*?\|\| true/);
});
