#!/usr/bin/env node
'use strict';

/**
 * thumbgate-extension-packager.js — ThumbGate Chrome Extension Packager & Doctor
 * -------------------------------------------------------------------------------
 * Verifies and packages the ThumbGate Manifest V3 Chrome Extension:
 *   1. Manifest V3 validation (permissions, content scripts, background worker).
 *   2. Asset integrity verification (popup, CSS, JS bundles).
 *   3. Chrome Web Store ZIP bundle generator.
 *
 * Usage:
 *   node tools/thumbgate-extension-packager.js --doctor
 *   node tools/thumbgate-extension-packager.js --package
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EXT_DIR = path.resolve(__dirname, '..', 'extensions', 'thumbgate-chrome-extension');
const MANIFEST_PATH = path.join(EXT_DIR, 'manifest.json');
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const ZIP_OUTPUT = path.join(DIST_DIR, 'thumbgate-chrome-extension.zip');

/**
 * Validates extension files and manifest integrity.
 * @returns {{ valid: boolean, errors: string[], manifest: object }}
 */
function validateExtension() {
  const errors = [];
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { valid: false, errors: ['manifest.json not found'], manifest: null };
  }

  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    return { valid: false, errors: [`Invalid manifest JSON: ${e.message}`], manifest: null };
  }

  if (manifest.manifest_version !== 3) {
    errors.push(`Manifest version must be 3, got ${manifest.manifest_version}`);
  }

  const requiredFiles = [
    manifest.action?.default_popup,
    'popup.css',
    'popup.js',
    manifest.background?.service_worker,
    ...(manifest.content_scripts?.[0]?.js || []),
    ...(manifest.content_scripts?.[0]?.css || []),
  ].filter(Boolean);

  for (const file of requiredFiles) {
    const fullPath = path.join(EXT_DIR, file);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Required extension asset missing: ${file}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    manifest,
    verifiedFiles: requiredFiles,
  };
}

/**
 * Packages the extension directory into a release ZIP archive.
 * @returns {{ success: boolean, outputPath: string, sizeBytes: number }}
 */
function packageExtension() {
  const val = validateExtension();
  if (!val.valid) {
    throw new Error(`Extension validation failed: ${val.errors.join(', ')}`);
  }

  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

  // Use zip via execFileSync
  execFileSync('zip', ['-r', '-q', ZIP_OUTPUT, '.'], {
    cwd: EXT_DIR,
    stdio: 'inherit',
  });

  const stat = fs.statSync(ZIP_OUTPUT);
  return {
    success: true,
    outputPath: ZIP_OUTPUT,
    sizeBytes: stat.size,
  };
}

function runDoctor() {
  const val = validateExtension();
  return {
    engine: 'thumbgate-chrome-extension-packager',
    status: val.valid ? 'READY' : 'INVALID_MANIFEST',
    extensionName: val.manifest?.name || 'ThumbGate',
    manifestVersion: val.manifest?.manifest_version || 0,
    verifiedFilesCount: val.verifiedFiles?.length || 0,
    extensionDir: EXT_DIR,
    errors: val.errors,
  };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--doctor') || args.includes('-d')) {
    const doc = runDoctor();
    console.log(`[thumbgate-ext] Status: ${doc.status}`);
    console.log(`[thumbgate-ext] Extension: ${doc.extensionName} (Manifest v${doc.manifestVersion})`);
    console.log(`[thumbgate-ext] Verified Assets: ${doc.verifiedFilesCount} files`);
    process.exit(doc.status === 'READY' ? 0 : 1);
  }

  if (args.includes('--package')) {
    const res = packageExtension();
    console.log(`[thumbgate-ext] Built release ZIP: ${res.outputPath} (${(res.sizeBytes / 1024).toFixed(1)} KB)`);
    process.exit(0);
  }

  console.log('Usage: thumbgate-extension [--doctor] [--package]');
}

module.exports = {
  validateExtension,
  packageExtension,
  runDoctor,
};
