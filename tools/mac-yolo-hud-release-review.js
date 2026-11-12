#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function reviewHudRelease(text) {
  const src = String(text || '');
  const findings = [];

  if (src.indexOf('id="attentionLine"') === -1) {
    findings.push({
      id: 'attention',
      detail: 'The first screen has no single attention line naming whether the Mac needs action, which agent is responsible, and what to do.',
    });
  }
  if (src.indexOf('Click any card') !== -1) {
    findings.push({
      id: 'clickPrompt',
      detail: 'An instructional click line repeats what the card controls already show.',
    });
  }
  if (src.indexOf('id="hudSizeBtn"') !== -1 || src.indexOf('id="footerSizeLabel"') !== -1) {
    findings.push({
      id: 'debugChrome',
      detail: 'A Size control or a pixel readout is part of the panel chrome.',
    });
  }
  if (/onclick="[^"]*triggerHudAction\('(freeUpMemory|coolDownFans|freeUpDisk)'/.test(src)) {
    findings.push({
      id: 'destructiveClick',
      detail: 'Free RAM, cool down, or clean waste starts on the first click, with no confirm step in the page.',
    });
  }
  const uninstall = src.match(/function requestUninstall\([\s\S]{0,500}?\}/);
  if (uninstall && uninstall[0].indexOf("sendAction('uninstallApp'") !== -1 && uninstall[0].indexOf('confirm') === -1) {
    findings.push({
      id: 'uninstallImmediate',
      detail: 'Uninstall sends the removal on the first click.',
    });
  }
  const alphas = [];
  const alphaRe = /alphaValue\s*=\s*([0-9]*\.?[0-9]+)/g;
  let match;
  while ((match = alphaRe.exec(src))) alphas.push(Number(match[1]));
  if (alphas.some((value) => value < 1)) {
    findings.push({
      id: 'panelFade',
      detail: 'The panel alpha is below 1, so the desktop shows through the whole window.',
    });
  }
  if (src.indexOf('.shell::before') !== -1 && src.indexOf('radial-gradient') !== -1) {
    findings.push({
      id: 'flatTint',
      detail: 'The window fill is a translucent gradient painted on a clear page, not a system material.',
    });
  }

  return { ok: findings.length === 0, findings };
}

function reviewHudFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const report = reviewHudRelease(text);
  report.file = filePath;
  return report;
}

function main() {
  const rel = process.argv[2] || 'macos/MacYoloSafeguardsApp.swift';
  const filePath = path.resolve(rel);
  if (!fs.existsSync(filePath)) {
    process.stderr.write('hud-release-review: missing ' + filePath + '\n');
    process.exit(2);
  }
  const report = reviewHudFile(filePath);
  if (report.ok) {
    process.stdout.write('hud-release-review: PASS ' + filePath + '\n');
    process.exit(0);
  }
  process.stdout.write('hud-release-review: FAIL ' + report.findings.length + '\n');
  for (const item of report.findings) {
    process.stdout.write(item.id + ': ' + item.detail + '\n');
  }
  process.exit(1);
}

module.exports = { reviewHudRelease, reviewHudFile };

if (require.main === module) main();
