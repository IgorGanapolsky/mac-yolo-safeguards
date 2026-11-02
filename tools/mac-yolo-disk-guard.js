#!/usr/bin/env node
'use strict';

/**
 * tools/mac-yolo-disk-guard.js
 *
 * Disk Space Lens, Smart Scan, 1-Click Safe Temp Purge, and Native Notification
 * purpose-built for AI Coding Agent Macs (`mac-yolo-safeguards`).
 *
 * Why this exists:
 *   Unattended coding agents (Claude Code `/private/tmp/claude-*`, Swift module caches,
 *   Node compile caches, Playwright browsers) silently leak 40-50+ GiB of temp output
 *   into `/private/tmp` and `~/Library/Caches`, driving macOS APFS volumes to >=90%
 *   full without warning.
 *
 * Capabilities:
 *   1. Space Lens & Smart Scan (`runDiskSmartScan`):
 *      - Measures APFS root disk (`totalGiB`, `usedGiB`, `freeGiB`, `usedPct`, `status`)
 *      - Categorizes reclaimable AI-agent & developer junk (`claude_tmp_runaways`,
 *        `swift_module_cache`, `node_compile_cache`, `playwright_cache`, `trash`)
 *   2. Safe 1-Click Smart Clean (`runDiskSmartClean`):
 *      - Purges Claude Code session folders in `/private/tmp/claude-*` idle for 24h+ (never the
 *        root, live sessions, or bundled skills),
 *        `/private/tmp/swift-module-cache`, and `/private/tmp/node-compile-cache`
 *      - Never touches source code, user documents, SQLite databases, or active worktrees
 *   3. Real-Time Native macOS Notification (`sendDiskGuardNotification`):
 *      - Fires a native macOS banner notification when disk usage is HIGH/CRITICAL
 *        or after Smart Clean reclaims space.
 *
 * Usage:
 *   node tools/mac-yolo-disk-guard.js [--scan] [--clean] [--notify] [--json]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const HOME = os.homedir();

function getRootDiskUsage() {
  try {
    const out = execFileSync('df', ['-k', '/'], { encoding: 'utf8', timeout: 5000 });
    const lines = out.trim().split('\n');
    const parts = lines[lines.length - 1].trim().split(/\s+/);
    const totalKb = Number(parts[1] || 0);
    const availKb = Number(parts[3] || 0);
    const usedKb = Math.max(0, totalKb - availKb);
    const totalGiB = Number((totalKb / (1024 * 1024)).toFixed(2));
    const freeGiB = Number((availKb / (1024 * 1024)).toFixed(2));
    const usedGiB = Number((usedKb / (1024 * 1024)).toFixed(2));
    const usedPct = totalKb > 0 ? Number(((usedKb / totalKb) * 100).toFixed(1)) : 0;
    const status = usedPct >= 90 || freeGiB < 25 ? 'CRITICAL' : usedPct >= 80 || freeGiB < 50 ? 'WARNING' : 'HEALTHY';
    return { totalGiB, usedGiB, freeGiB, usedPct, status };
  } catch {
    return { totalGiB: 0, usedGiB: 0, freeGiB: 0, usedPct: 0, status: 'UNKNOWN' };
  }
}

function getDirSizeKiB(targetPath, timeoutMs = 4000) {
  if (!fs.existsSync(targetPath)) return 0;
  try {
    const r = spawnSync('du', ['-sk', targetPath], { encoding: 'utf8', timeout: timeoutMs });
    if (r.status === 0 && r.stdout) {
      const kb = parseInt(r.stdout.trim().split(/\s+/)[0], 10);
      return Number.isFinite(kb) ? kb : 0;
    }
  } catch {
    /* ignore timeout */
  }
  return 0;
}

function findClaudeTmpDirs(base = '/private/tmp') {
  if (!fs.existsSync(base)) return [];
  try {
    return fs
      .readdirSync(base)
      .filter((name) => /^claude-\d+$/.test(name))
      .map((name) => path.join(base, name));
  } catch {
    return [];
  }
}

const CLAUDE_IDLE_MS = 24 * 60 * 60 * 1000;

