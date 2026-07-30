#!/usr/bin/env node
'use strict';

/**
 * Unit tests for tools/index-config-stamp.js.
 *
 * Fully hermetic: every case builds its own temp config + temp stamp sidecar and
 * passes BOTH paths explicitly. Nothing here reads ~/.hermes, so this runs the
 * same on a CI runner that has never seen a grepai index. Subprocess cases run
 * with HOME pointed at a temp dir, so a default-path regression cannot
 * accidentally pass by finding the developer's real config.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const TOOL = path.join(REPO, 'tools', 'index-config-stamp.js');
const {
  STAMPED_FIELDS,
  check,
  coerceScalar,
  computeStamp,
  defaultStampPath,
  extractScalars,
  readConfigFields,
  stampConfig,
  writeStamp,
} = require(TOOL);

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

/**
 * A faithful reduction of the real grepai config: same key nesting, same
 * unquoted RFC3339 timestamp, same sequences under search.boost and trace that
 * the reader must step over without losing its place.
 */
function configYaml(over = {}) {
  const o = {
    provider: 'ollama',
    model: 'nomic-embed-text',
    dimensions: 768,
    endpoint: 'http://localhost:11434',
    parallelism: 4,
    size: 512,
    overlap: 50,
    lastIndexTime: '2026-07-30T16:27:11.39988-04:00',
    hybrid: 'true',
    k: 60,
    ...over,
  };
  return `version: 1
embedder:
    provider: ${o.provider}
    model: ${o.model}
    endpoint: ${o.endpoint}
    dimensions: ${o.dimensions}
    parallelism: ${o.parallelism}
store:
    backend: gob
chunking:
    size: ${o.size}
    overlap: ${o.overlap}
watch:
    debounce_ms: 500
    last_index_time: ${o.lastIndexTime}
    rpg_persist_interval_ms: 1000
search:
    boost:
        enabled: true
        penalties:
            - pattern: /tests/
              factor: 0.5
            - pattern: /docs/
              factor: 0.6
        bonuses:
            - pattern: /src/
              factor: 1.1
    hybrid:
        enabled: ${o.hybrid}
        k: ${o.k}
trace:
    mode: fast
    enabled_languages:
        - .go
        - .js
    exclude_patterns:
        - '*_test.go'
`;
}

let tmpSeq = 0;
function scratch() {
  tmpSeq += 1;
  return fs.mkdtempSync(path.join(os.tmpdir(), `idx-stamp-${tmpSeq}-`));
}

/** Write a config into a fresh temp dir; returns { dir, configPath, stampPath }. */
function makeConfig(over) {
  const dir = scratch();
  const configPath = path.join(dir, 'config.yaml');
  fs.writeFileSync(configPath, configYaml(over));
  return { dir, configPath, stampPath: path.join(dir, 'index-config-stamp.json') };
}

function runTool(args, env) {
  const home = scratch();
  return spawnSync(process.execPath, [TOOL, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, ...env },
  });
}

// ---------------------------------------------------------------------------

test('tool exists and --help exits 0 describing itself', () => {
  assert.ok(fs.existsSync(TOOL));
  const r = runTool(['--help']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('index-config-stamp'), 'help must name the tool');
  assert.ok(/NO-STAMP is a FAILURE/i.test(r.stdout), 'help must state NO-STAMP is not a pass');
});

test('reads all six retrieval-relevant fields out of a realistic config', () => {
  const { configPath } = makeConfig();
  const { fields, missing } = readConfigFields(configPath);
  assert.deepStrictEqual(missing, [], 'realistic config must have no missing fields');
  assert.deepStrictEqual(fields, {
    'embedder.provider': 'ollama',
    'embedder.model': 'nomic-embed-text',
    'embedder.dimensions': 768,
    'chunking.size': 512,
    'chunking.overlap': 50,
    'search.hybrid.enabled': true,
  });
});

