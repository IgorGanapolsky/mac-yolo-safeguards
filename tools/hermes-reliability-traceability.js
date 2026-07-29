#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_REGISTRY = path.join(
  ROOT,
  'evals',
  'incidents',
  'hermes-mobile-july-2026.json',
);
const REGISTRY_SCHEMA = 'hermes/mobile-reliability-traceability/v1';
const MODES = new Set(['audit', 'release', 'claim']);
const INCIDENT_STATES = new Set([
  'open-pr',
  'draft-pr',
  'merged-unreleased',
  'device-unverified',
  'external-unverified',
  'verified',
]);
const EVIDENCE_STATES = new Set(['pass', 'fail', 'pending', 'blocked', 'unverified']);
const EVIDENCE_KINDS = new Set([
  'unit',
  'integration',
  'e2e',
  'physical-device',
  'hosted-ci',
  'store-publication',
  'store-search',
  'telemetry',
]);
const EXPECTED_INCIDENT_IDS = new Set([
  'play-search-hermes-ai',
  'play-search-hermes-mobile-top-five',
  'open-leash-without-approval',
  'computer-discovery-empty',
  'manual-tailscale-derp-timeout',
  'duplicate-message-echo',
  'computer-no-reply',
  'retry-arrow-noop',
  'failed-attachment-retry-loss',
]);
const FORBIDDEN_CONTENT_KEYS = new Set([
  'rawPrompt',
  'promptBody',
  'messageBody',
  'chatContent',
  'attachmentName',
  'attachmentBytes',
  'apiKey',
  'pairingCode',
  'gatewayUrl',
  'hostname',
  'ipAddress',
]);

function usage() {
  return `Usage:
  hermes-reliability-traceability [--registry PATH]
    [--mode audit|release|claim] [--json]

audit: validate the incident ledger and proof boundaries.
release: additionally fail while a product-blocking incident is unverified.
claim: additionally fail while a claim-blocking incident is unverified.`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    registry: DEFAULT_REGISTRY,
    mode: 'audit',
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--registry') {
      const value = argv[++index];
      if (!value) throw new Error('--registry requires a value');
      args.registry = path.resolve(value);
    } else if (arg === '--mode') {
      const value = argv[++index];
      if (!value) throw new Error('--mode requires a value');
      args.mode = value;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!MODES.has(args.mode)) {
    throw new Error(`--mode must be one of: ${[...MODES].join(', ')}`);
  }
  return args;
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 240) return false;
  if (path.isAbsolute(value) || value.includes('\0')) return false;
  if (!/^[A-Za-z0-9.][A-Za-z0-9._/-]*$/.test(value)) return false;
  const normalized = path.normalize(value);
  return normalized !== '..' && !normalized.startsWith(`..${path.sep}`);
}

function assertPrivacySafe(value, location = 'registry') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPrivacySafe(entry, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(value)) {
        throw new Error(`${location}: raw IP addresses are forbidden`);
      }
      if (/(?:ghp_|github_pat_|sk_live_|pairing code\s*[:=])/i.test(value)) {
        throw new Error(`${location}: secret-shaped text is forbidden`);
      }
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_CONTENT_KEYS.has(key)) {
      throw new Error(`${location}.${key}: raw user or credential content is forbidden`);
    }
    assertPrivacySafe(entry, `${location}.${key}`);
  }
}

