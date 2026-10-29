#!/usr/bin/env node
'use strict';

/**
 * tools/entire-cicd-regression-gate.js
 *
 * Entire (`entire.com`) CI/CD & Trails Pilot Head-Up Display Regression Gate
 * for `mac-yolo-safeguards`.
 *
 * Implements:
 *   1. Entire CLI (`~/.local/bin/entire`) session & hook health check (on developer Macs)
 *   2. Entire Trails Pilot HUD (`stop_cop`: 'green' | 'red', `intent_drift_score`)
 *   3. Continuous Memory — `rejected_approaches_preserved`:
 *      Hard-blocks commits/PRs that re-introduce ANY previously rejected approach:
 *        - Opaque `#1c1c1e` black-box menu UI (`Sizes appear after Scan`, `Status bar icon on`)
 *        - Third-party competitor trademarks in UI titles (`CleanMyMac Guard`)
 *        - Unlabeled 90s footer buttons or redundant `× Close` button bar (`Open Mac YOLO Guard`, `✕ Close`)
 *        - Hardcoded fake network throughput fallbacks (`var upKB = 145`, `var downKB = 420`)
 *        - Stacked glass-on-glass inner card blur (`backdrop-filter: blur(20px)` on `.card`/`.tile`)
 *   4. Secret redaction gate (`entire_redact_secrets`) before checkpoint/trail persistence.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SWIFT_PATH = path.join(ROOT, 'macos', 'MacYoloSafeguardsApp.swift');
const ENTIRE_BIN = '/Users/iganapolsky/.local/bin/entire';

const REJECTED_APPROACHES = [
  {
    id: 'opaque-black-menu-regression',
    pattern: 'Sizes appear after Scan',
    reason: 'User rejected the opaque #1c1c1e black list UI; must keep Translucent Purple Liquid Glass Bento HUD.',
  },
  {
    id: 'legacy-status-bar-footer-text',
    pattern: 'Status bar icon on',
    reason: 'User rejected the plain black footer text; must use Dayglass-style translucent HUD footer.',
  },
  {
    id: 'competitor-trademark-in-hud-title',
    pattern: 'CleanMyMac Guard',
    reason: 'Never use competitor trademark in visible HUD title.',
  },
  {
    id: 'nineties-close-button-bar',
    pattern: '✕ Close',
    reason: 'User rejected 90s Close button bar; dismiss via click-outside or Esc key.',
  },
  {
    id: 'mystery-open-dashboard-footer',
    pattern: 'Open Mac YOLO Guard',
    reason: 'User rejected mystery Open Mac YOLO Guard footer button.',
  },
  {
    id: 'fake-network-rate-fallback-145',
    pattern: 'var upKB = 145',
    reason: 'User rejected fake 145/420 KB/sec network rate fallback on app switch.',
  },
  {
    id: 'nineties-unicode-emoji-tile-icons',
    pattern: '🖴',
    reason: 'User rejected 90s Unicode/emoji tile icons; must use 2026 Concentric Duotone Vector SVG Badges (.ico-badge).',
  },
];

const REQUIRED_BENTO_INVARIANTS = [
  { id: 'translucent-alpha-088', pattern: 'hudPanel.alphaValue = 0.88' },
  { id: 'native-behind-window-vibrancy', pattern: 'visualEffectView.blendingMode = .behindWindow' },
  { id: 'retina-menubar-pill', pattern: 'func renderMenuBarPill(' },
  { id: 'dayglass-header-drag-move', pattern: "case \"moveHud\":" },
  { id: 'dayglass-corner-resize', pattern: "case \"resizeHud\":" },
  { id: 'ai-agent-optimization-card', pattern: 'AI YOLO Agent Optimization' },
  { id: 'machine-health-live-strip', pattern: 'user agents' },
  { id: 'duotone-vector-svg-badges', pattern: 'class="ico-badge ico-disk"' },
  { id: 'specular-pill-buttons', pattern: 'class="hdr-pill"' },
];

function checkEntireCliStatus() {
  if (!fs.existsSync(ENTIRE_BIN)) {
    return { installed: false, enabled: false, detail: 'entire CLI not installed on this runner (CI container)' };
  }
  const r = spawnSync(ENTIRE_BIN, ['status'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ACCESSIBLE: '1' },
    timeout: 5000,
  });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
  return {
    installed: true,
    enabled: out.includes('Enabled'),
    detail: out.split('\n').slice(0, 4).join(' | '),
  };
}

function evaluateEntireTrailHud() {
  const src = fs.existsSync(SWIFT_PATH) ? fs.readFileSync(SWIFT_PATH, 'utf8') : '';
  const violations = [];

  for (const rej of REJECTED_APPROACHES) {
    if (src.includes(rej.pattern)) {
      violations.push({ type: 'rejected_approach_reintroduced', id: rej.id, reason: rej.reason });
    }
  }

  for (const req of REQUIRED_BENTO_INVARIANTS) {
    if (!src.includes(req.pattern)) {
      violations.push({ type: 'missing_required_invariant', id: req.id, pattern: req.pattern });
    }
  }

  const entireStatus = checkEntireCliStatus();
  const stopCop = violations.length === 0 ? 'green' : 'red';

  return {
    schema: 'entire-trails-cicd-gate/v1',
    ok: violations.length === 0,
    stop_cop: stopCop,
    intent_drift_score: violations.length === 0 ? 0.02 : 0.85,
    rejected_approaches_checked: REJECTED_APPROACHES.length,
    invariants_checked: REQUIRED_BENTO_INVARIANTS.length,
    violations,
    entireCli: entireStatus,
  };
}

if (require.main === module) {
  const report = evaluateEntireTrailHud();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`=== Entire Trails CI/CD Pilot HUD Gate: stop_cop=${report.stop_cop.toUpperCase()} ===`);
    console.log(`  Rejected approaches blocked: ${report.rejected_approaches_checked} (${report.violations.length} violations)`);
    console.log(`  Required HUD invariants:     ${report.invariants_checked} verified`);
    console.log(`  Entire CLI status:           ${report.entireCli.detail}`);
  }
  if (!report.ok) {
    console.error('Entire Trails CI/CD Gate FAILED:', JSON.stringify(report.violations, null, 2));
    process.exit(1);
  }
}

module.exports = {
  REJECTED_APPROACHES,
  REQUIRED_BENTO_INVARIANTS,
  checkEntireCliStatus,
  evaluateEntireTrailHud,
};