test('sequences under search.boost do not swallow search.hybrid.enabled', () => {
  // If the reader mishandled `- pattern:` list items it would lose its indent
  // position and never reach search.hybrid.enabled — the field would read as
  // missing and every stamp would silently collapse to the same value.
  const scalars = extractScalars(configYaml());
  assert.strictEqual(scalars.get('search.hybrid.enabled'), 'true');
  assert.strictEqual(scalars.get('search.boost.enabled'), 'true');
  assert.strictEqual(scalars.get('trace.mode'), 'fast');
});

test('a compact-style sequence cannot shadow a stamped scalar', () => {
  // Compact list style puts the dash at the PARENT's indent. A reader that walks
  // into list items instead of stepping over them pops back to `chunking` and
  // then reads the override's `size:`/`overlap:` as if they were the top-level
  // values — silently stamping numbers the index was never built with.
  const yaml = `chunking:
    size: 512
    overlap: 50
    overrides:
    - language: go
      size: 1024
      overlap: 128
embedder:
    provider: ollama
    model: nomic-embed-text
    dimensions: 768
search:
    hybrid:
        enabled: true
`;
  const dir = scratch();
  const configPath = path.join(dir, 'config.yaml');
  fs.writeFileSync(configPath, yaml);
  const { fields } = readConfigFields(configPath);
  assert.strictEqual(fields['chunking.size'], 512, 'list override must not shadow chunking.size');
  assert.strictEqual(fields['chunking.overlap'], 50, 'list override must not shadow chunking.overlap');
});

test('changing ONLY a timestamp field does NOT change the stamp', () => {
  // watch.last_index_time is rewritten on every index pass. If it fed the stamp,
  // the check would report MISMATCH constantly and get ignored or deleted.
  const a = makeConfig({ lastIndexTime: '2026-07-30T16:27:11.39988-04:00' });
  const b = makeConfig({ lastIndexTime: '2026-08-02T09:01:44.10101-04:00' });
  const sa = stampConfig(a.configPath).stamp;
  const sb = stampConfig(b.configPath).stamp;
  assert.strictEqual(sb, sa, 'a timestamp-only edit must leave the stamp identical');
});

test('changing the embedder model DOES change the stamp', () => {
  const a = makeConfig({ model: 'nomic-embed-text' });
  const b = makeConfig({ model: 'mxbai-embed-large' });
  const sa = stampConfig(a.configPath).stamp;
  const sb = stampConfig(b.configPath).stamp;
  assert.notStrictEqual(sb, sa, 'a different embedder model must change the stamp');
});

test('every retrieval-relevant field changes the stamp when it changes', () => {
  const base = stampConfig(makeConfig().configPath).stamp;
  const variants = {
    'embedder.provider': { provider: 'openai' },
    'embedder.model': { model: 'mxbai-embed-large' },
    'embedder.dimensions': { dimensions: 1024 },
    'chunking.size': { size: 256 },
    'chunking.overlap': { overlap: 80 },
    'search.hybrid.enabled': { hybrid: 'false' },
  };
  assert.deepStrictEqual(
    Object.keys(variants).sort(),
    [...STAMPED_FIELDS].sort(),
    'this test must cover exactly the stamped field set',
  );
  for (const [field, over] of Object.entries(variants)) {
    const s = stampConfig(makeConfig(over).configPath).stamp;
    assert.notStrictEqual(s, base, `changing ${field} must change the stamp`);
  }
});

test('retrieval-irrelevant fields do NOT change the stamp', () => {
  const base = stampConfig(makeConfig().configPath).stamp;
  for (const over of [{ endpoint: 'http://127.0.0.1:11434' }, { parallelism: 16 }, { k: 90 }]) {
    const s = stampConfig(makeConfig(over).configPath).stamp;
    assert.strictEqual(s, base, `irrelevant change ${JSON.stringify(over)} must not move the stamp`);
  }
});

test('quoting a value does not change the stamp', () => {
  // `dimensions: 768` and `dimensions: "768"` mean the same thing; a stamp that
  // moved on requoting would false-alarm after any cosmetic config edit.
  const a = makeConfig().configPath;
  const b = makeConfig({ dimensions: '"768"', model: '"nomic-embed-text"', hybrid: '"true"' }).configPath;
  assert.strictEqual(stampConfig(b).stamp, stampConfig(a).stamp);
});

