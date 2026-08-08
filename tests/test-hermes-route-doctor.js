'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseZshrcExports,
  parsePlistRouteCommand,
  parseEtimeToHours,
  compareSurfaces,
  findZombieSessions,
} = require('../tools/hermes-route-doctor.js');

test('parseZshrcExports: last export wins and comments are ignored', () => {
  const rc = [
    '# 2026-08-04: was HERMES_YOLO_MODEL=glm-coding',
    'export HERMES_YOLO_PROVIDER=custom:litellm-gateway',
    'export HERMES_YOLO_MODEL=glm-coding',
    'export HERMES_YOLO_MODEL=deepseek-v4-flash',
    '# export HERMES_YOLO_BACKEND=grok',
    'export HERMES_YOLO_BACKEND=hermes  # plain hermes-yolo opens Hermes',
  ].join('\n');
  const values = parseZshrcExports(rc);
  assert.equal(values.HERMES_YOLO_MODEL, 'deepseek-v4-flash');
  assert.equal(values.HERMES_YOLO_BACKEND, 'hermes');
  assert.equal(values.HERMES_YOLO_PROVIDER, 'custom:litellm-gateway');
});

test('parsePlistRouteCommand: extracts every setenv pair from the sh -c string', () => {
  const plist = '<string>launchctl setenv HERMES_YOLO_PROVIDER custom:litellm-gateway; launchctl setenv HERMES_YOLO_MODEL deepseek-v4-flash; launchctl setenv HERMES_YOLO_BACKEND hermes</string>';
  const values = parsePlistRouteCommand(plist);
  assert.deepEqual(values, {
    HERMES_YOLO_PROVIDER: 'custom:litellm-gateway',
    HERMES_YOLO_MODEL: 'deepseek-v4-flash',
    HERMES_YOLO_BACKEND: 'hermes',
  });
});

test('parseEtimeToHours: mm:ss, hh:mm:ss, dd-hh:mm:ss', () => {
  assert.ok(Math.abs(parseEtimeToHours('04:52') - 4 / 60) < 0.01);
  assert.ok(Math.abs(parseEtimeToHours('19:36:45') - 19.6) < 0.01);
  assert.ok(Math.abs(parseEtimeToHours('1-02:03:04') - 26.05) < 0.01);
  assert.equal(parseEtimeToHours('garbage'), null);
});

test('compareSurfaces: agreement is clean, disagreement names every surface', () => {
  const agree = {
    zshrc: { HERMES_YOLO_BACKEND: 'hermes', HERMES_YOLO_MODEL: 'deepseek-v4-flash' },
    launchctl: { HERMES_YOLO_BACKEND: 'hermes', HERMES_YOLO_MODEL: 'deepseek-v4-flash' },
    plist: { HERMES_YOLO_BACKEND: 'hermes', HERMES_YOLO_MODEL: 'deepseek-v4-flash' },
  };
  assert.deepEqual(compareSurfaces(agree), []);

  // The exact 2026-08-06 incident: a manual un-persisted launchctl setenv
  // diverged from the other two surfaces, sending GUI apps to a 0%-quota Grok
  // while terminals stayed on hermes.
  const incident = {
    zshrc: { HERMES_YOLO_BACKEND: 'hermes' },
    launchctl: { HERMES_YOLO_BACKEND: 'grok' },
    plist: { HERMES_YOLO_BACKEND: 'hermes' },
  };
  const problems = compareSurfaces(incident);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /HERMES_YOLO_BACKEND drift/);
  assert.match(problems[0], /launchctl=grok/);
  assert.match(problems[0], /zshrc=hermes/);
});

test('compareSurfaces: BACKEND missing on a surface is flagged, other vars are not', () => {
  const partial = {
    zshrc: { HERMES_YOLO_BACKEND: 'hermes', HERMES_YOLO_MODEL: 'deepseek-v4-flash' },
    launchctl: {},
    plist: { HERMES_YOLO_BACKEND: 'hermes' },
  };
  const problems = compareSurfaces(partial);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /HERMES_YOLO_BACKEND missing on: launchctl/);
});

test('findZombieSessions: flags only wrappers past the threshold', () => {
  const ps = [
    '  PID ELAPSED COMMAND',
    ' 83650   09:50 node /Users/igorganapolsky/.local/bin/hermes-yolo',
    ' 79465 19:36:45 node /Users/igorganapolsky/.local/bin/hermes-yolo',
    '  7518 1-02:03:04 node /Users/igorganapolsky/.local/bin/hermes-yolo',
    '  1234 22:11:00 node /Users/igorganapolsky/.local/bin/something-else',
  ].join('\n');
  const zombies = findZombieSessions(ps, 6);
  assert.deepEqual(zombies.map((z) => z.pid), [79465, 7518]);
  assert.ok(zombies[0].hours > 19 && zombies[0].hours < 20);
});

test('findZombieSessions: empty ps output yields no zombies, not a crash', () => {
  assert.deepEqual(findZombieSessions('', 6), []);
});