function requireString(value, location) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${location} must be a non-empty string`);
  }
}

function validatePullRequest(pullRequest, incidentId) {
  if (!pullRequest || typeof pullRequest !== 'object' || Array.isArray(pullRequest)) {
    throw new Error(`${incidentId}: open PR state requires pullRequest evidence`);
  }
  if (!Number.isInteger(pullRequest.number) || pullRequest.number < 1) {
    throw new Error(`${incidentId}: pullRequest.number must be positive`);
  }
  if (
    pullRequest.url
    !== `https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/${pullRequest.number}`
  ) {
    throw new Error(`${incidentId}: pullRequest.url must match the repository and number`);
  }
  if (!/^[a-f0-9]{40}$/i.test(String(pullRequest.headSha || ''))) {
    throw new Error(`${incidentId}: pullRequest.headSha must bind an exact revision`);
  }
  if (!['CLEAN', 'BEHIND', 'BLOCKED', 'DIRTY', 'UNKNOWN'].includes(pullRequest.mergeState)) {
    throw new Error(`${incidentId}: pullRequest.mergeState is invalid`);
  }
}

function validateEvidence(evidence, incident, repoRoot) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new Error(`${incident.id}: evidence must be a non-empty array`);
  }
  for (const [index, item] of evidence.entries()) {
    const location = `${incident.id}.evidence[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`${location} must be an object`);
    }
    if (!EVIDENCE_KINDS.has(item.kind)) throw new Error(`${location}.kind is invalid`);
    if (!EVIDENCE_STATES.has(item.state)) {
      throw new Error(`${location}.state is invalid; queued/skipped are never proof states`);
    }
    requireString(item.source, `${location}.source`);
    if (item.source.startsWith('repo:')) {
      const relativePath = item.source.slice('repo:'.length);
      if (!isSafeRelativePath(relativePath)) {
        throw new Error(`${location}.source must stay inside the repository`);
      }
      const fullPath = path.resolve(repoRoot, relativePath);
      if (
        fullPath !== repoRoot
        && !fullPath.startsWith(`${repoRoot}${path.sep}`)
      ) {
        throw new Error(`${location}.source escaped the repository`);
      }
      if (!fs.existsSync(fullPath)) {
        throw new Error(`${location}.source does not exist: ${relativePath}`);
      }
    } else if (
      !item.source.startsWith('github:https://github.com/')
      && !item.source.startsWith('external:')
      && !item.source.startsWith('plan:')
    ) {
      throw new Error(`${location}.source must be repo, GitHub, external, or plan evidence`);
    }
    if (item.state === 'pass' && item.source.startsWith('external:user-observation')) {
      throw new Error(`${location}: a user observation cannot be promoted to pass proof`);
    }
  }
}

function validateRegistry(registry, options = {}) {
  const repoRoot = path.resolve(options.repoRoot || ROOT);
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new Error('registry must be an object');
  }
  if (registry.schema !== REGISTRY_SCHEMA) {
    throw new Error(`registry schema must be ${REGISTRY_SCHEMA}`);
  }
  if (!/^[A-Za-z0-9_]{20,80}$/.test(String(registry.researchRunId || ''))) {
    throw new Error('researchRunId must be an opaque run identifier');
  }
  if (!Array.isArray(registry.incidents)) throw new Error('incidents must be an array');
  assertPrivacySafe(registry);

  const ids = new Set();
  for (const incident of registry.incidents) {
    if (!incident || typeof incident !== 'object' || Array.isArray(incident)) {
      throw new Error('every incident must be an object');
    }
    requireString(incident.id, 'incident.id');
    if (ids.has(incident.id)) throw new Error(`duplicate incident id: ${incident.id}`);
    ids.add(incident.id);
    if (!EXPECTED_INCIDENT_IDS.has(incident.id)) {
      throw new Error(`unexpected incident id: ${incident.id}`);
    }
    requireString(incident.title, `${incident.id}.title`);
    requireString(incident.owner, `${incident.id}.owner`);
    requireString(incident.surface, `${incident.id}.surface`);
    if (!INCIDENT_STATES.has(incident.state)) {
      throw new Error(`${incident.id}: state is invalid`);
    }
    if (typeof incident.productBlocking !== 'boolean') {
      throw new Error(`${incident.id}: productBlocking must be boolean`);
    }
    if (typeof incident.claimBlocking !== 'boolean') {
      throw new Error(`${incident.id}: claimBlocking must be boolean`);
    }
    if (!Array.isArray(incident.requiredEvidence) || incident.requiredEvidence.length === 0) {
      throw new Error(`${incident.id}: requiredEvidence must be non-empty`);
    }
    const requiredEvidence = new Set(incident.requiredEvidence);
    if (requiredEvidence.size !== incident.requiredEvidence.length) {
      throw new Error(`${incident.id}: requiredEvidence contains duplicates`);
    }
    for (const kind of requiredEvidence) {
      if (!EVIDENCE_KINDS.has(kind)) {
        throw new Error(`${incident.id}: required evidence kind ${kind} is invalid`);
      }
    }
    validateEvidence(incident.evidence, incident, repoRoot);
    if (['open-pr', 'draft-pr'].includes(incident.state)) {
      validatePullRequest(incident.pullRequest, incident.id);
    } else if (incident.pullRequest !== undefined) {
      validatePullRequest(incident.pullRequest, incident.id);
    }
    if (incident.plannedProofPaths !== undefined) {
      if (
        !Array.isArray(incident.plannedProofPaths)
        || !incident.plannedProofPaths.every(isSafeRelativePath)
      ) {
        throw new Error(`${incident.id}: plannedProofPaths must be safe repository paths`);
      }
    }

    const passedKinds = new Set(
      incident.evidence
        .filter((item) => item.state === 'pass')
        .map((item) => item.kind),
    );
    const missingPassedKinds = [...requiredEvidence].filter((kind) => !passedKinds.has(kind));
    if (incident.state === 'verified' && missingPassedKinds.length > 0) {
      throw new Error(
        `${incident.id}: verified state is missing pass evidence for ${missingPassedKinds.join(', ')}`,
      );
    }
    if (
      incident.surface === 'store-discovery'
      && incident.state === 'verified'
      && !passedKinds.has('store-search')
    ) {
      throw new Error(`${incident.id}: store publication is not store-search proof`);
    }
  }

  const missing = [...EXPECTED_INCIDENT_IDS].filter((id) => !ids.has(id));
  if (missing.length > 0) throw new Error(`missing required incidents: ${missing.join(', ')}`);
  return registry;
}

