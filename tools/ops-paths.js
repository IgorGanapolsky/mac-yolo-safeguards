'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..');

function hasOpsData(dir) {
  if (!fs.existsSync(dir)) return false;
  try {
    return fs.readdirSync(dir).some((f) => f.endsWith('.tsv'));
  } catch {
    return false;
  }
}

function resolveDefaultOpsDir() {
  if (process.env.MAC_YOLO_OPS_DIR) {
    return path.resolve(process.env.MAC_YOLO_OPS_DIR);
  }
  const repoBus = path.join(REPO_ROOT, 'business_os');
  const repoRev = path.join(repoBus, 'revenue');
  const homeRev = path.join(os.homedir(), '.hermes', 'business_os', 'revenue');
  const stat = fs.lstatSync(repoBus, { throwIfNoEntry: false });
  if (stat && stat.isSymbolicLink() && !fs.existsSync(repoBus)) {
    return homeRev;
  }
  if (hasOpsData(repoRev)) {
    return repoRev;
  }
  if (hasOpsData(homeRev)) {
    return homeRev;
  }
  if (!fs.existsSync(repoBus)) {
    return homeRev;
  }
  return repoRev;
}

const OPS_DIR = resolveDefaultOpsDir();
const OPS_REL = path.relative(REPO_ROOT, OPS_DIR);

function ensureOpsDir() {
  fs.mkdirSync(OPS_DIR, { recursive: true });
}

function opsPath(name) {
  return path.join(OPS_DIR, name);
}

function defaultOut(filename) {
  ensureOpsDir();
  return path.relative(REPO_ROOT, opsPath(filename));
}

function listDataBasenames() {
  const seen = new Set();
  const names = [];
  const addDir = (dir) => {
    if (!fs.existsSync(dir)) {
      return;
    }
    for (const name of fs.readdirSync(dir)) {
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      names.push(name);
    }
  };
  addDir(OPS_DIR);
  addDir(REPO_ROOT);
  return names;
}

function existsDataFile(name) {
  if (!name || name.includes('/') || path.isAbsolute(name)) {
    return fs.existsSync(path.resolve(name));
  }
  return fs.existsSync(opsPath(name)) || fs.existsSync(path.join(REPO_ROOT, name));
}

function resolveDataPath(name) {
  if (!name) {
    throw new Error('resolveDataPath requires a filename');
  }
  if (name.includes('/') || path.isAbsolute(name)) {
    return path.resolve(name);
  }
  if (fs.existsSync(opsPath(name))) {
    return path.join(REPO_ROOT, OPS_REL, name);
  }
  if (fs.existsSync(path.join(REPO_ROOT, name))) {
    return path.join(REPO_ROOT, name);
  }
  return path.join(REPO_ROOT, OPS_REL, name);
}

function discoverBasenames(prefix, date, ext) {
  return listDataBasenames()
    .filter((name) => name.startsWith(prefix))
    .filter((name) => name.endsWith(ext))
    .filter((name) => name.includes(date))
    .filter((name) => !name.includes('.example.'))
    .sort();
}

function discover(prefix, date) {
  return discoverBasenames(prefix, date, '.tsv').map((name) => resolveDataPath(name));
}

function discoverMarkdown(prefix, date) {
  return discoverBasenames(prefix, date, '.md').map((name) => resolveDataPath(name));
}

function discoverPattern(pattern) {
  return listDataBasenames()
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => resolveDataPath(name));
}

function discoverLedgers(month) {
  return listDataBasenames()
    .filter((name) => /^revenue-ledger.+\.tsv$/.test(name))
    .filter((name) => !name.includes('.example.'))
    .filter((name) => name.includes(month))
    .sort()
    .map((name) => resolveDataPath(name));
}

module.exports = {
  REPO_ROOT,
  OPS_DIR,
  OPS_REL,
  ensureOpsDir,
  opsPath,
  defaultOut,
  listDataBasenames,
  existsDataFile,
  resolveDataPath,
  discover,
  discoverMarkdown,
  discoverPattern,
  discoverLedgers,
};
