#!/usr/bin/env node
'use strict';

/**
 * Fail closed when a coding task writes the shared checkout or another task's
 * tree, or when a remote dev machine would be installed or started.
 * Source: https://depthfirst.com/post/secure-agent-first-cloud-dev-environment
 *
 * Their week and supply-chain sentences stay theirs. This file does not start
 * a machine, install a firewall, or write a checkout.
 */

const SOURCE = 'https://depthfirst.com/post/secure-agent-first-cloud-dev-environment';
const DEFAULT_SHARED = '/Users/iganapolsky/workspace/mac-yolo-safeguards';

const INSTALL_TEXT = /\b(?:npm\s+install|brew\s+install|pip\s+install|install|enable)\b[\s\S]{0,50}\b(?:dependency firewall|dfc|private devbox)\b|\binstall\s+depthfirst\b/i;
const REMOTE_TEXT = /\b(?:start|create|provision|launch)\b[\s\S]{0,80}\b(?:devbox|private ec2|dependency firewall)\b|\btailscale\s+up\b[\s\S]{0,60}\b(?:devbox|private ec2)\b|\bdfc\s+(?:up|start|install)\b/i;
const BRANCH_IN_PLACE = /\bgit\s+checkout\s+-b\b/;
const VENDOR_CLAIM = /operational in less than a week|prevent(?:s|ing) supply chain attacks|security-engineering load by roughly 70%|hundreds of CVEs/i;
const ATTRIBUTED = /\bdepthfirst\b/i;

function finding(id) {
  return { id, severity: 'block' };
}

const posix = require('path').posix;

// Resolve `.`, `..` and repeated slashes so `/a/./b` and `/a/b/` compare equal to `/a/b`.
function norm(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return posix.normalize(raw).replace(/\/+$/, '') || '/';
}

function sameOrInside(path, root) {
  const p = norm(path);
  const r = norm(root);
  if (!p || !r) return false;
  return p === r || p.startsWith(r === '/' ? '/' : r + '/');
}

function scanText(text) {
  return String(text || '').replace(/https?:\/\/\S+/g, ' ');
}

function insideShared(taskPath, sharedRoot) {
  return sameOrInside(taskPath, sharedRoot);
}

// Two task trees overlap when either one is the other or sits inside it.
function overlapsOtherTask(taskPath, otherTaskPaths) {
  return otherTaskPaths.some((other) => sameOrInside(taskPath, other) || sameOrInside(other, taskPath));
}

function reviewTaskCheckout(input = {}) {
  const action = String(input.action || 'note').toLowerCase();
  const note = String(input.note || '');
  const command = String(input.command || '');
  const blob = scanText([note, command].filter(Boolean).join('\n'));
  const taskPath = String(input.taskPath || '');
  const otherTaskPaths = []
    .concat(input.otherTaskPaths || [], input.otherTaskPath || [])
    .map((item) => String(item || ''))
    .filter((item) => norm(item));
  const sharedRoot = String(input.sharedRoot || DEFAULT_SHARED);
  const findings = [];

  if (action === 'install' || INSTALL_TEXT.test(blob)) findings.push(finding('vendor_install'));
  if (action === 'devbox' || REMOTE_TEXT.test(blob)) findings.push(finding('remote_devbox'));
  if (
    action === 'share'
    || action === 'shared'
    || (action === 'task' && !norm(taskPath))
    || insideShared(taskPath, sharedRoot)
    || (norm(taskPath) && overlapsOtherTask(taskPath, otherTaskPaths))
    || BRANCH_IN_PLACE.test(command)
  ) {
    findings.push(finding('shared_checkout'));
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
    devboxStarted: false,
    firewallInstalled: false,
    sharedWrite: false,
    humanReview: unique.some((item) => item.id === 'remote_devbox'),
    localSupplyChainPrevented: null,
    localTimeToOperational: null,
    source: SOURCE,
  };
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0 || index + 1 >= argv.length) return '';
  const value = argv[index + 1];
  return value.startsWith('--') ? '' : value;
}

function argValues(argv, flag) {
  const values = [];
  argv.forEach((item, index) => {
    const value = argv[index + 1];
    if (item === flag && value !== undefined && !value.startsWith('--')) values.push(value);
  });
  return values;
}

function main() {
  const argv = process.argv.slice(2);
  const report = reviewTaskCheckout({
    action: argValue(argv, '--action') || 'note',
    note: argValue(argv, '--note'),
    command: argValue(argv, '--command'),
    taskPath: argValue(argv, '--task-path'),
    otherTaskPaths: argValues(argv, '--other-task-path'),
    sharedRoot: argValue(argv, '--shared-root') || DEFAULT_SHARED,
  });
  if (argv.indexOf('--json') >= 0) console.log(JSON.stringify(report));
  else {
    console.log(report.ok ? 'Task checkout: clear' : 'Task checkout: blocked');
    for (const item of report.findings) console.log('blocked: ' + item.id);
    console.log('applied: false');
    console.log('humanReview: ' + report.humanReview);
  }
  process.exit(report.ok ? 0 : 2);
}

if (require.main === module) main();

module.exports = {
  SOURCE,
  DEFAULT_SHARED,
  reviewTaskCheckout,
};
