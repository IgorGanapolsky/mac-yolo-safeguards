#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const dependabot = read('.github/dependabot.yml');
const prHygiene = read('.github/workflows/pr-hygiene.yml');
const ci = read('.github/workflows/ci.yml');
const localCi = read('scripts/ci-verify.sh');

let assertions = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};

check(
  /dependency-name: jest\s+update-types: \["version-update:semver-major"\]/.test(dependabot),
  'Dependabot must hold Jest major upgrades for explicit Expo compatibility review',
);
check(
  /dependency-name: "@types\/jest"\s+update-types: \["version-update:semver-major"\]/.test(dependabot),
  'Dependabot must keep Jest types on the supported Jest major',
);
check(
  /dependency-name: eslint\s+update-types: \["version-update:semver-major"\]/.test(dependabot),
  'Dependabot must hold ESLint major upgrades until eslint-config-next supports them',
);
check(
  /dependency-name: react-test-renderer\s+\s*# v3 requires/.test(dependabot),
  'react-test-renderer must remain exactly aligned with the SDK-pinned React version',
);
check(
  prHygiene.includes('--json number,isDraft,author'),
  'PR hygiene must request author metadata before selecting auto-merge candidates',
);
check(
  prHygiene.includes('.author.login != "app/dependabot"')
    && prHygiene.includes('.author.login != "dependabot[bot]"'),
  'broad PR hygiene must exclude both GitHub Dependabot author spellings',
);
check(
  /cron: '17 \*\/6 \* \* \*'/.test(prHygiene),
  'repo janitor must run every 6 hours',
);
check(
  prHygiene.includes('days-before-issue-stale: 23')
    && prHygiene.includes('days-before-issue-close: 7')
    && prHygiene.includes('Closed after 30 days without an update')
    && prHygiene.includes('exempt-draft-pr: false'),
  'silent issues age out at 30 days, the same window as the drain',
);
check(
  prHygiene.includes('needs: drain')
    && prHygiene.includes('hasNextPage')
    && prHygiene.includes('still_idle'),
  'drain pages every open item and finishes before stale comments reset the clock',
);
check(
  prHygiene.includes('exempt-pr-labels: keep,pinned,security,blocked,dependencies'),
  'dependency PRs stay open so a red security bump is not discarded',
);
check(
  prHygiene.includes("github.event_name != 'pull_request'"),
  'immediate drain must not run from an unmerged pull request',
);
check(
  ci.includes("git ls-files '*.sh'") && localCi.includes("git ls-files '*.sh'"),
  'cloud and local syntax gates must inspect every tracked shell script',
);
check(
  ci.includes('ruff==0.15.20') && ci.includes('check --select F,E722'),
  'cloud CI must pin Ruff and catch undefined names plus bare except statements',
);
const cloudSecretMarkers = [
  ['github', '_pat_'].join(''),
  ['xai', '-'].join(''),
  ['AI', 'zaSy'].join(''),
  ['X-Goog-', 'Signature='].join(''),
];
for (const marker of cloudSecretMarkers) {
  check(ci.includes(marker), `cloud secret scan must cover ${marker}`);
}
for (const marker of ['GITHUB_FINE_PAT_PREFIX', 'XAI_KEY_PREFIX', 'GOOGLE_API_KEY_PREFIX', 'GOOGLE_SIGNATURE_NAME']) {
  check(localCi.includes(marker), `local secret scan must construct ${marker} safely`);
}

console.log(`dependency automation policy: ${assertions} assertions passed`);
