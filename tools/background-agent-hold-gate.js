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
// Same request with the words split up: "keep the agent running in the background".
const RUN_BACKGROUND_SPLIT = /\b(start|leave|keep|run|enable)\b[\s\S]{0,40}\bagents?\b[\s\S]{0,40}\b(in the background|always[- ]on|after (?:i|we|you|they) (?:step|walk|go) away)\b/i;
const PROJECT_WRITE = /\b(write|save|overwrite|export|mv)\b[\s\S]{0,80}\S+\.(?:psd|prproj|aep|ai)\b/i;
// Shell output redirection into a project file: `printf x > poster.psd`, `cat a >> b.ai`.
const PROJECT_REDIRECT = />>?\s*["']?[^\s"'|;&]*\.(?:psd|prproj|aep|ai)\b/i;
const PROJECT_EXT = /\.(?:psd|prproj|aep|ai)["']?$/i;
const VENDOR_CLAIM = /richer detail|world's largest creativity conference/i;
const VENDOR_CLAIM_G = /richer detail|world's largest creativity conference/gi;
const ATTRIBUTED = /\bAdobe\b/i;

// `cp` writes only its last operand, so a project file as the source is a read.
function cpWritesProject(text) {
  return text.split(/[\n;&|]+/).some((segment) => {
    const words = segment.trim().split(/\s+/);
    const at = words.indexOf('cp');
    if (at < 0) return false;
    const operands = words.slice(at + 1).filter((word) => word && !word.startsWith('-'));
    return operands.length >= 2 && PROJECT_EXT.test(operands[operands.length - 1]);
  });
}

// Each claim needs its own attribution in the same sentence of the same field.
function unattributedClaim(fields) {
  return fields.some((text) => text.split(/(?<=[.!?])\s+|\n+/).some((sentence) => {
    VENDOR_CLAIM_G.lastIndex = 0;
    return VENDOR_CLAIM_G.test(sentence) && !ATTRIBUTED.test(sentence);
  }));
}

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
  if (action === 'background' || action === 'always-on' || RUN_BACKGROUND.test(blob) || RUN_BACKGROUND_SPLIT.test(blob)) {
    findings.push(finding('background_agent'));
  }
  if (action === 'write-project' || action === 'edit-project' || PROJECT_WRITE.test(blob) || PROJECT_REDIRECT.test(blob) || cpWritesProject(command)) {
    findings.push(finding('project_write'));
  }
  if (VENDOR_CLAIM.test(blob) && unattributedClaim([note, command])) {
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

const VALUE_FLAGS = new Set(['--action', '--note', '--command']);
const BOOL_FLAGS = new Set(['--json']);

// Every argument must be a known flag or the value right after one; anything else
// (such as `--action=background`) would silently drop the request.
function validateArgs(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (VALUE_FLAGS.has(argv[i])) { i += 1; continue; }
    if (!BOOL_FLAGS.has(argv[i])) throw new Error(`Unsupported argument: ${argv[i]}`);
  }
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0) return '';
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function main() {
  const argv = process.argv.slice(2);
  let report;
  try {
    validateArgs(argv);
    report = reviewBackgroundAgent({
      action: argValue(argv, '--action') || 'note',
      note: argValue(argv, '--note'),
      command: argValue(argv, '--command'),
    });
  } catch (err) {
    // A malformed request is never reported as clear.
    console.error(err.message);
    process.exit(2);
  }
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
