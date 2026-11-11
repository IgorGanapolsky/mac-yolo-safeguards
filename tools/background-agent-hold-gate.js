#!/usr/bin/env node
'use strict';

/**
 * Fail closed when a background agent would keep running after a person steps away,
 * or when an agent would write a native design project.
 * Source: https://news.adobe.com/news/2026/11/adobe-powers-new-era-of-creativity
 *
 * Their speed and detail claims stay theirs. This file does not install a creative
 * suite, call a model, or write a project file.
 */

const SOURCE = 'https://news.adobe.com/news/2026/11/adobe-powers-new-era-of-creativity';

const INSTALL_TEXT = /\b(install|add|enable)\b[\s\S]{0,60}\b(firefly|creative cloud|genstudio|creative agent|local mcp)\b/i;
const RUN_BACKGROUND = /\b(start|leave|keep|run|enable)\b[\s\S]{0,80}\b(always-on agents?|background agents?)\b/i;
const PROJECT_WRITE = /\b(write|save|overwrite|export|cp|mv)\b[\s\S]{0,80}\S+\.(?:psd|prproj|aep|ai)\b/i;
const VENDOR_CLAIM = /richer detail|world's largest creativity conference/i;
const ATTRIBUTED = /\bAdobe\b/i;

function finding(id) {
  return { id, severity: 'block' };
}

function reviewBackgroundAgent(input = {}) {
  const action = String(input.action || 'note').toLowerCase();
  const note = String(input.note || '');
  const command = String(input.command || '');
  const blob = [note, command].filter(Boolean).join('\n');
  const findings = [];

  if (action === 'install' || INSTALL_TEXT.test(blob)) findings.push(finding('vendor_install'));
  if (action === 'background' || action === 'always-on' || RUN_BACKGROUND.test(blob)) {
    findings.push(finding('background_agent'));
  }
  if (action === 'write-project' || action === 'edit-project' || PROJECT_WRITE.test(blob)) {
    findings.push(finding('project_write'));
  }
  if (VENDOR_CLAIM.test(blob) && !ATTRIBUTED.test(blob)) {
    findings.push(finding('vendor_claim_as_local'));
  }

  const seen = new Set();
  const unique = findings.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return {
    ok: unique.length === 0,
    status: unique.length ? 'blocked' : 'clear',
    findings: unique,
    applied: false,
    agentLeftRunning: false,
    projectWritten: false,
    humanReview: unique.some((item) => item.id === 'background_agent'),
    localSpeedup: null,
    localDetailGain: null,
    source: SOURCE,
  };
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : '';
}

function main() {
  const argv = process.argv.slice(2);
  const report = reviewBackgroundAgent({
    action: argValue(argv, '--action') || 'note',
    note: argValue(argv, '--note'),
    command: argValue(argv, '--command'),
  });
  if (argv.includes('--json')) console.log(JSON.stringify(report));
  else {
    console.log(report.ok ? 'Background agent: clear' : 'Background agent: blocked');
    for (const item of report.findings) console.log('blocked: ' + item.id);
    console.log('applied: false');
    console.log('humanReview: ' + report.humanReview);
  }
  process.exit(report.ok ? 0 : 2);
}

if (require.main === module) main();

module.exports = {
  SOURCE,
  reviewBackgroundAgent,
};
