/**
 * tools/igorganapolsky_brand_sync.js
 *
 * Automates synchronization, validation, and deployment of Igor Ganapolsky's
 * personal portfolio and venture showcase at igorganapolsky.com (IgorGanapolsky.github.io).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PORTFOLIO_REPO_PATH = process.env.PORTFOLIO_REPO_PATH || '/Users/igorganapolsky/workspace/git/igor/IgorGanapolsky.github.io';

class BrandSyncEngine {
  constructor(repoPath = PORTFOLIO_REPO_PATH) {
    this.repoPath = repoPath;
    this.indexPath = path.join(this.repoPath, 'index.html');
  }

  /**
   * Validates that index.html exists and contains the required venture links & metadata.
   */
  validatePortfolio() {
    if (!fs.existsSync(this.indexPath)) {
      throw new Error(`Portfolio index.html not found at: ${this.indexPath}`);
    }

    const html = fs.readFileSync(this.indexPath, 'utf8');

    const requiredKeywords = [
      'Igor Ganapolsky',
      'igor@igorganapolsky.com',
      'ThumbGate.app',
      'HVAC AI Automation',
      'Hermes Mobile',
      'B2B AI Operations',
      'https://github.com/IgorGanapolsky',
      'https://linkedin.com/in/igorganapolsky'
    ];

    const missing = requiredKeywords.filter(keyword => !html.includes(keyword));

    return {
      ok: missing.length === 0,
      checkedKeywords: requiredKeywords.length,
      missingKeywords: missing,
      path: this.indexPath
    };
  }

  /**
   * Checks git status and commits changes if index.html is modified.
   */
  syncAndPublish(commitMessage = 'feat(brand): sync personal portfolio & venture updates') {
    const validation = this.validatePortfolio();
    if (!validation.ok) {
      throw new Error(`Cannot publish: Missing required portfolio elements: ${validation.missingKeywords.join(', ')}`);
    }

    try {
      execFileSync('git', ['-C', this.repoPath, 'add', 'index.html'], { encoding: 'utf8' });
      const status = execFileSync('git', ['-C', this.repoPath, 'status', '--porcelain'], { encoding: 'utf8' });

      if (!status.trim()) {
        return { ok: true, status: 'NO_CHANGES_NEEDED', message: 'Portfolio is already fully synchronized.' };
      }

      execFileSync('git', ['-C', this.repoPath, 'commit', '-m', commitMessage], { encoding: 'utf8' });
      execFileSync('git', ['-C', this.repoPath, 'push', 'origin', 'main'], { encoding: 'utf8' });

      return { ok: true, status: 'PUBLISHED_SUCCESSFULLY', message: 'Pushed updates to origin/main.' };
    } catch (err) {
      return { ok: false, status: 'ERROR', error: err.message };
    }
  }
}

module.exports = { BrandSyncEngine };

if (require.main === module) {
  const engine = new BrandSyncEngine();
  const res = engine.validatePortfolio();
  console.log(JSON.stringify(res, null, 2));
}
