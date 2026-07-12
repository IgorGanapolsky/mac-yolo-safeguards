#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MOBILE_ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOTS = ['App.tsx', 'app.json', 'app.config.js', 'src'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.json', '.ts', '.tsx']);
const ARTIFACT_EXTENSIONS = new Set([
  '.bundle',
  '.config',
  '.hbc',
  '.js',
  '.jsbundle',
  '.json',
  '.manifest',
]);
const EXCLUDED_SOURCE_DIRECTORIES = new Set([
  '__mocks__',
  '__tests__',
  'fixtures',
  'testUtils',
]);

const PRIVATE_MARKERS = [
  {
    id: 'embedded_gateway_credential',
    pattern: /sk-hermes-[A-Za-z0-9_-]{8,}/gi,
  },
  {
    id: 'embedded_thumbgate_credential',
    pattern: /tg_(?:creator|pro|team)_[A-Za-z0-9_-]{8,}/gi,
  },
  {
    id: 'owner_device_identifier',
    pattern: /igors[-_.][A-Za-z0-9_.-]+/gi,
  },
  {
    id: 'owner_workspace_path',
    pattern: /(?:~|\/Users\/[^/]+)\/workspace\/git\/igor\b/gi,
  },
  {
    id: 'literal_tailscale_cgnat_address',
    pattern: /\b100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])(?:\.\d{1,3}){2}\b/g,
  },
];

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath));
}

function isArtifactEntry(filePath) {
  const lower = filePath.toLowerCase();
  return (
    ARTIFACT_EXTENSIONS.has(path.extname(lower)) ||
    lower.endsWith('index.android.bundle') ||
    lower.endsWith('main.jsbundle')
  );
}

function listFiles(rootPath, options = {}) {
  if (!fs.existsSync(rootPath)) {
    return [];
  }
  const stat = fs.statSync(rootPath);
  if (stat.isFile()) {
    return [rootPath];
  }

  const files = [];
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (entry.isDirectory() && options.excludeSourceDirs && EXCLUDED_SOURCE_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, options));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function lineNumberForOffset(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function scanText(text, fileLabel) {
  const findings = [];
  for (const marker of PRIVATE_MARKERS) {
    marker.pattern.lastIndex = 0;
    let match;
    while ((match = marker.pattern.exec(text)) !== null) {
      if (marker.id === 'literal_tailscale_cgnat_address' && match[0] === '100.64.0.0') {
        continue;
      }
      findings.push({
        id: marker.id,
        file: fileLabel,
        line: lineNumberForOffset(text, match.index),
      });
      if (match[0].length === 0) {
        marker.pattern.lastIndex += 1;
      }
    }
  }
  return findings;
}

function scanFile(filePath, label = filePath) {
  return scanText(fs.readFileSync(filePath).toString('latin1'), label);
}

function scanProductionSource(mobileRoot = MOBILE_ROOT) {
  const findings = [];
  for (const relativeRoot of SOURCE_ROOTS) {
    const absoluteRoot = path.join(mobileRoot, relativeRoot);
    for (const filePath of listFiles(absoluteRoot, { excludeSourceDirs: true })) {
      if (!isSourceFile(filePath) || /\.(?:spec|test)\.[jt]sx?$/.test(filePath)) {
        continue;
      }
      findings.push(...scanFile(filePath, path.relative(mobileRoot, filePath)));
    }
  }
  return findings;
}

function archiveEntries(archivePath) {
  const listed = spawnSync('unzip', ['-Z1', archivePath], { encoding: 'utf8' });
  if (listed.status !== 0) {
    throw new Error(`Could not inspect archive ${archivePath}: ${listed.stderr.trim()}`);
  }
  return listed.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter(isArtifactEntry);
}

function scanArchive(archivePath) {
  const findings = [];
  for (const entry of archiveEntries(archivePath)) {
    const extracted = spawnSync('unzip', ['-p', archivePath, entry], {
      encoding: 'buffer',
      maxBuffer: 128 * 1024 * 1024,
    });
    if (extracted.status !== 0) {
      throw new Error(`Could not extract ${entry} from ${archivePath}`);
    }
    findings.push(
      ...scanText(extracted.stdout.toString('latin1'), `${path.basename(archivePath)}:${entry}`),
    );
  }
  return findings;
}

function scanArtifactPath(targetPath) {
  const absolutePath = path.resolve(targetPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Artifact does not exist: ${absolutePath}`);
  }
  if (fs.statSync(absolutePath).isFile() && /\.(?:aab|apk|ipa|zip)$/i.test(absolutePath)) {
    return scanArchive(absolutePath);
  }
  return listFiles(absolutePath)
    .filter(isArtifactEntry)
    .flatMap((filePath) => scanFile(filePath, path.relative(process.cwd(), filePath)));
}

function uniqueFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.id}:${finding.file}:${finding.line}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function runCli(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const source = argv.includes('--source');
  const targets = argv.filter((arg) => !arg.startsWith('--'));
  let findings = source || targets.length === 0 ? scanProductionSource() : [];
  for (const target of targets) {
    findings.push(...scanArtifactPath(target));
  }
  findings = uniqueFindings(findings);

  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: findings.length === 0, findings }, null, 2)}\n`);
  } else if (findings.length === 0) {
    console.log('Public mobile privacy scan: PASS (no private markers found)');
  } else {
    console.error(`Public mobile privacy scan: FAIL (${findings.length} private marker(s))`);
    for (const finding of findings) {
      console.error(`- ${finding.id} at ${finding.file}:${finding.line}`);
    }
  }
  return findings.length === 0 ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exitCode = runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

module.exports = {
  PRIVATE_MARKERS,
  scanArtifactPath,
  scanProductionSource,
  scanText,
  runCli,
};