test('coerceScalar normalises the way a YAML 1.2 parser would', () => {
  assert.strictEqual(coerceScalar('768'), 768);
  assert.strictEqual(coerceScalar('"768"'), 768);
  assert.strictEqual(coerceScalar('true'), true);
  assert.strictEqual(coerceScalar("'true'"), true);
  assert.strictEqual(coerceScalar('nomic-embed-text'), 'nomic-embed-text');
  assert.strictEqual(coerceScalar('0.5'), 0.5);
});

test('MATCH after --write, and it exits 0', () => {
  const { configPath, stampPath } = makeConfig();
  writeStamp({ configPath, stampPath });
  const r = check({ configPath, stampPath });
  assert.strictEqual(r.status, 'MATCH');
  assert.strictEqual(r.ok, true);
  const cli = runTool(['--config', configPath, '--stamp', stampPath]);
  assert.strictEqual(cli.status, 0, `MATCH must exit 0, got ${cli.status}: ${cli.stdout}${cli.stderr}`);
  assert.ok(cli.stdout.includes('MATCH'));
});

test('MISMATCH when the embedder model changed after stamping — exits non-zero', () => {
  const { configPath, stampPath } = makeConfig();
  writeStamp({ configPath, stampPath });
  fs.writeFileSync(configPath, configYaml({ model: 'mxbai-embed-large' }));

  const r = check({ configPath, stampPath });
  assert.strictEqual(r.status, 'MISMATCH');
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.changedFields, ['embedder.model'], 'must name the field that moved');

  const cli = runTool(['--config', configPath, '--stamp', stampPath]);
  assert.notStrictEqual(cli.status, 0, 'MISMATCH must exit non-zero');
  assert.strictEqual(cli.status, 1);
  assert.ok(cli.stdout.includes('MISMATCH'));
  assert.ok(/rebuild/i.test(cli.stdout), 'must tell the operator to rebuild');
});

test('a timestamp-only edit after stamping still reports MATCH', () => {
  // The end-to-end version of the no-false-alarm property.
  const { configPath, stampPath } = makeConfig();
  writeStamp({ configPath, stampPath });
  fs.writeFileSync(configPath, configYaml({ lastIndexTime: '2026-09-09T01:02:03.44444-04:00' }));
  assert.strictEqual(check({ configPath, stampPath }).status, 'MATCH');
});

test('NO-STAMP is reported as failing, never as a pass', () => {
  const { configPath, stampPath } = makeConfig();
  assert.ok(!fs.existsSync(stampPath));

  const r = check({ configPath, stampPath });
  assert.strictEqual(r.status, 'NO-STAMP');
  assert.strictEqual(r.ok, false, 'NO-STAMP must never be ok:true');
  assert.strictEqual(r.actual, null);
  assert.ok(/unknown/i.test(r.detail), 'must say the build config is unknown');

  const cli = runTool(['--config', configPath, '--stamp', stampPath]);
  assert.notStrictEqual(cli.status, 0, 'a missing stamp must exit non-zero');
  assert.strictEqual(cli.status, 1);
  assert.ok(cli.stdout.includes('NO-STAMP'));
  assert.ok(!/\bMATCH\b/.test(cli.stdout.replace(/MISMATCH/g, '')), 'must not print MATCH');
});

test('a corrupt or bogus stamp file degrades to NO-STAMP, not a crash or a pass', () => {
  for (const body of ['{not json', '{}', '{"stamp":123}', '{"stamp":"deadbeef"}', '[]', 'null']) {
    const { configPath, stampPath } = makeConfig();
    fs.writeFileSync(stampPath, body);
    const r = check({ configPath, stampPath });
    assert.strictEqual(r.status, 'NO-STAMP', `${body} must read as NO-STAMP`);
    assert.strictEqual(r.ok, false, `${body} must not pass`);
  }
});

