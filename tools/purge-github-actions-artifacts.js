#!/usr/bin/env node
'use strict';

/**
 * purge-github-actions-artifacts.js
 * Bulk purges stored GitHub Actions build/coverage artifacts to free storage.
 *
 * Usage:
 *   node tools/purge-github-actions-artifacts.js
 */

const { execFileSync } = require('child_process');

function getArtifacts() {
  const raw = execFileSync(
    'gh',
    ['api', 'repos/IgorGanapolsky/mac-yolo-safeguards/actions/artifacts?per_page=100'],
    { encoding: 'utf8', shell: false },
  );
  const data = JSON.parse(raw);
  return data.artifacts || [];
}

function deleteArtifact(artifactId) {
  try {
    execFileSync(
      'gh',
      ['api', '--method', 'DELETE', `repos/IgorGanapolsky/mac-yolo-safeguards/actions/artifacts/${String(artifactId)}`],
      { stdio: 'ignore', shell: false },
    );
    return true;
  } catch {
    return false;
  }
}

function main() {
  console.log('Fetching GitHub Actions artifacts list...');
  let totalDeleted = 0;
  let page = 0;

  while (page < 10) {
    page++;
    const artifacts = getArtifacts();
    if (artifacts.length === 0) break;

    console.log(`Processing batch of ${artifacts.length} artifacts...`);
    let batchDeleted = 0;

    for (const art of artifacts) {
      if (deleteArtifact(art.id)) {
        batchDeleted++;
        totalDeleted++;
      }
    }

    if (batchDeleted === 0) break;
    console.log(`Deleted ${batchDeleted} artifacts in batch ${page}. Total deleted: ${totalDeleted}`);
  }

  console.log(`\nCleanup complete! Deleted ${totalDeleted} stored GitHub Actions artifacts.`);
}

if (require.main === module) {
  main();
}
