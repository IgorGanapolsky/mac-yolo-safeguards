#!/usr/bin/env node
'use strict';

/**
 * List third-party apps with their on-disk size, and move one chosen app to the Trash.
 * Dry-run unless --execute. Never deletes. Never matches a name as a substring.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PROTECTED = new Set([
  'macyolosafeguards',
  'macyolo',
  'dayglass',
  'thumbgate',
  'ghostty',
  'finder',
  'safari',
  'wallpaper',
  'paperkit',
  'paperclip',
]);

const PAPER_ALIASES = new Set(['paper', 'papercompute', 'papercomputeco', 'tapes']);
const CLEANMYMAC_ALIASES = new Set(['cleanmymac', 'cleanmymac5', 'cleanmymacx', 'macpawcleanmymac']);
const PAPER_REL_PATHS = [
  '.local/bin/tapes',
  '.local/bin/tapesctl',
  '.tapes',
  'Library/Logs/tapes.err.log',
  'Library/Logs/tapes.out.log',
];
const CLEANMYMAC_LIBRARY_DIRS = [
  'Library/Application Support',
  'Library/Caches',
  'Library/Preferences',
  'Library/Logs',
  'Library/LaunchAgents',
  'Library/Application Scripts',
  'Library/Containers',
  'Library/Group Containers',
  'Library/HTTPStorages',
  'Library/WebKit',
];
function normName(value) {
  return String(value || '')
    .replace(/\.app$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function dirKilobytes(target) {
  const out = execFileSync('/usr/bin/du', ['-sk', target], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 1024 * 1024,
  });
  const kb = Number.parseInt(String(out).split(/\s/)[0], 10);
  return Number.isFinite(kb) ? kb : 0;
}

function bundleIdOf(appPath) {
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  if (!fs.existsSync(plist)) return '';
  try {
    return execFileSync(
      '/usr/bin/plutil',
      ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', plist],
      { encoding: 'utf8', timeout: 4000 }
    ).trim();
  } catch {
    return '';
  }
}

function bytesOf(target) {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (stat.isFile()) return stat.size;
  return dirKilobytes(target) * 1024;
}

function spotlightBytes(appPath) {
  try {
    const out = execFileSync('/usr/bin/mdls', ['-name', 'kMDItemPhysicalSize', '-raw', appPath], {
      encoding: 'utf8',
      timeout: 4000,
    }).trim();
    const n = Number(out);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    /* Spotlight has no size for this bundle. */
  }
  try {
    return dirKilobytes(appPath) * 1024;
  } catch {
    return 0;
  }
}

function listDuApps(dir) {
  if (!fs.existsSync(dir)) return [];
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const apps = [];
  for (const name of names) {
    if (!name.endsWith('.app')) continue;
    const appPath = path.join(dir, name);
    apps.push({ appPath, bytes: spotlightBytes(appPath) });
  }
  return apps;
}

function paperPaths(home) {
  return PAPER_REL_PATHS.map((rel) => path.join(home, rel)).filter((p) => fs.existsSync(p));
}

function cleanMyMacPaths(home) {
  const found = [];
  for (const appCand of ['/Applications/CleanMyMac_5.app', '/Applications/CleanMyMac X.app', path.join(home, 'Applications', 'CleanMyMac_5.app')]) {
    if (fs.existsSync(appCand)) found.push(appCand);
  }
  for (const rel of CLEANMYMAC_LIBRARY_DIRS) {
    const dir = path.join(home, rel);
    if (!fs.existsSync(dir)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (/^CleanMyMac/i.test(ent) || /com\.macpaw\.CleanMyMac/i.test(ent)) {
        found.push(path.join(dir, ent));
      }
    }
  }
  return [...new Set(found)].filter((p) => fs.existsSync(p));
}
function listUninstallApps(options = {}) {
  const home = options.home || os.homedir();
  const appDirs = options.appDirs || ['/Applications', path.join(home, 'Applications')];
  const apps = [];
  for (const dir of appDirs) {
    for (const row of listDuApps(dir)) {
      const name = path.basename(row.appPath, '.app');
      const id = bundleIdOf(row.appPath);
      if (id.startsWith('com.apple.')) continue;
      if (PROTECTED.has(normName(name))) continue;
      apps.push({
        name,
        bytes: row.bytes,
        path: row.appPath,
        bundleId: id,
        kind: 'app',
      });
    }
  }
  const tapes = paperPaths(home);
  if (tapes.length) {
    const bytes = tapes.reduce((sum, p) => sum + bytesOf(p), 0);
    apps.push({
      name: 'Paper',
      bytes,
      path: tapes[0],
      bundleId: 'papercomputeco.tapes',
      kind: 'cli',
      paths: tapes,
    });
  }
  apps.sort((a, b) => b.bytes - a.bytes);
  return { ok: true, apps };
}