test('an unreadable config is NO-CONFIG and exits non-zero, not a pass', () => {
  const dir = scratch();
  const configPath = path.join(dir, 'does-not-exist.yaml');
  const stampPath = path.join(dir, 'stamp.json');
  const r = check({ configPath, stampPath });
  assert.strictEqual(r.status, 'NO-CONFIG');
  assert.strictEqual(r.ok, false);
  const cli = runTool(['--config', configPath, '--stamp', stampPath]);
  assert.strictEqual(cli.status, 2, 'unreadable config must exit 2');
});

test('a config missing a stamped field reports it instead of hiding it', () => {
  const dir = scratch();
  const configPath = path.join(dir, 'config.yaml');
  fs.writeFileSync(configPath, 'version: 1\nembedder:\n    provider: ollama\n');
  const { fields, missing } = readConfigFields(configPath);
  assert.deepStrictEqual(missing, [
    'embedder.model',
    'embedder.dimensions',
    'chunking.size',
    'chunking.overlap',
    'search.hybrid.enabled',
  ]);
  assert.strictEqual(fields['embedder.model'], null);
  const r = check({ configPath, stampPath: path.join(dir, 'stamp.json') });
  assert.ok(r.missingFields.length > 0, 'check() must surface missing fields');
});

test('the tool NEVER writes config.yaml — bytes and mtime survive check and write', () => {
  // The load/dump round-trip that corrupted watch.last_index_time and took the
  // whole index down must be structurally impossible here.
  const { configPath, stampPath } = makeConfig();
  const before = fs.readFileSync(configPath);
  const beforeMtime = fs.statSync(configPath).mtimeMs;

  check({ configPath, stampPath });
  writeStamp({ configPath, stampPath });
  check({ configPath, stampPath });
  runTool(['--config', configPath, '--stamp', stampPath]);
  runTool(['--write', '--config', configPath, '--stamp', stampPath]);

  assert.ok(before.equals(fs.readFileSync(configPath)), 'config.yaml bytes must be untouched');
  assert.strictEqual(fs.statSync(configPath).mtimeMs, beforeMtime, 'config.yaml mtime must be untouched');
  assert.ok(fs.readFileSync(configPath, 'utf8').includes('last_index_time: 2026-07-30T16:27:11.39988-04:00'),
    'the unquoted RFC3339 timestamp must survive verbatim');
});

test('--write records a readable sidecar and its stamp equals computeStamp', () => {
  const { configPath, stampPath } = makeConfig();
  const cli = runTool(['--write', '--config', configPath, '--stamp', stampPath, '--json']);
  assert.strictEqual(cli.status, 0, cli.stderr);
  const record = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
  assert.match(record.stamp, /^[0-9a-f]{64}$/);
  assert.strictEqual(record.stamp, computeStamp(readConfigFields(configPath).fields));
  assert.ok(record.stampedAt, 'sidecar records when it was stamped');
});

test('stamp is stable across runs and across processes', () => {
  const { configPath } = makeConfig();
  const a = stampConfig(configPath).stamp;
  const b = stampConfig(configPath).stamp;
  assert.strictEqual(a, b, 'same input must hash identically in-process');
  const out = spawnSync(process.execPath, ['-e',
    `process.stdout.write(require(${JSON.stringify(TOOL)}).stampConfig(${JSON.stringify(configPath)}).stamp)`,
  ], { encoding: 'utf8' });
  assert.strictEqual(out.stdout, a, 'stamp must not depend on process state');
});

test('paths are injectable — default stamp path sits beside the given config', () => {
  assert.strictEqual(defaultStampPath('/somewhere/.grepai/config.yaml'),
    '/somewhere/.grepai/index-config-stamp.json');
  // and nothing under a temp HOME is consulted when both paths are explicit
  const { configPath, stampPath } = makeConfig();
  writeStamp({ configPath, stampPath });
  const cli = runTool(['--config', configPath, '--stamp', stampPath], { HOME: '/nonexistent-home' });
  assert.strictEqual(cli.status, 0, `explicit paths must not need HOME: ${cli.stdout}${cli.stderr}`);
});

test('an unknown argument is a usage error, not a silent pass', () => {
  const r = runTool(['--rebuild-everything']);
  assert.strictEqual(r.status, 2);
  assert.ok(r.stderr.includes('Unknown argument'));
});
