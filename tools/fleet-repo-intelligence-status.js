#!/usr/bin/env node
'use strict';

/**
 * Fleet repo intelligence status — shared health for every agent at session start.
 * Primary: grepai isolated clones under ~/.hermes/semantic-index/
 * Secondary: hermes-context multi-repo doctor
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const INDEX_ROOT = path.join(HOME, '.hermes', 'semantic-index');
const DEFAULT_CLONE = path.join(INDEX_ROOT, 'mac-yolo-safeguards');

function sh(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    cwd: cwd || process.cwd(),
    timeout: 20000,
  });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function which(bin) {
  const r = sh('bash', ['-lc', `command -v ${bin}`]);
  return r.status === 0 ? r.stdout : null;
}

function grepaiStatus(clonePath) {
  if (!fs.existsSync(clonePath)) {
    return { ok: false, error: 'clone_missing', path: clonePath };
  }
  const r = sh('grepai', ['status'], clonePath);
  const text = r.stdout || r.stderr || '';
  const files = /Files indexed:\s*(\d+)/i.exec(text);
  const chunks = /Total chunks:\s*(\d+)/i.exec(text);
  const watcher = /Watcher:\s*(.+)/i.exec(text);
  const last = /Last updated:\s*(.+)/i.exec(text);
  const nFiles = files ? Number(files[1]) : 0;
  return {
    ok: r.status === 0 && nFiles > 0,
    path: clonePath,
    files: nFiles,
    chunks: chunks ? Number(chunks[1]) : null,
    watcher: watcher ? watcher[1].trim() : null,
    lastUpdated: last ? last[1].trim() : null,
    raw: text.slice(0, 500),
  };
}

function hermesContextDoctor() {
  const bin = which('hermes-context');
  if (!bin) return { ok: false, error: 'hermes-context_missing' };
  const r = sh(bin, ['doctor']);
  return {
    ok: r.status === 0 && /HERMES_CONTEXT_OK|ok=true|ollama_up=True/i.test(r.stdout + r.stderr),
    stdout: (r.stdout || r.stderr || '').slice(0, 400),
  };
}

function listClones() {
  if (!fs.existsSync(INDEX_ROOT)) return [];
  return fs
    .readdirSync(INDEX_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'logs')
    .map((d) => path.join(INDEX_ROOT, d.name));
}

function main() {
  const json = process.argv.includes('--json');
  const report = {
    updatedAt: new Date().toISOString(),
    product: 'fleet-repo-intelligence',
    equivalentTo: 'JetBrains Context (local grepai + hermes-context; jbcontext not required)',
    grepaiBinary: which('grepai'),
    jbcontextBinary: which('jbcontext'),
    hermesContextBinary: which('hermes-context'),
    clones: listClones().map(grepaiStatus),
    defaultClone: grepaiStatus(DEFAULT_CLONE),
    hermesContext: hermesContextDoctor(),
    mcpHint:
      'Repo .mcp.json → grepai mcp-serve ~/.hermes/semantic-index/mac-yolo-safeguards (Mac-local agents only)',
  };

  report.ok =
    Boolean(report.grepaiBinary) &&
    report.defaultClone.ok === true;

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }

  console.log('=== Fleet repo intelligence (JetBrains Context local equivalent) ===');
  console.log(`grepai: ${report.grepaiBinary || 'MISSING'}`);
  console.log(`jbcontext: ${report.jbcontextBinary || 'not installed (optional)'}`);
  console.log(`hermes-context: ${report.hermesContextBinary || 'MISSING'}`);
  const d = report.defaultClone;
  if (d.ok) {
    console.log(
      `index mac-yolo-safeguards: OK files=${d.files} chunks=${d.chunks} watcher=${d.watcher || '?'}`,
    );
    console.log(`  last: ${d.lastUpdated || 'unknown'}`);
  } else {
    console.log(
      `index mac-yolo-safeguards: FAIL ${d.error || 'empty'} — run: bash tools/install-fleet-repo-intelligence.sh`,
    );
  }
  if (report.hermesContext.ok) {
    console.log(`hermes-context doctor: OK`);
  } else {
    console.log(`hermes-context doctor: ${report.hermesContext.error || 'degraded'}`);
  }
  console.log('Agents: prefer MCP grepai_search / CLI `grepai search` before cold rg on unfamiliar code.');
  process.exit(report.ok ? 0 : 1);
}

main();
