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
  const liveClaudeRoots = findClaudeTmpDirs();
  let liveClaudeKiB = 0;
  for (const r of liveClaudeRoots) {
    liveClaudeKiB += getDirSizeKiB(r, 4000);
  }
  const activeClaudeKiB = Math.max(0, liveClaudeKiB - claudeKiB);

  const swiftCacheKiB = getDirSizeKiB('/private/tmp/swift-module-cache', 3000);
  const nodeCacheKiB = getDirSizeKiB('/private/tmp/node-compile-cache', 3000);
  const npmCachePath = path.join(HOME, '.npm', '_cacache');
  const npmCacheKiB = getDirSizeKiB(npmCachePath, 4000);
  const brewCachePath = path.join(HOME, 'Library', 'Caches', 'Homebrew');
  const brewCacheKiB = getDirSizeKiB(brewCachePath, 3000);
  const pipCachePath = path.join(HOME, 'Library', 'Caches', 'pip');
  const tsCachePath = path.join(HOME, 'Library', 'Caches', 'typescript');
  const devToolKiB = getDirSizeKiB(pipCachePath, 3000) + getDirSizeKiB(tsCachePath, 3000);
  const playwrightKiB = getDirSizeKiB(path.join(HOME, 'Library/Caches/ms-playwright'), 4000);
  const trashKiB = getDirSizeKiB(path.join(HOME, '.Trash'), 3000);
  const adobeRunning = adobeVideoAppRunning();
  const adobeCacheKiB = ADOBE_MEDIA_CACHE_DIRS.reduce((sum, d) => sum + getDirSizeKiB(d, 4000), 0);

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
      id: 'npm_cacache',
      label: 'npm Content-Addressed Tarball Cache (~/.npm/_cacache)',
      paths: [npmCachePath],
      sizeGiB: Number((npmCacheKiB / (1024 * 1024)).toFixed(2)),
      sizeMiB: Number((npmCacheKiB / 1024).toFixed(1)),
      safeAutoClean: true,
    },
    {
      id: 'homebrew_cache',
      label: 'Homebrew Bottle & Formula Download Cache',
      paths: [brewCachePath],
      sizeGiB: Number((brewCacheKiB / (1024 * 1024)).toFixed(2)),
      sizeMiB: Number((brewCacheKiB / 1024).toFixed(1)),
      safeAutoClean: true,
    },
    {
      id: 'dev_tool_caches',
      label: 'Python pip & TypeScript Build Caches',
      paths: [pipCachePath, tsCachePath],
      sizeGiB: Number((devToolKiB / (1024 * 1024)).toFixed(2)),
      sizeMiB: Number((devToolKiB / 1024).toFixed(1)),
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
      id: 'active_claude_tmp',
      label: 'Active Live Agent Scratchpads (/private/tmp/claude-*)',
      paths: liveClaudeRoots,
      sizeGiB: Number((activeClaudeKiB / (1024 * 1024)).toFixed(2)),
      sizeMiB: Number((activeClaudeKiB / 1024).toFixed(1)),
      safeAutoClean: false,
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
      // Premiere, After Effects and Media Encoder rebuild these on the next open. Now that
      // agents drive those apps through Adobe's local MCP tools, the caches grow fast.
      id: 'adobe_media_cache',
      label: adobeRunning
        ? `Adobe media cache (left alone: ${adobeRunning} is open)`
        : 'Adobe media cache (Premiere, After Effects, Media Encoder)',
      paths: ADOBE_MEDIA_CACHE_DIRS,
      sizeGiB: Number((adobeCacheKiB / (1024 * 1024)).toFixed(2)),
      sizeMiB: Number((adobeCacheKiB / 1024).toFixed(1)),
      safeAutoClean: !adobeRunning,
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

  const safeReclaimableMiB = Number(
    categories
      .filter((c) => c.safeAutoClean)
      .reduce((acc, c) => acc + c.sizeMiB, 0)
      .toFixed(1),
  );
  const safeReclaimableGiB = Number((safeReclaimableMiB / 1024).toFixed(2));
  const totalIdentifiedJunkGiB = Number(
    categories.reduce((acc, c) => acc + c.sizeGiB, 0).toFixed(2),
  );

  return {
    ok: true,
    scannedAt: new Date().toISOString(),
    disk,
    safeReclaimableMiB,
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

const ADOBE_MEDIA_CACHE_DIRS = ['Media Cache Files', 'Media Cache', 'Peak Files'].map((d) =>
  path.join(HOME, 'Library', 'Application Support', 'Adobe', 'Common', d),
);

// Name of an open Adobe app that reads the media cache, or null. Its cache is only cleaned
// while none of them is running.
function adobeVideoAppRunning(psText) {
  let text = psText;
  if (text == null) {
    // comm= is the executable path only, so a shell command that mentions an app name doesn't count.
    const r = spawnSync('ps', ['-axo', 'comm='], { encoding: 'utf8', timeout: 5000 });
    text = r.stdout || '';
  }
  const m = text.match(/\.app\/Contents\/MacOS\/Adobe (Premiere Pro|After Effects|Media Encoder|Audition|Premiere Rush)/);
  return m ? `Adobe ${m[1]}` : null;
}

const SAFE_USER_CACHE_PREFIXES = [
  ...ADOBE_MEDIA_CACHE_DIRS,
  path.join(HOME, '.npm', '_cacache'),
  path.join(HOME, 'Library', 'Caches', 'Homebrew'),
  path.join(HOME, 'Library', 'Caches', 'pip'),
  path.join(HOME, 'Library', 'Caches', 'typescript'),
];

function isSafePurgePath(p) {
  if (p.startsWith('/private/tmp/')) return true;
  return SAFE_USER_CACHE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

const LAST_CLEAN_RECEIPT_PATH = path.join(HOME, '.mac-yolo-safeguards', 'last-disk-clean-receipt.json');

function loadLastCleanReceipt() {
  try {
    if (fs.existsSync(LAST_CLEAN_RECEIPT_PATH)) {
      return JSON.parse(fs.readFileSync(LAST_CLEAN_RECEIPT_PATH, 'utf8'));
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveLastCleanReceipt(receipt) {
  try {
    fs.mkdirSync(path.dirname(LAST_CLEAN_RECEIPT_PATH), { recursive: true });
    fs.writeFileSync(LAST_CLEAN_RECEIPT_PATH, JSON.stringify(receipt, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
}

function runDiskSmartClean(options = {}) {
  const beforeScan = runDiskSmartScan();
  const cleanedPaths = [];
  const cleanedCategories = [];
  const checkedAutoCleanTargets = [];
  const sparedCategories = [];
  let reclaimedMiB = 0;

  for (const cat of beforeScan.categories) {
    if (!cat.safeAutoClean) {
      if (cat.sizeMiB > 0) {
        sparedCategories.push({
          id: cat.id,
          label: cat.label,
          sizeMiB: cat.sizeMiB,
          sizeGiB: cat.sizeGiB,
        });
      }
      continue;
    }
    let catCleanedCount = 0;
    for (const p of cat.paths) {
      if (!isSafePurgePath(p)) continue;
      if (fs.existsSync(p)) {
        try {
          fs.rmSync(p, { recursive: true, force: true });
          cleanedPaths.push(p);
          catCleanedCount += 1;
        } catch {
          /* ignore permission errors on individual files */
        }
      }
    }
    const targetRecord = {
      id: cat.id,
      label: cat.label,
      sizeMiB: cat.sizeMiB,
      sizeGiB: cat.sizeGiB,
      cleanedCount: catCleanedCount,
      status: cat.sizeMiB > 0 ? 'PURGED' : 'ALREADY_CLEAN',
    };
    checkedAutoCleanTargets.push(targetRecord);
    if (catCleanedCount > 0 || cat.sizeMiB > 0) {
      reclaimedMiB += cat.sizeMiB;
      cleanedCategories.push(targetRecord);
    }
  }

  reclaimedMiB = Number(reclaimedMiB.toFixed(1));
  const afterDisk = getRootDiskUsage();
  const dfDeltaGiB = Number(Math.max(0, afterDisk.freeGiB - beforeScan.disk.freeGiB).toFixed(2));
  const reportedReclaimedGiB = dfDeltaGiB > 0 ? dfDeltaGiB : Number((reclaimedMiB / 1024).toFixed(2));

  const cleanedLabelList = cleanedCategories
    .filter((c) => c.sizeMiB > 0)
    .map((c) => `${c.label.split(' (')[0]} (${c.sizeMiB >= 1024 ? `${c.sizeGiB} GB` : `${c.sizeMiB} MB`})`);
  const sparedLabelList = sparedCategories
    .slice(0, 3)
    .map((c) => `${c.label.split(' (')[0]} (${c.sizeMiB >= 1024 ? `${c.sizeGiB} GB` : `${c.sizeMiB} MB`})`);

  const prevReceipt = loadLastCleanReceipt();
  const cleanedAt = new Date().toISOString();
  if (reclaimedMiB > 0) {
    saveLastCleanReceipt({
      cleanedAt,
      reclaimedMiB,
      reclaimedGiB: reportedReclaimedGiB,
      cleanedCategories: cleanedCategories.filter((c) => c.sizeMiB > 0),
    });
  }
  const lastNonZeroClean = reclaimedMiB > 0
    ? {
        cleanedAt,
        reclaimedMiB,
        reclaimedGiB: reportedReclaimedGiB,
        cleanedCategories: cleanedCategories.filter((c) => c.sizeMiB > 0),
      }
    : prevReceipt;

  const summaryLine =
    reclaimedMiB > 0
      ? `Reclaimed ${reclaimedMiB >= 1024 ? `${reportedReclaimedGiB} GB` : `${reclaimedMiB} MB`} across ${cleanedPaths.length} cache path(s): ${cleanedLabelList.join(' · ')}`
      : `All 6 AI & dev cache targets verified clean (0 MB stale waste)${lastNonZeroClean ? ` · Last purge freed ${lastNonZeroClean.reclaimedMiB >= 1024 ? `${lastNonZeroClean.reclaimedGiB} GB` : `${lastNonZeroClean.reclaimedMiB} MB`}` : ''} · Spared active/protected: ${sparedLabelList.join(' · ') || 'none'}`;

  let notification = { sent: false };
  if (options.notify !== false) {
    notification = sendDiskGuardNotification({
      title: '🛡 Mac YOLO Safeguards • Disk Guard',
      subtitle: `${afterDisk.freeGiB} GiB Free (${afterDisk.usedPct}% used • ${afterDisk.status})`,
      message: summaryLine,
    });
  }

  return {
    ok: true,
    action: 'freeUpDisk',
    cleanedAt,
    beforeDisk: beforeScan.disk,
    afterDisk,
    reclaimedMiB,
    reclaimedGiB: reportedReclaimedGiB,
    cleanedPaths,
    cleanedCategories,
    checkedAutoCleanTargets,
    sparedCategories,
    lastNonZeroClean,
    summaryLine,
    notification,
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');
  const doClean = argv.includes('--clean');
  const doNotify = argv.includes('--notify');

  if (doClean) {
    const res = runDiskSmartClean({ notify: doNotify });
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
  if (doNotify) {
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
  adobeVideoAppRunning,
  ADOBE_MEDIA_CACHE_DIRS,
  getRootDiskUsage,
  findStaleClaudeTmpEntries,
  runDiskSmartScan,
  runDiskSmartClean,
  sendDiskGuardNotification,
};
