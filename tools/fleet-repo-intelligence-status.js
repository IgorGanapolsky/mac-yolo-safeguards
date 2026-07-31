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
const { verifyGeneration } = require('./grepai-mcp-fresh.js');

const HOME = os.homedir();
const INDEX_ROOT = path.resolve(
  process.env.HERMES_SEMANTIC_INDEX_ROOT || path.join(HOME, '.hermes', 'semantic-index'),
);
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

function parseIndexStatus(text) {
  const files = /Files indexed:\s*(\d+)/i.exec(text);
  const chunks = /Total chunks:\s*(\d+)/i.exec(text);
  const watcher = /Watcher:\s*(.+)/i.exec(text);
  const last = /Last updated:\s*(.+)/i.exec(text);
  return {
    files: files ? Number(files[1]) : 0,
    chunks: chunks ? Number(chunks[1]) : 0,
    watcher: watcher ? watcher[1].trim() : null,
    lastUpdated: last ? last[1].trim() : null,
  };
}

function grepaiStatus(clonePath) {
  if (!fs.existsSync(clonePath)) {
    return { ok: false, error: 'clone_missing', path: clonePath };
  }
  const r = sh('grepai', ['status'], clonePath);
  const text = r.stdout || r.stderr || '';
  const parsed = parseIndexStatus(text);
  const nFiles = parsed.files;
  const generation = verifyGeneration({ projectPath: clonePath });
  const nChunks = parsed.chunks;
  return {
    ok: r.status === 0 && nFiles > 0 && nChunks > 0 && generation.ok,
    path: clonePath,
    files: nFiles,
    chunks: nChunks,
    watcher: parsed.watcher,
    lastUpdated: parsed.lastUpdated,
    generation: {
      ok: generation.ok,
      generationId: generation.generationId,
      indexedSha: generation.indexedSha,
      problems: generation.problems,
    },
    raw: text.slice(0, 500),
  };
}

function launchAgentStatus() {
  if (process.platform !== 'darwin') return { required: false, loaded: null };
  const domain = `gui/${process.getuid()}`;
  const label = 'com.igor.fleet-repo-intelligence';
  const result = sh('launchctl', ['print', `${domain}/${label}`]);
  return {
    required: true,
    loaded: result.status === 0,
    detail: (result.stdout || result.stderr).slice(0, 300),
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
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'logs')
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
    launchAgent: launchAgentStatus(),
    mcpHint:
      'Repo .mcp.json → grepai-mcp-fresh.js → grepai mcp-serve (source-bound generations only)',
  };

  report.ok =
    Boolean(report.grepaiBinary) &&
    report.defaultClone.ok === true &&
    (!report.launchAgent.required || report.launchAgent.loaded === true);

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
    console.log(`  generation: ${d.generation.generationId} @ ${d.generation.indexedSha}`);
  } else {
    const generationProblems = d.generation?.problems?.map((p) => p.code).join(',');
    console.log(
      `index mac-yolo-safeguards: FAIL ${generationProblems || d.error || 'empty'} — reconciler will retry`,
    );
  }
  if (report.hermesContext.ok) {
    console.log(`hermes-context doctor: OK`);
  } else {
    console.log(`hermes-context doctor: ${report.hermesContext.error || 'degraded'}`);
  }
  console.log(`reconciler LaunchAgent: ${report.launchAgent.loaded === false ? 'MISSING' : 'OK'}`);
  console.log('Agents: prefer MCP grepai_search / CLI `grepai search` before cold rg on unfamiliar code.');
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  grepaiStatus,
  hermesContextDoctor,
  launchAgentStatus,
  listClones,
  parseIndexStatus,
};

if (require.main === module) main();