function evaluateRegistry(registry, options = {}) {
  const mode = options.mode || 'audit';
  if (!MODES.has(mode)) throw new Error(`unsupported mode: ${mode}`);
  validateRegistry(registry, options);
  const unresolved = registry.incidents.filter((incident) => incident.state !== 'verified');
  const releaseBlockers = unresolved.filter((incident) => incident.productBlocking);
  const claimBlockers = unresolved.filter((incident) => incident.claimBlocking);
  const blockers = mode === 'release'
    ? releaseBlockers
    : mode === 'claim'
      ? claimBlockers
      : [];
  return {
    schema: 'hermes/mobile-reliability-traceability-report/v1',
    registryVersion: registry.version,
    researchRunId: registry.researchRunId,
    mode,
    status: blockers.length === 0 ? 'pass' : 'blocked',
    metrics: {
      incidents: registry.incidents.length,
      verified: registry.incidents.length - unresolved.length,
      unresolved: unresolved.length,
      releaseBlockers: releaseBlockers.length,
      claimBlockers: claimBlockers.length,
    },
    blockerIds: blockers.map((incident) => incident.id).sort(),
  };
}

function render(report) {
  return [
    '=== Hermes Mobile Reliability Traceability ===',
    `registry=${report.registryVersion} mode=${report.mode} status=${report.status}`,
    `incidents=${report.metrics.incidents} verified=${report.metrics.verified} unresolved=${report.metrics.unresolved}`,
    `release_blockers=${report.metrics.releaseBlockers} claim_blockers=${report.metrics.claimBlockers}`,
    report.blockerIds.length > 0 ? `blockers=${report.blockerIds.join(',')}` : 'blockers=none',
    '',
  ].join('\n');
}

function loadRegistry(registryPath = DEFAULT_REGISTRY) {
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    const report = evaluateRegistry(loadRegistry(args.registry), { mode: args.mode });
    process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : render(report));
    return report.status === 'pass' ? 0 : 1;
  } catch (error) {
    process.stderr.write(`hermes-reliability-traceability: ${error.message}\n`);
    return 2;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = {
  DEFAULT_REGISTRY,
  EVIDENCE_KINDS,
  EVIDENCE_STATES,
  EXPECTED_INCIDENT_IDS,
  INCIDENT_STATES,
  REGISTRY_SCHEMA,
  assertPrivacySafe,
  evaluateRegistry,
  isSafeRelativePath,
  loadRegistry,
  main,
  parseArgs,
  render,
  validateRegistry,
};
