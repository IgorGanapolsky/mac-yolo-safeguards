#!/usr/bin/env node
'use strict';

/**
 * BrightTALK weekly-rec process steal (2026-08-19 email):
 * interest-ranked digest of hidden agent-tool-call entry points.
 * Classes: PreToolUse unwired, dynamic tools, missing identity.
 *
 *   node tools/hidden-entry.js [--json] [--root DIR]
 *
 * Does NOT clone BrightTALK, SailPoint, Strike48, or ISO 42001 (PR #1868).
 * iso42001Certified is always false. autoApply is always false.
 * capturedRevenueUsd is always 0.
 */

const fs = require('fs');
const path = require('path');

const KIND_RANK = {
  pretooluse_unwired: { severity: 'P0', interest: 10 },
  dynamic_tools: { severity: 'P1', interest: 7 },
  missing_identity: { severity: 'P2', interest: 5 },
  pretooluse_wired: { severity: 'P3', interest: 1 },
  vendor_theater: { severity: 'P3', interest: 0 },
  webinar: { severity: 'P3', interest: 0 },
};

const VENDOR_THEATER = new Set([
  'brighttalk',
  'sailpoint',
  'strike48',
  'iso 42001',
  'iso42001',
  'iso/iec 42001',
]);

const DEMO_ENTRIES = [
  {
    id: 'pretooluse-missing-script',
    kind: 'pretooluse_unwired',
    wired: false,
    command: 'node hooks/missing-pretooluse.js',
    identity: 'fleet',
  },
  {
    id: 'mcp-dynamic-no-principal',
    kind: 'dynamic_tools',
    dynamicTools: true,
    identity: null,
    server: 'unlabeled-mcp',
  },
  {
    id: 'agent-unknown-principal',
    kind: 'missing_identity',
    identity: null,
    agent: 'unknown',
  },
  { id: 'iso42001-theater', kind: 'vendor_theater', vendor: 'ISO 42001' },
  { id: 'sailpoint-theater', kind: 'vendor_theater', vendor: 'SailPoint' },
  { id: 'strike48-theater', kind: 'vendor_theater', vendor: 'Strike48' },
  { id: 'brighttalk-webinar-load-all', kind: 'webinar', vendor: 'BrightTALK' },
];

function isVendorTheater(entry) {
  if (!entry) return false;
  if (entry.kind === 'vendor_theater' || entry.kind === 'webinar') return true;
  const blob = `${entry.vendor || ''} ${entry.id || ''} ${entry.title || ''}`.toLowerCase();
  for (const v of VENDOR_THEATER) {
    if (blob.includes(v)) return true;
  }
  return false;
}

function classify(entry) {
  const kind = (entry && entry.kind) || 'missing_identity';
  const meta = KIND_RANK[kind] || KIND_RANK.missing_identity;
  const theater = isVendorTheater(entry);
  return {
    id: entry && entry.id,
    kind: theater ? 'vendor_theater' : kind,
    severity: theater ? 'P3' : meta.severity,
    interest: theater ? 0 : meta.interest,
    wired: entry && entry.wired,
    identity: (entry && entry.identity) || null,
    vendor: (entry && entry.vendor) || null,
  };
}

function digest(entries, opts = {}) {
  const budget = Number.isFinite(opts.budget) ? opts.budget : 8;
  const list = Array.isArray(entries) ? entries : [];
  const classified = list.map(classify);
  const droppedTheater = classified.filter((c) => c.interest === 0);
  const ranked = classified
    .filter((c) => c.interest > 0)
    .sort((a, b) => b.interest - a.interest || String(a.id).localeCompare(String(b.id)));
  const selected = ranked.slice(0, budget).map((c) => ({
    id: c.id,
    kind: c.kind,
    severity: c.severity,
    interest: c.interest,
    identity: c.identity,
    autoApply: false,
  }));
  return {
    selected,
    skipped: list.length - selected.length,
    load_all_count: list.length,
    selected_count: selected.length,
    budget,
    load_all_exceeds_budget: list.length > budget,
    dropped_vendor_theater: droppedTheater.length,
    iso42001Certified: false,
    autoApply: false,
    capturedRevenueUsd: 0,
    control: 'pretooluse_and_identity',
    not_control: 'webinar_volume',
  };
}

