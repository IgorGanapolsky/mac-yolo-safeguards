const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/store-release.yml'),
  'utf8',
);

test('Android store release audits only the public paid package', () => {
  assert.match(
    workflow,
    /PLAY_PACKAGE:\s+com\.iganapolsky\.hermesmobile\.paid/,
  );
  assert.doesNotMatch(
    workflow,
    /PLAY_PACKAGE:\s+com\.iganapolsky\.hermesmobile\s*$/,
  );
  assert.match(workflow, /method:\s*'DELETE'/);
  assert.match(workflow, /editCommitted:\s*false/);
  assert.match(workflow, /editDeleted:\s*true/);
});

test('Android store build and submit use the paid EAS profile', () => {
  const androidJob = workflow.slice(
    workflow.indexOf('  android-production:'),
    workflow.indexOf('  ios-production:'),
  );
  assert.match(androidJob, /HERMES_ANDROID_STORE_SKU:\s*paid/);
  assert.match(androidJob, /EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD:\s*"1"/);
  assert.match(
    androidJob,
    /eas-build-guard\.cjs --platform android --profile production-android-paid/,
  );
  assert.match(
    androidJob,
    /eas-cli@latest build[\s\S]*?--profile production-android-paid/,
  );
  assert.match(
    androidJob,
    /eas-cli@latest submit[\s\S]*?--profile production-android-paid/,
  );
  assert.doesNotMatch(
    androidJob,
    /--platform android --profile production --/,
  );
  assert.match(
    androidJob,
    /Paid Android package verified: \$\{expected\}/,
  );
});