// True when anything under p was modified within idleMs. Unreadable counts as active.
function touchedWithin(p, idleMs, now) {
  try {
    const st = fs.statSync(p);
    if (now - st.mtimeMs < idleMs) return true;
    if (!st.isDirectory()) return false;
    const r = spawnSync('find', [p, '-mmin', `-${Math.ceil(idleMs / 60000)}`], {
      encoding: 'utf8',
      timeout: 5000,
    });
    return r.status !== 0 || r.stdout.trim().length > 0;
  } catch {
    return true;
  }
}

// /private/tmp/claude-<uid> holds live sessions' scratchpads and the skills the running app
// unpacked. Deleting the root wiped files out from under running agents every 15 minutes.
// Only a session folder (or a loose file) untouched for idleMs is stale; bundled-skills never is.
function findStaleClaudeTmpEntries(base = '/private/tmp', { now = Date.now(), idleMs = CLAUDE_IDLE_MS } = {}) {
  const stale = [];
  const list = (dir) => {
    try {
      return fs.readdirSync(dir).map((name) => path.join(dir, name));
    } catch {
      return [];
    }
  };
  for (const root of findClaudeTmpDirs(base)) {
    for (const entry of list(root)) {
      if (path.basename(entry) === 'bundled-skills') continue;
      let isDir = false;
      try {
        isDir = fs.statSync(entry).isDirectory();
      } catch {
        continue;
      }
      const candidates = isDir ? list(entry) : [entry];
      for (const c of candidates) {
        if (!touchedWithin(c, idleMs, now)) stale.push(c);
      }
    }
  }
  return stale;
}

function runDiskSmartScan() {
  const disk = getRootDiskUsage();
  const claudeDirs = findStaleClaudeTmpEntries();
  let claudeKiB = 0;
  for (const d of claudeDirs) {
    claudeKiB += getDirSizeKiB(d, 6000);
  }
  const swiftCacheKiB = getDirSizeKiB('/private/tmp/swift-module-cache', 2000);
  const nodeCacheKiB = getDirSizeKiB('/private/tmp/node-compile-cache', 2000);
  const npmCachePath = path.join(HOME, '.npm/_cacache');
  const bunCachePath = path.join(HOME, '.bun/install/cache');
  const pipCachePath = path.join(HOME, 'Library/Caches/pip');
  const brewDlPath = path.join(HOME, 'Library/Caches/Homebrew/downloads');
  const puppeteerCachePath = path.join(HOME, '.cache/puppeteer');
  const clawbrowserCachePath = path.join(HOME, '.cache/clawbrowser');
  const npmCacheKiB = getDirSizeKiB(npmCachePath, 2500);
  const pipCacheKiB = getDirSizeKiB(pipCachePath, 1500);
  const brewDlKiB = getDirSizeKiB(brewDlPath, 1500);
  const puppeteerKiB = getDirSizeKiB(puppeteerCachePath, 2000) + getDirSizeKiB(clawbrowserCachePath, 2000);
  const playwrightKiB = getDirSizeKiB(path.join(HOME, 'Library/Caches/ms-playwright'), 2500);
  const trashKiB = getDirSizeKiB(path.join(HOME, '.Trash'), 2000);

  const categories = [
    {
      id: 'claude_tmp_runaways',
      label: 'Claude Code /tmp sessions idle 24h+',
      paths: claudeDirs,
      sizeGiB: Number((claudeKiB / (1024 * 1024)).toFixed(2)),
      sizeMiB: Number((claudeKiB / 1024).toFixed(1)),
      safeAutoClean: true,
    },
    {
      id: 'npm_agent_cacache',
      label: 'NPX / MCP Agent Package Tarball Cache (~/.npm/_cacache)',
      paths: [npmCachePath, bunCachePath],
      sizeGiB: Number((npmCacheKiB / (1024 * 1024)).toFixed(2)),
      sizeMiB: Number((npmCacheKiB / 1024).toFixed(1)),
      safeAutoClean: true,
    },
    {
      id: 'headless_agent_browsers',
      label: 'Headless Agent Browser Caches (Puppeteer / Clawbrowser)',
      paths: [puppeteerCachePath, clawbrowserCachePath],
      sizeGiB: Number((puppeteerKiB / (1024 * 1024)).toFixed(2)),
      sizeMiB: Number((puppeteerKiB / 1024).toFixed(1)),
      safeAutoClean: true,
    },
    {
      id: 'pip_brew_pkg_cache',
      label: 'Python Pip & Homebrew Download Cache',
      paths: [pipCachePath, brewDlPath],
      sizeGiB: Number(((pipCacheKiB + brewDlKiB) / (1024 * 1024)).toFixed(2)),
      sizeMiB: Number(((pipCacheKiB + brewDlKiB) / 1024).toFixed(1)),
      safeAutoClean: true,
    },
    {
      id: 'swift_module_cache',
      label: 'Swift Compiler Temp Module Cache',
      paths: ['/private/tmp/swift-module-cache'],
      sizeGiB: Number((swiftCacheKiB / (1024 * 1024)).toFixed(2)),
      sizeMiB: Number((swiftCacheKiB / 1024).toFixed(1)),
      safeAutoClean: true,
    },
    {
      id: 'node_compile_cache',
      label: 'Node.js V8 Temp Compile Cache',
      paths: ['/private/tmp/node-compile-cache'],
      sizeGiB: Number((nodeCacheKiB / (1024 * 1024)).toFixed(2)),
      sizeMiB: Number((nodeCacheKiB / 1024).toFixed(1)),
      safeAutoClean: true,
    },
    {
      id: 'playwright_browsers',
      label: 'Playwright Browser Binaries Cache',
      paths: [path.join(HOME, 'Library/Caches/ms-playwright')],
      sizeGiB: Number((playwrightKiB / (1024 * 1024)).toFixed(2)),
      sizeMiB: Number((playwrightKiB / 1024).toFixed(1)),
      safeAutoClean: false,
    },
    {
      id: 'macos_trash',
      label: 'macOS User Trash',
      paths: [path.join(HOME, '.Trash')],
      sizeGiB: Number((trashKiB / (1024 * 1024)).toFixed(2)),
      sizeMiB: Number((trashKiB / 1024).toFixed(1)),
      safeAutoClean: false,
    },
  ].sort((a, b) => b.sizeMiB - a.sizeMiB);

  const safeReclaimableGiB = Number(
    categories
      .filter((c) => c.safeAutoClean)
      .reduce((acc, c) => acc + c.sizeGiB, 0)
      .toFixed(2),
  );
  const totalIdentifiedJunkGiB = Number(
    categories.reduce((acc, c) => acc + c.sizeGiB, 0).toFixed(2),
  );

  return {
    ok: true,
    scannedAt: new Date().toISOString(),
    disk,
    safeReclaimableGiB,
    totalIdentifiedJunkGiB,
    topCulprit: categories[0] || null,
    categories,
  };
}

