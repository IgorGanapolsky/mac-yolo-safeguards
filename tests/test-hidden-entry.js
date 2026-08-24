#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools/hidden-entry.js');
const {
  DEMO_ENTRIES,
  digest,
  classify,
  scanHookConfig,
  scanMcpConfig,
  runCli,
} = require(TOOL);

function main() {
  const theater = classify({ id: 'iso42001-theater', kind: 'vendor_theater', vendor: 'ISO 42001' });
  assert.strictEqual(theater.interest, 0);
  assert.strictEqual(theater.kind, 'vendor_theater');

  const unwired = classify({
    id: 'pretooluse-missing-script',
    kind: 'pretooluse_unwired',
    wired: false,
  });
  assert.strictEqual(unwired.severity, 'P0');
  assert.strictEqual(unwired.interest, 10);

  const out = digest(DEMO_ENTRIES, { budget: 8 });
  assert.strictEqual(out.iso42001Certified, false);
  assert.strictEqual(out.autoApply, false);
  assert.strictEqual(out.capturedRevenueUsd, 0);
  assert.strictEqual(out.not_control, 'webinar_volume');
  assert.strictEqual(out.control, 'pretooluse_and_identity');
  assert.strictEqual(out.selected_count, 3);
  assert.ok(out.dropped_vendor_theater >= 4, 'ISO/SailPoint/Strike48/BrightTALK dropped');
  assert.ok(out.selected.some((r) => r.id === 'pretooluse-missing-script'));
  assert.ok(out.selected.some((r) => r.id === 'mcp-dynamic-no-principal'));
  assert.ok(out.selected.some((r) => r.id === 'agent-unknown-principal'));
  assert.ok(!out.selected.some((r) => /iso|sail|strike|brighttalk/i.test(r.id)));
  assert.ok(out.selected.every((r) => r.autoApply === false));

  const webinars = Array.from({ length: 20 }, (_, i) => ({
    id: `webinar-${i}`,
    kind: 'webinar',
    vendor: 'BrightTALK',
    title: `Weekly rec ${i}`,
  }));
  const loadAll = digest(
    [
      { id: 'pretooluse-missing-script', kind: 'pretooluse_unwired', wired: false },
      ...webinars,
    ],
    { budget: 8 }
  );
  assert.strictEqual(loadAll.load_all_count, 21);
  assert.strictEqual(loadAll.load_all_exceeds_budget, true);
  assert.strictEqual(loadAll.selected_count, 1);
  assert.strictEqual(loadAll.selected[0].id, 'pretooluse-missing-script');
  assert.ok(loadAll.dropped_vendor_theater >= 20);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-entry-'));
  const wired = path.join(dir, 'wired.js');
  fs.writeFileSync(wired, 'module.exports = {};\n');
  const cfg = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          identity: 'fleet',
          hooks: [{ type: 'command', command: `node ${wired}` }],
        },
        {
          matcher: 'Write',
          hooks: [{ type: 'command', command: 'node hooks/does-not-exist.js' }],
        },
      ],
    },
  };
  const scanned = scanHookConfig(cfg, { root: dir });
  assert.ok(scanned.some((f) => f.kind === 'pretooluse_wired' && f.wired === true));
  assert.ok(scanned.some((f) => f.kind === 'pretooluse_unwired' && f.wired === false));

  const empty = scanHookConfig({ hooks: {} }, { root: dir });
  assert.strictEqual(empty[0].kind, 'pretooluse_unwired');

  const mcp = scanMcpConfig({
    mcpServers: {
      labeled: { command: 'x', identity: 'grok' },
      dynamo: { command: 'y', dynamicTools: true },
      ghost: { command: 'z' },
    },
  });
  assert.ok(mcp.some((f) => f.id === 'mcp-dynamic-dynamo' && f.kind === 'dynamic_tools'));
  assert.ok(mcp.some((f) => f.id === 'mcp-noid-ghost' && f.kind === 'missing_identity'));
  assert.ok(!mcp.some((f) => f.id === 'mcp-dynamic-labeled' || f.id === 'mcp-noid-labeled'));

  const cli = spawnSync(process.execPath, [TOOL, '--json', '--demo'], {
    encoding: 'utf8',
    cwd: ROOT,
    timeout: 5_000,
  });
  assert.strictEqual(cli.status, 0, cli.stderr || cli.stdout);
  const parsed = JSON.parse(cli.stdout);
  assert.strictEqual(parsed.iso42001Certified, false);
  assert.strictEqual(parsed.autoApply, false);
  assert.strictEqual(parsed.capturedRevenueUsd, 0);
  assert.ok(parsed.selected.some((r) => r.kind === 'pretooluse_unwired'));

  const viaFn = runCli(['--demo']);
  assert.strictEqual(viaFn.iso42001Certified, false);

  process.stdout.write(
    `test-hidden-entry: PASS selected=${parsed.selected.length} ` +
      `dropped_theater=${parsed.dropped_vendor_theater} ` +
      `iso42001Certified=false autoApply=false capturedRevenueUsd=0 ` +
      `load_all_webinars_selected=0\n`
  );
}

main();