function leftoverDirs(home, appName, bundleId) {
  const roots = [
    'Library/Application Support',
    'Library/Caches',
    'Library/Preferences',
    'Library/Logs',
    'Library/LaunchAgents',
  ];
  const wanted = new Set(
    [
      appName,
      bundleId,
      bundleId ? `${bundleId}.plist` : '',
      appName ? `${appName}.plist` : '',
    ].filter(Boolean)
  );
  const found = [];
  for (const rel of roots) {
    const dir = path.join(home, rel);
    if (!fs.existsSync(dir)) continue;
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const ent of names) {
      if (wanted.has(ent) || (bundleId && ent.startsWith(`${bundleId}.`))) {
        found.push(path.join(dir, ent));
      }
    }
  }
  return found;
}

function moveToTrash(src, trashDir) {
  fs.mkdirSync(trashDir, { recursive: true });
  const base = path.basename(src);
  let dest = path.join(trashDir, base);
  if (fs.existsSync(dest)) dest = path.join(trashDir, `${Date.now()}-${base}`);
  fs.renameSync(src, dest);
  return dest;
}

function uninstallNamed(appName, options = {}) {
  const dryRun = options.dryRun !== false;
  const clean = String(appName || '').replace(/\.app$/i, '').trim();
  const needle = normName(clean);
  if (!clean || clean.includes('/') || clean.includes('..') || needle.length < 3) {
    return { ok: false, error: 'Name must be at least 3 letters and a single app name.' };
  }
  if (PROTECTED.has(needle)) {
    return { ok: false, error: `${clean} stays installed.` };
  }
  const home = options.home || os.homedir();
  const listed = listUninstallApps(options);
  let targets = [];
  if (PAPER_ALIASES.has(needle)) {
    targets = paperPaths(home);
  } else if (CLEANMYMAC_ALIASES.has(needle)) {
    targets = cleanMyMacPaths(home);
  }
  if (!targets.length) {
    const hit = listed.apps.find((app) => normName(app.name) === needle);
    if (!hit) return { ok: false, error: `No installed app named ${clean}.`, apps: listed.apps };
    targets = [hit.path];
    if (hit.kind === 'app') {
      targets.push(...leftoverDirs(home, hit.name, hit.bundleId));
    }
  }
  const unique = [...new Set(targets)].filter((p) => fs.existsSync(p));
  const beforeBytes = unique.reduce((sum, p) => sum + bytesOf(p), 0);
  if (!unique.length) return { ok: false, error: `${clean} is not on disk.` };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const trashDir = path.join(home, '.Trash', `mac-yolo-uninstalled-${stamp}`);
  const moved = [];
  if (!dryRun) {
    for (const src of unique) {
      if (src.endsWith('.plist') && src.includes('/Library/LaunchAgents/')) {
        try {
          execFileSync('/bin/launchctl', ['unload', src], { stdio: 'ignore', timeout: 3000 });
        } catch {
          /* ignore if not loaded */
        }
      }
      moved.push(moveToTrash(src, trashDir));
    }
    try {
      const oplog = path.join(home, '.hermes', 'logs', 'mac-yolo-operations.jsonl');
      fs.mkdirSync(path.dirname(oplog), { recursive: true });
      fs.appendFileSync(
        oplog,
        `${JSON.stringify({
          ts: new Date().toISOString(),
          timestamp: new Date().toISOString(),
          action: 'app_uninstall',
          status: 'ok',
          appName: clean,
          movedCount: moved.length,
          beforeBytes,
          details: { target: clean, freedMB: Number((beforeBytes / (1024 * 1024)).toFixed(2)), movedCount: moved.length },
        })}\n`,
        'utf8'
      );
    } catch {
      /* ignore oplog write errors */
    }
  }
  return {
    ok: true,
    appName: clean,
    dryRun,
    beforeBytes,
    movedCount: moved.length,
    trashDir: dryRun ? null : trashDir,
    paths: unique,
    moved,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const execute = argv.includes('--execute');
  if (argv.includes('--list')) {
    console.log(JSON.stringify(listUninstallApps(), null, 2));
    return;
  }
  const idx = argv.indexOf('--uninstall');
  if (idx !== -1 && argv[idx + 1]) {
    const out = uninstallNamed(argv[idx + 1], { dryRun: !execute });
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 1);
  }
  console.log(JSON.stringify({ ok: false, error: 'Use --list or --uninstall <name> [--execute]' }));
  process.exit(1);
}

module.exports = {
  listUninstallApps,
  uninstallNamed,
  normName,
  PROTECTED,
};

if (require.main === module) main();