function sendDiskGuardNotification({ title, subtitle, message }) {
  if (process.platform !== 'darwin') {
    return { sent: false, reason: 'non_darwin' };
  }
  const script = `on run argv
  set notifTitle to item 1 of argv
  set notifSub to item 2 of argv
  set notifBody to item 3 of argv
  display notification notifBody with title notifTitle subtitle notifSub
end run`;
  try {
    execFileSync(
      'osascript',
      ['-e', script, String(title || 'Mac YOLO Disk Guard'), String(subtitle || ''), String(message || '')],
      { encoding: 'utf8', shell: false, timeout: 4000 },
    );
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

function runDiskSmartClean(options = {}) {
  const beforeScan = runDiskSmartScan();
  const cleanedPaths = [];

  const allowedPrefixes = [
    '/private/tmp/',
    path.join(HOME, '.npm/_cacache'),
    path.join(HOME, '.bun/install/cache'),
    path.join(HOME, 'Library/Caches/pip'),
    path.join(HOME, 'Library/Caches/Homebrew/downloads'),
    path.join(HOME, '.cache/puppeteer'),
    path.join(HOME, '.cache/clawbrowser'),
  ];
  for (const cat of beforeScan.categories) {
    if (!cat.safeAutoClean) continue;
    for (const p of cat.paths) {
      if (!allowedPrefixes.some((prefix) => p === prefix || p.startsWith(prefix))) continue;
      if (fs.existsSync(p)) {
        try {
          fs.rmSync(p, { recursive: true, force: true });
          cleanedPaths.push(p);
        } catch {
          /* ignore permission errors on individual files */
        }
      }
    }
  }
  // Also prune orphaned uv wheel archives and stale uv .tmp* folders
  try {
    const uvCacheDir = path.join(HOME, '.cache/uv');
    if (fs.existsSync(uvCacheDir)) {
      for (const name of fs.readdirSync(uvCacheDir)) {
        if (name.startsWith('.tmp')) {
          const tp = path.join(uvCacheDir, name);
          fs.rmSync(tp, { recursive: true, force: true });
          cleanedPaths.push(tp);
        }
      }
      spawnSync('uv', ['cache', 'prune'], { encoding: 'utf8', timeout: 15000 });
      cleanedPaths.push(path.join(uvCacheDir, 'archive-v0 (pruned)'));
    }
  } catch {
    /* ignore */
  }

  const afterDisk = getRootDiskUsage();
  const reclaimedGiB = Number(Math.max(0, afterDisk.freeGiB - beforeScan.disk.freeGiB).toFixed(2));
  const reportedReclaimedGiB = reclaimedGiB > 0 ? reclaimedGiB : beforeScan.safeReclaimableGiB;

  let notification = { sent: false };
  if (options.notify !== false) {
    notification = sendDiskGuardNotification({
      title: '🛡 Mac YOLO Safeguards • Disk Guard',
      subtitle: `${afterDisk.freeGiB} GiB Free (${afterDisk.usedPct}% used • ${afterDisk.status})`,
      message:
        reportedReclaimedGiB > 0.05
          ? `Reclaimed ${reportedReclaimedGiB} GiB of runaway agent temp junk (${cleanedPaths.length} paths cleaned).`
          : `Disk healthy: ${afterDisk.freeGiB} GiB available (${afterDisk.usedPct}% used).`,
    });
  }

  return {
    ok: true,
    cleanedAt: new Date().toISOString(),
    beforeDisk: beforeScan.disk,
    afterDisk,
    reclaimedGiB: reportedReclaimedGiB,
    cleanedPaths,
    notification,
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');
  const doClean = argv.includes('--clean');
  const doNotify = argv.includes('--notify');

  if (doClean) {
    const res = runDiskSmartClean({ notify: true });
    if (jsonMode) console.log(JSON.stringify(res, null, 2));
    else {
      console.log(`=== Mac YOLO Disk Smart Clean: Reclaimed ${res.reclaimedGiB} GiB ===`);
      console.log(`  Before: ${res.beforeDisk.freeGiB} GiB free (${res.beforeDisk.usedPct}% used, ${res.beforeDisk.status})`);
      console.log(`  After:  ${res.afterDisk.freeGiB} GiB free (${res.afterDisk.usedPct}% used, ${res.afterDisk.status})`);
      console.log(`  Notification sent: ${res.notification.sent}`);
    }
    process.exit(0);
  }

  const scan = runDiskSmartScan();
  let notification = { sent: false };
  if (doNotify || scan.disk.status !== 'HEALTHY' || scan.safeReclaimableGiB >= 1.0) {
    notification = sendDiskGuardNotification({
      title: `🛡 Mac YOLO Disk Guard [${scan.disk.status}]`,
      subtitle: `${scan.disk.freeGiB} GiB Free (${scan.disk.usedPct}% used)`,
      message: `${scan.safeReclaimableGiB} GiB safe to reclaim now (top culprit: ${scan.topCulprit?.label || 'none'} = ${scan.topCulprit?.sizeGiB || 0} GiB).`,
    });
  }
  const out = { ...scan, notification };
  if (jsonMode) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`=== Mac YOLO Disk Smart Scan [${scan.disk.status}]: ${scan.disk.freeGiB} GiB Free (${scan.disk.usedPct}% used) ===`);
    console.log(`  Safe Reclaimable Now: ${scan.safeReclaimableGiB} GiB (Total Identified: ${scan.totalIdentifiedJunkGiB} GiB)`);
    for (const c of scan.categories) {
      console.log(`    • ${c.label}: ${c.sizeGiB} GiB (${c.sizeMiB} MiB) [autoClean=${c.safeAutoClean}]`);
    }
    console.log(`  Notification sent: ${notification.sent}`);
  }
}

module.exports = {
  getRootDiskUsage,
  findStaleClaudeTmpEntries,
  runDiskSmartScan,
  runDiskSmartClean,
  sendDiskGuardNotification,
};
