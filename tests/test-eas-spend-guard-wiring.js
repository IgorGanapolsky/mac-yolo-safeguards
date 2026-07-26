#!/usr/bin/env node
// Every npm entrypoint that can start a paid EAS build must run eas-build-guard.cjs first.
//
// The gap this closes: the guard existed and blocked builds at the credit threshold, but it
// was only a standalone `eas:build:guard` script — NOTHING invoked it. Any `eas build` (agent
// or human) spent credits with no budget check at all. A guard nobody calls is not a guard.
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'hermes-mobile', 'package.json');
const scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts || {};

let failures = 0;
const fail = (msg) => { console.error(`  FAIL ${msg}`); failures += 1; };
const ok = (msg) => console.log(`  ok   ${msg}`);

// 1. Any script that invokes an EAS *build* must chain through the guard.
for (const [name, body] of Object.entries(scripts)) {
  const startsBuild = /eas(-cli)?\s+build/.test(body);
  if (!startsBuild) continue;
  if (body.includes('eas-build-guard.cjs')) {
    ok(`${name} routes through eas-build-guard`);
  } else {
    fail(`${name} starts an EAS build without eas-build-guard.cjs: ${body}`);
  }
}

// 2. The guarded entrypoints must exist, so "use the guarded script" is actually possible.
for (const required of ['eas:build:android:paid', 'eas:build:ios']) {
  if (scripts[required] && scripts[required].includes('eas-build-guard.cjs')) {
    ok(`${required} exists and is guarded`);
  } else {
    fail(`missing guarded entrypoint: ${required}`);
  }
}

// 3. The guard itself must still enforce a spend threshold + explicit override.
const guardSrc = fs.readFileSync(path.join(__dirname, '..', 'hermes-mobile', 'scripts', 'eas-build-guard.cjs'), 'utf8');
for (const token of ['HERMES_EAS_SPEND_APPROVED', 'HERMES_EAS_REBUILD_EXISTING']) {
  guardSrc.includes(token) ? ok(`guard enforces ${token}`) : fail(`guard lost ${token} override`);
}

console.log(failures ? `eas spend guard wiring: ${failures} failed` : 'eas spend guard wiring: all checks passed');
process.exit(failures ? 1 : 0);
