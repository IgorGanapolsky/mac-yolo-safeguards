#!/usr/bin/env node
'use strict';

/**
 * Fail closed on installing NVIDIA OpenShell or widening a host policy.
 * Source: https://github.com/NVIDIA/OpenShell
 *
 * A declared host list can stay. A new host, a credential, or their installer waits.
 * Kernel enforcement and formal proof stay NVIDIA's claims. This file does not
 * install a package, start a sandbox, or attach a credential.
 */

const SOURCE = 'https://github.com/NVIDIA/OpenShell';

const SANDBOX_CREATE = /\bopenshell\s+sandbox\s+create\b/i;
const CURL_INSTALL = /curl[\s\S]{0,120}install\.sh|install\.sh[\s\S]{0,120}curl/i;
const NPX_SKILL = /\bnpx\s+skills\s+add\s+NVIDIA\/OpenShell\b/;
const UV_ADD = /\buv\s+add\s+openshell\b/i;
const NPM_SDK = /\bnpm\s+install\s+@nvidia\/openshell/i;
const CARGO_SDK = /\bcargo\s+add\s+openshell-sdk\b/i;
const GO_SDK = /\bgo\s+get\s+github\.com\/ai-openshell\/sdk-go\b/;
const CONTAINER = /\b(?:docker|podman)\s+(?:run|pull)\b[\s\S]{0,200}\bopenshell\b/i;
const VENDOR_CLAIM = /kernel-level enforcement|formally verified|anonymous telemetry/i;
const ATTRIBUTED = /\bNVIDIA\b/;
const TELEMETRY_ON = /OPENSHELL_TELEMETRY_ENABLED\s*=\s*true|server\.telemetryEnabled\s*=\s*true/i;
const ATTACH_CREDENTIAL = /\battach(?:ing|ed)?\s+(?:a\s+)?credentials?\b/i;

function finding(id) {
  return { id, severity: 'block' };
}

function hostsOf(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return raw.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
}

function reviewOpenShellPolicy(input = {}) {
  const action = String(input.action || 'note').toLowerCase();
  const note = String(input.note || '');
  const command = String(input.command || '');
  const blob = [note, command].filter(Boolean).join('\n');
  const findings = [];

  const installText = SANDBOX_CREATE.test(blob)
    || CURL_INSTALL.test(blob)
    || NPX_SKILL.test(blob)
    || UV_ADD.test(blob)
    || NPM_SDK.test(blob)
    || CARGO_SDK.test(blob)
    || GO_SDK.test(blob)
    || CONTAINER.test(blob);
  if (action === 'install' || action === 'sandbox' || installText) {
    findings.push(finding('vendor_install'));
  }
  if (TELEMETRY_ON.test(blob)) findings.push(finding('telemetry_enable'));
  if (VENDOR_CLAIM.test(blob) && !ATTRIBUTED.test(blob)) {
    findings.push(finding('vendor_claim_as_local'));
  }

  const allowed = new Set(hostsOf(input.currentHosts));
  const widened = hostsOf(input.proposedHosts).some((host) => !allowed.has(host));
  if (widened || input.credentials === true || action === 'widen' || ATTACH_CREDENTIAL.test(blob)) {
    findings.push(finding('policy_widening'));
  }

  const seen = new Set();
  const unique = findings.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const humanReview = unique.some((item) => item.id === 'policy_widening');

  return {
    ok: unique.length === 0,
    status: unique.length ? 'blocked' : 'clear',
    findings: unique,
    applied: false,
    sandboxCreated: false,
    credentialAttached: false,
    humanReview,
    localKernelEnforced: null,
    localFormalProof: null,
    source: SOURCE,
  };
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : '';
}

function main() {
  const argv = process.argv.slice(2);
  const report = reviewOpenShellPolicy({
    action: argValue(argv, '--action') || 'note',
    note: argValue(argv, '--note'),
    command: argValue(argv, '--command'),
    proposedHosts: argValue(argv, '--proposed'),
    currentHosts: argValue(argv, '--current'),
    credentials: argValue(argv, '--credentials') === 'true',
  });
  if (argv.includes('--json')) console.log(JSON.stringify(report));
  else {
    console.log(report.ok ? 'OpenShell policy: clear' : 'OpenShell policy: blocked');
    for (const item of report.findings) console.log('blocked: ' + item.id);
    console.log('applied: false');
    console.log('humanReview: ' + report.humanReview);
  }
  process.exit(report.ok ? 0 : 2);
}

if (require.main === module) main();

module.exports = {
  SOURCE,
  reviewOpenShellPolicy,
};