function resolveCommandFile(command, root, vars = {}) {
  const raw = String(command || '').trim();
  if (!raw) return null;
  let expanded = raw;
  for (const [k, v] of Object.entries(vars)) {
    expanded = expanded.split(`{{${k}}}`).join(v);
  }
  const parts = expanded.split(/\s+/);
  const idx = parts[0] === 'node' || parts[0] === 'python' || parts[0] === 'python3' ? 1 : 0;
  const file = parts[idx];
  if (!file || file.startsWith('-')) return null;
  if (path.isAbsolute(file)) return file;
  return path.resolve(root || process.cwd(), file);
}

function scanHookConfig(config, opts = {}) {
  const root = opts.root || process.cwd();
  const vars = opts.vars || {};
  const findings = [];
  const pre = (((config || {}).hooks || {}).PreToolUse) || [];
  if (pre.length === 0) {
    findings.push({
      id: 'pretooluse-absent',
      kind: 'pretooluse_unwired',
      wired: false,
      identity: null,
    });
    return findings;
  }
  let i = 0;
  for (const matcher of pre) {
    const hooks = matcher.hooks || [];
    if (hooks.length === 0) {
      findings.push({
        id: `pretooluse-empty-${i}`,
        kind: 'pretooluse_unwired',
        matcher: matcher.matcher,
        wired: false,
        identity: matcher.identity || null,
      });
    }
    for (const hook of hooks) {
      const file = resolveCommandFile(hook.command, root, vars);
      const wired = Boolean(file && fs.existsSync(file));
      const identity = hook.identity || matcher.identity || null;
      const row = {
        id: `pretooluse-${i}`,
        kind: wired ? 'pretooluse_wired' : 'pretooluse_unwired',
        matcher: matcher.matcher,
        command: hook.command,
        file,
        wired,
        identity,
      };
      if (!identity) row.kind = wired ? 'missing_identity' : 'pretooluse_unwired';
      findings.push(row);
      i += 1;
    }
  }
  return findings;
}

function scanMcpConfig(config) {
  const servers = (config && config.mcpServers) || {};
  const findings = [];
  for (const [name, spec] of Object.entries(servers)) {
    const identity = spec.identity || spec.principal || null;
    const dynamicTools = spec.dynamicTools === true || spec.allowDynamicTools === true;
    if (dynamicTools && !identity) {
      findings.push({
        id: `mcp-dynamic-${name}`,
        kind: 'dynamic_tools',
        server: name,
        dynamicTools: true,
        identity: null,
      });
    } else if (!identity) {
      findings.push({
        id: `mcp-noid-${name}`,
        kind: 'missing_identity',
        server: name,
        identity: null,
      });
    }
  }
  return findings;
}

function scanRepo(root) {
  const findings = [];
  const hooksPath = path.join(root, 'hooks/grok-build-fleet/fleet-hooks.json');
  if (fs.existsSync(hooksPath)) {
    const cfg = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    const safety = path.join(root, 'hooks/grok-build-fleet/pre-tool-use-safety.js');
    findings.push(
      ...scanHookConfig(cfg, {
        root,
        vars: { SAFETY_HOOK: safety, SESSION_HOOK: path.join(root, 'hooks/grok-build-fleet/session-start-receipt.js') },
      })
    );
  }
  const mcpPath = path.join(root, '.mcp.json');
  if (fs.existsSync(mcpPath)) {
    const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    findings.push(...scanMcpConfig(mcp));
  }
  return findings;
}

function runCli(argv = process.argv.slice(2), extraEntries) {
  const demo = argv.includes('--demo') || !argv.includes('--repo');
  const repo = argv.includes('--repo');
  let root = process.cwd();
  const rootIdx = argv.indexOf('--root');
  if (rootIdx >= 0 && argv[rootIdx + 1]) root = argv[rootIdx + 1];
  const entries = [];
  if (demo) entries.push(...DEMO_ENTRIES);
  if (repo) entries.push(...scanRepo(root));
  if (Array.isArray(extraEntries)) entries.push(...extraEntries);
  return digest(entries);
}

module.exports = {
  DEMO_ENTRIES,
  classify,
  digest,
  scanHookConfig,
  scanMcpConfig,
  scanRepo,
  resolveCommandFile,
  runCli,
  KIND_RANK,
};

if (require.main === module) {
  const out = runCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(out)}\n`);
}
