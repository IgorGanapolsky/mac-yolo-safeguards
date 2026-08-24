'use strict';

/**
 * path-normalizer.js — Resilient Path & Unicode Whitespace Normalizer for macOS / POSIX
 *
 * Solves:
 * 1. macOS screenshot Unicode narrow no-break space (\u202f) vs standard ASCII space mismatch.
 * 2. Shell-escaped path strings (e.g. "/Users/.../Screenshot\ 2026-08-21\ at\ 11.45.19\ PM.png").
 * 3. TCC permission-safe file resolution on ~/Desktop, ~/Downloads, ~/Documents via Finder fallback.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function normalizeSpaces(str) {
  if (!str) return '';
  return str
    .replace(/\\ /g, ' ') // Unescape shell backslash spaces
    .replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ') // Normalize all Unicode spaces to standard space
    .trim();
}

function resolveResilientPath(inputPath) {
  if (!inputPath) return { ok: false, error: 'Empty path provided' };

  const rawClean = inputPath.replace(/^['"]|['"]$/g, '').trim();
  const normalized = normalizeSpaces(rawClean);

  // 1. Direct check
  if (fs.existsSync(rawClean)) {
    return { ok: true, resolvedPath: rawClean, strategy: 'direct' };
  }
  if (fs.existsSync(normalized)) {
    return { ok: true, resolvedPath: normalized, strategy: 'normalized_spaces' };
  }

  // 2. Directory scan with fuzzy Unicode whitespace matching
  const parentDir = path.dirname(normalized);
  const targetBase = path.basename(normalized);

  try {
    if (fs.existsSync(parentDir)) {
      const dirEntries = fs.readdirSync(parentDir);
      for (const entry of dirEntries) {
        if (normalizeSpaces(entry) === targetBase) {
          const matchedPath = path.join(parentDir, entry);
          return { ok: true, resolvedPath: matchedPath, strategy: 'fuzzy_directory_scan' };
        }
      }
    }
  } catch {}

  // 3. macOS Finder Bridge Fallback for TCC-protected directories (Desktop, Downloads)
  if (process.platform === 'darwin' && (normalized.includes('/Desktop') || normalized.includes('/Downloads'))) {
    try {
      const isDesktop = normalized.includes('/Desktop');
      const folderName = isDesktop ? 'desktop' : 'downloads folder';
      
      // Get all filenames in folder via Finder
      const listScript = `tell application "Finder"
  set folderFiles to every file of ${folderName}
  set namesList to {}
  repeat with f in folderFiles
    set end of namesList to (name of f as text)
  end repeat
  set AppleScript's text item delimiters to "|||"
  return namesList as text
end tell`;

      const rawNames = execFileSync('osascript', ['-e', listScript], { encoding: 'utf8', shell: false }).trim();
      const fileNames = rawNames.split('|||').map((s) => s.trim()).filter(Boolean);

      // Match in JS using normalized spaces
      let matchedName = null;
      for (const fn of fileNames) {
        if (normalizeSpaces(fn) === targetBase || normalizeSpaces(fn).includes(targetBase)) {
          matchedName = fn;
          break;
        }
      }

      if (matchedName) {
        // Copy file to /tmp for read access
        const copyScript = `tell application "Finder"
  set matchedItem to file "${matchedName.replace(/"/g, '\\"')}" of ${folderName}
  set tmpFolder to POSIX file "/tmp" as alias
  duplicate matchedItem to tmpFolder with replacing
end tell`;
        execFileSync('osascript', ['-e', copyScript], { encoding: 'utf8', shell: false });

        const tmpCopiedPath = path.join('/tmp', matchedName);
        if (fs.existsSync(tmpCopiedPath)) {
          return { ok: true, resolvedPath: tmpCopiedPath, originalName: matchedName, strategy: 'finder_tcc_bridge' };
        }
      }
    } catch {}
  }

  return { ok: false, error: `Path could not be resolved: ${inputPath}` };
}

module.exports = {
  normalizeSpaces,
  resolveResilientPath,
};
