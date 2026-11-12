#!/usr/bin/env node
'use strict';

/**
 * openshell-policy-prover.js — NVIDIA OpenShell Formal Policy Prover, Boundary Containment,
 * Endpoint-Bound Credential Proxy & Two-Layer Agent Control Plane for mac-yolo-safeguards.
 *
 * Adapts the core architectural primitives from NVIDIA/OpenShell (https://github.com/NVIDIA/OpenShell):
 *   1. Closed MCP Protocol Revision Vocabulary (`crates/openshell-policy-schema/src/lib.rs`):
 *      - Supported ordered revisions: `2025-03-26`, `2025-06-18`, `2025-11-25` (default), `2026-07-28`.
 *      - `MAX_MCP_LEGACY_BATCH_MESSAGES = 64`.
 *   2. Binary Capability Registry (`crates/openshell-prover/registry/binaries/*.yaml`):
 *      - Models `canExfiltrate`, `bypassesL7`, `canConstructHttp`, and `spawns` for coding-agent
 *        binaries (`claude`, `curl`, `gh`, `git`, `nc`, `node`, `python3`, `ssh`, `wget`).
 *   3. Formal Policy Change Prover (`crates/openshell-prover`):
 *      - Evaluates the 4 formal properties over `(binary, endpoint, credential)` reachability:
 *        * `link_local_reach` (unconditional): reach to `169.254.0.0/16` or `fe80::/10`
 *        * `l7_bypass_credentialed` (unconditional): L7-bypassing binary/protocol reaching a credentialed host
 *        * `credential_reach_expansion` (delta): new `(binary, host, port)` reach with credential in scope
 *        * `capability_expansion` (delta): new HTTP method on an already-reached credentialed `(binary, host, port)`
 *      - Implements Gateway Delta Category Suppression (`finding_delta`): suppresses `capability_expansion`
 *        when the same `(binary, host, port)` tuple is already reported in `credential_reach_expansion`.
 *   4. Filesystem & Process Boundary Containment (`openshell-prover-cli`):
 *      - Verifies candidate `read_only` / `read_write` path prefixes and `include_workdir` semantics
 *        against an operator boundary policy.
 *   5. Endpoint-Bound Credential Provider Proxy (`how-it-works/providers`):
 *      - Agents never receive raw secrets; opaque provider credentials are injected only when
 *        destination `(host, port, method, path)` and L7 inspection rules are satisfied.
 *   6. Two-Layer Formal + Semantic Control Plane:
 *      - Pairs Layer 1 (OpenShell Formal Prover) with Layer 2 (`gemini-decisions-engine.js`).
 */

const path = require('path');
const { evaluatePreActionDecisionPack } = require('./gemini-decisions-engine');

const MAX_MCP_LEGACY_BATCH_MESSAGES = 64;

const MCP_PROTOCOL_VERSIONS = Object.freeze([
  '2025-03-26',
  '2025-06-18',
  '2025-11-25',
  '2026-07-28',
]);

const DEFAULT_MCP_PROTOCOL_VERSION = '2025-11-25';

const PROVER_CATEGORIES = Object.freeze({
  LINK_LOCAL_REACH: 'link_local_reach',
  L7_BYPASS_CREDENTIALED: 'l7_bypass_credentialed',
  CREDENTIAL_REACH_EXPANSION: 'credential_reach_expansion',
  CAPABILITY_EXPANSION: 'capability_expansion',
});

const ACCESS_PRESET_METHODS = Object.freeze({
  'read-only': Object.freeze(['GET', 'HEAD', 'OPTIONS']),
  'read-write': Object.freeze(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH']),
  full: Object.freeze(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']),
});

const BINARY_CAPABILITY_REGISTRY = Object.freeze({
  '/usr/local/bin/claude': Object.freeze({
    binary: '/usr/local/bin/claude',
    description: 'Claude Code CLI — AI coding agent',
    canExfiltrate: true,
    bypassesL7: false,
    canConstructHttp: true,
    spawns: Object.freeze([
      '/usr/local/bin/node',
      '/usr/bin/python3',
      '/usr/bin/git',
      '/usr/bin/curl',
      '/usr/bin/ssh',
      '/usr/bin/nc',
    ]),
  }),
  '/usr/bin/curl': Object.freeze({
    binary: '/usr/bin/curl',
    description: 'cURL HTTP/network client',
    canExfiltrate: true,
    bypassesL7: false,
    canConstructHttp: true,
    spawns: Object.freeze([]),
  }),
  '/usr/local/bin/gh': Object.freeze({
    binary: '/usr/local/bin/gh',
    description: 'GitHub CLI',
    canExfiltrate: true,
    bypassesL7: false,
    canConstructHttp: true,
    spawns: Object.freeze(['/usr/bin/git', '/usr/bin/ssh']),
  }),
  '/usr/bin/git': Object.freeze({
    binary: '/usr/bin/git',
    description: 'Git version control client',
    canExfiltrate: true,
    bypassesL7: false,
    canConstructHttp: false,
    spawns: Object.freeze(['/usr/bin/ssh', '/usr/bin/curl']),
  }),
  '/usr/bin/nc': Object.freeze({
    binary: '/usr/bin/nc',
    description: 'Netcat raw socket utility (bypasses L7 HTTP inspection)',
    canExfiltrate: true,
    bypassesL7: true,
    canConstructHttp: true,
    spawns: Object.freeze([]),
  }),
  '/usr/local/bin/node': Object.freeze({
    binary: '/usr/local/bin/node',
    description: 'Node.js runtime',
    canExfiltrate: true,
    bypassesL7: false,
    canConstructHttp: true,
    spawns: Object.freeze(['/usr/bin/git', '/usr/bin/curl', '/usr/bin/ssh']),
  }),
  '/usr/bin/python3': Object.freeze({
    binary: '/usr/bin/python3',
    description: 'Python 3 runtime',
    canExfiltrate: true,
    bypassesL7: false,
    canConstructHttp: true,
    spawns: Object.freeze(['/usr/bin/git', '/usr/bin/curl', '/usr/bin/ssh']),
  }),
  '/usr/bin/ssh': Object.freeze({
    binary: '/usr/bin/ssh',
    description: 'OpenSSH client (encrypted tunnel, bypasses L7 HTTP inspection)',
    canExfiltrate: true,
    bypassesL7: true,
    canConstructHttp: false,
    spawns: Object.freeze([]),
  }),
  '/usr/bin/wget': Object.freeze({
    binary: '/usr/bin/wget',
    description: 'GNU Wget downloader',
    canExfiltrate: true,
    bypassesL7: false,
    canConstructHttp: true,
    spawns: Object.freeze([]),
  }),
});

/**
 * Validate and sort MCP protocol revisions according to OpenShell's closed vocabulary.
 */
function validateMcpProtocolVersions(versions, batchSize = 1) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_MCP_LEGACY_BATCH_MESSAGES) {
    const err = new Error(
      `ERR_MCP_BATCH_LIMIT_EXCEEDED: batchSize ${batchSize} exceeds MAX_MCP_LEGACY_BATCH_MESSAGES (${MAX_MCP_LEGACY_BATCH_MESSAGES})`,
    );
    err.code = 'ERR_MCP_BATCH_LIMIT_EXCEEDED';
    throw err;
  }
  if (versions === undefined || versions === null) {
    return {
      ok: true,
      effectiveVersions: [DEFAULT_MCP_PROTOCOL_VERSION],
      usedDefault: true,
    };
  }
  if (!Array.isArray(versions) || versions.length === 0) {
    const err = new Error('ERR_INVALID_MCP_VERSIONS: mcp.versions must be a non-empty array when provided');
    err.code = 'ERR_INVALID_MCP_VERSIONS';
    throw err;
  }

  const unsupported = [];
  const supported = [];
  for (const v of versions) {
    const raw = String(v);
    if (MCP_PROTOCOL_VERSIONS.includes(raw)) {
      supported.push(raw);
    } else {
      unsupported.push(raw);
    }
  }
  supported.sort((a, b) => MCP_PROTOCOL_VERSIONS.indexOf(a) - MCP_PROTOCOL_VERSIONS.indexOf(b));
  unsupported.sort();

  if (unsupported.length > 0) {
    const err = new Error(
      `ERR_UNSUPPORTED_MCP_PROTOCOL_VERSION: unsupported MCP protocol version '${unsupported[0]}'`,
    );
    err.code = 'ERR_UNSUPPORTED_MCP_PROTOCOL_VERSION';
    err.rejectedValues = unsupported;
    err.sortedOrder = [...supported, ...unsupported];
    throw err;
  }

  return {
    ok: true,
    effectiveVersions: supported,
    usedDefault: false,
  };
}

/**
 * Detect whether a host string is in IPv4 link-local (169.254.0.0/16) or IPv6 link-local (fe80::/10).
 */
function isLinkLocalHost(rawHost) {
  const host = String(rawHost || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (host === '169.254.169.254' || host === 'metadata.google.internal') {
    return true;
  }
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map(Number);
    if (octets.every((o) => o >= 0 && o <= 255)) {
      return octets[0] === 169 && octets[1] === 254;
    }
  }
  if (host.startsWith('fe80:') || /^fe[89ab][0-9a-f]:/i.test(host)) {
    return true;
  }
  return false;
}

/**
 * Resolve effective methods for a network policy rule.
 */
function resolveRuleMethods(rule) {
  if (Array.isArray(rule.methods) && rule.methods.length > 0) {
    return [...new Set(rule.methods.map((m) => String(m).toUpperCase()))].sort();
  }
  const preset = String(rule.access || 'read-only').toLowerCase();
  if (ACCESS_PRESET_METHODS[preset]) {
    return [...ACCESS_PRESET_METHODS[preset]];
  }
  if (String(rule.protocol || '').toLowerCase() === 'tcp' || preset === 'l4') {
    return [...ACCESS_PRESET_METHODS.full];
  }
  return [...ACCESS_PRESET_METHODS['read-only']];
}

/**
 * Extract normalized reachability facts from a policy document.
 */
function buildPolicyModel(policy = {}, credentialHosts = []) {
  if (!policy || typeof policy !== 'object') {
    throw new Error('ERR_INVALID_POLICY: policy object required');
  }
  const version = policy.version ?? 1;
  if (version !== 1) {
    const err = new Error(`ERR_UNSUPPORTED_POLICY_VERSION: version '${version}' is not supported`);
    err.code = 'ERR_UNSUPPORTED_POLICY_VERSION';
    throw err;
  }

  const credHostSet = new Set(
    (Array.isArray(credentialHosts) ? credentialHosts : []).map((h) => String(h).trim().toLowerCase()),
  );
  const rules = Array.isArray(policy.network_policies) ? policy.network_policies : [];
  const facts = [];

  for (const rule of rules) {
    const policyName = String(rule.name || 'unnamed_policy');
    const binaries = Array.isArray(rule.binaries) && rule.binaries.length > 0
      ? rule.binaries
      : ['/usr/local/bin/claude'];
    const endpoints = Array.isArray(rule.endpoints) && rule.endpoints.length > 0
      ? rule.endpoints
      : rule.host
        ? [{ host: rule.host, port: rule.port || 443 }]
        : [];
    const protocol = String(rule.protocol || 'https').toLowerCase();
    const methods = resolveRuleMethods(rule);

    for (const bin of binaries) {
      const reg = BINARY_CAPABILITY_REGISTRY[bin] || {
        binary: bin,
        canExfiltrate: true,
        bypassesL7: bin.endsWith('/ssh') || bin.endsWith('/nc'),
        canConstructHttp: true,
        spawns: [],
      };
      if (!reg.canExfiltrate) continue;

      const bypassesL7 = Boolean(reg.bypassesL7 || protocol === 'tcp');
      for (const ep of endpoints) {
        const host = String(ep.host || '').trim().toLowerCase();
        const port = Number(ep.port || 443);
        if (!host) continue;
        facts.push({
          policyName,
          binary: bin,
          host,
          port,
          protocol,
          bypassesL7,
          credentialInScope: credHostSet.has(host),
          linkLocal: isLinkLocalHost(host),
          methods,
        });
      }
    }
  }

  return {
    version,
    credentialHosts: [...credHostSet],
    facts,
  };
}

/**
 * Run OpenShell formal prover queries over a baseline policy and candidate policy.
 * Implements the 4 v1 categories and Gateway Delta Category Suppression.
 */
function provePolicyDelta({ baselinePolicy = null, candidatePolicy, credentialHosts = [] } = {}) {
  const candidateModel = buildPolicyModel(candidatePolicy, credentialHosts);
  const baselineModel = baselinePolicy
    ? buildPolicyModel(baselinePolicy, credentialHosts)
    : { facts: [] };

  const baselineReachKeys = new Set();
  const baselineMethodKeys = new Set();
  for (const f of baselineModel.facts) {
    if (f.credentialInScope) {
      const reachKey = `${f.binary}|${f.host}:${f.port}`;
      baselineReachKeys.add(reachKey);
      for (const m of f.methods) {
        baselineMethodKeys.add(`${reachKey}|${m}`);
      }
    }
  }

  const linkLocalPaths = [];
  const l7BypassPaths = [];
  const reachExpansionPaths = [];
  const rawCapabilityExpansionPaths = [];
  const newReachTuples = new Set();

  const seenFindingKeys = new Set();
  const pushUnique = (arr, pathObj) => {
    const key = `${pathObj.category}|${pathObj.binary}|${pathObj.endpointHost}:${pathObj.endpointPort}|${pathObj.method || ''}`;
    if (!seenFindingKeys.has(key)) {
      seenFindingKeys.add(key);
      arr.push(pathObj);
    }
  };

  for (const f of candidateModel.facts) {
    if (f.linkLocal) {
      pushUnique(linkLocalPaths, {
        binary: f.binary,
        endpointHost: f.host,
        endpointPort: f.port,
        mechanism: `${f.binary} can reach link-local/metadata endpoint ${f.host}:${f.port}`,
        policyName: f.policyName,
        category: PROVER_CATEGORIES.LINK_LOCAL_REACH,
        method: '',
      });
    }

    if (f.credentialInScope && f.bypassesL7) {
      pushUnique(l7BypassPaths, {
        binary: f.binary,
        endpointHost: f.host,
        endpointPort: f.port,
        mechanism: `${f.binary} bypasses L7 HTTP inspection (${f.protocol}) on credentialed endpoint ${f.host}:${f.port}`,
        policyName: f.policyName,
        category: PROVER_CATEGORIES.L7_BYPASS_CREDENTIALED,
        method: '',
      });
    }

    if (f.credentialInScope) {
      const reachKey = `${f.binary}|${f.host}:${f.port}`;
      if (!baselineReachKeys.has(reachKey)) {
        newReachTuples.add(reachKey);
        pushUnique(reachExpansionPaths, {
          binary: f.binary,
          endpointHost: f.host,
          endpointPort: f.port,
          mechanism: `${f.binary} gains new credentialed reach to ${f.host}:${f.port}`,
          policyName: f.policyName,
          category: PROVER_CATEGORIES.CREDENTIAL_REACH_EXPANSION,
          method: '',
        });
      } else {
        for (const m of f.methods) {
          const methodKey = `${reachKey}|${m}`;
          if (!baselineMethodKeys.has(methodKey)) {
            pushUnique(rawCapabilityExpansionPaths, {
              binary: f.binary,
              endpointHost: f.host,
              endpointPort: f.port,
              mechanism: `${f.binary} gains new HTTP method ${m} on credentialed endpoint ${f.host}:${f.port}`,
              policyName: f.policyName,
              category: PROVER_CATEGORIES.CAPABILITY_EXPANSION,
              method: m,
            });
          }
        }
      }
    }
  }

  // Gateway category suppression: suppress capability_expansion if (binary, host, port) is in credential_reach_expansion
  const capabilityExpansionPaths = rawCapabilityExpansionPaths.filter(
    (p) => !newReachTuples.has(`${p.binary}|${p.endpointHost}:${p.endpointPort}`),
  );

  const findings = [];
  if (linkLocalPaths.length > 0) {
    findings.push({ query: PROVER_CATEGORIES.LINK_LOCAL_REACH, paths: linkLocalPaths });
  }
  if (l7BypassPaths.length > 0) {
    findings.push({ query: PROVER_CATEGORIES.L7_BYPASS_CREDENTIALED, paths: l7BypassPaths });
  }
  if (reachExpansionPaths.length > 0) {
    findings.push({ query: PROVER_CATEGORIES.CREDENTIAL_REACH_EXPANSION, paths: reachExpansionPaths });
  }
  if (capabilityExpansionPaths.length > 0) {
    findings.push({ query: PROVER_CATEGORIES.CAPABILITY_EXPANSION, paths: capabilityExpansionPaths });
  }

  const allPaths = [
    ...linkLocalPaths,
    ...l7BypassPaths,
    ...reachExpansionPaths,
    ...capabilityExpansionPaths,
  ];

  return {
    ok: true,
    autoApproveEligible: findings.length === 0,
    requiresHumanReview: findings.length > 0,
    findingsCount: findings.length,
    totalExfilPaths: allPaths.length,
    findings,
    validationShorthand:
      findings.length === 0
        ? 'PROVER_CLEAN: 0 findings'
        : `PROVER_HOLD: ${findings.map((f) => `${f.query}(${f.paths.length})`).join(', ')}`,
  };
}

function normalizeLexicalPath(p) {
  const raw = String(p || '').trim();
  if (!raw.startsWith('/')) {
    throw new Error(`ERR_NON_ABSOLUTE_POLICY_PATH: path '${raw}' must be absolute`);
  }
  const norm = path.posix.normalize(raw);
  return norm.length > 1 ? norm.replace(/\/+$/, '') : norm;
}

function isPathCoveredByPrefixList(targetPath, allowedPrefixes) {
  const normTarget = normalizeLexicalPath(targetPath);
  return allowedPrefixes.some((prefix) => {
    const normPrefix = normalizeLexicalPath(prefix);
    if (normPrefix === '/') return true;
    return normTarget === normPrefix || normTarget.startsWith(`${normPrefix}/`);
  });
}

/**
 * Prove whether a candidate filesystem/process policy is strictly contained within an operator boundary.
 * Mirrors `openshell-prover-cli` boundary containment fixtures.
 */
function proveBoundaryContainment({ boundaryPolicy, candidatePolicy } = {}) {
  if (!boundaryPolicy || !candidatePolicy) {
    throw new Error('ERR_MISSING_BOUNDARY_OR_CANDIDATE: boundaryPolicy and candidatePolicy are required');
  }

  const extractFs = (pol) => {
    const hasExplicitFs = Object.prototype.hasOwnProperty.call(pol, 'filesystem_policy');
    const fsObj = pol.filesystem_policy || {};
    const isEmptyExplicit = hasExplicitFs && Object.keys(fsObj).length === 0;
    const includeWorkdir = hasExplicitFs
      ? Boolean(fsObj.include_workdir && !isEmptyExplicit)
      : true;
    const readOnly = Array.isArray(fsObj.read_only) ? fsObj.read_only.map(normalizeLexicalPath) : [];
    const readWrite = Array.isArray(fsObj.read_write) ? fsObj.read_write.map(normalizeLexicalPath) : [];
    return { includeWorkdir, readOnly, readWrite };
  };

  const bFs = extractFs(boundaryPolicy);
  const cFs = extractFs(candidatePolicy);
  const violations = [];

  if (cFs.includeWorkdir && !bFs.includeWorkdir) {
    violations.push({
      type: 'workdir_exceeds_boundary',
      detail: 'Candidate enables include_workdir while boundary forbids workdir access',
    });
  }

  const boundaryAllReadable = [...bFs.readOnly, ...bFs.readWrite];
  for (const roPath of cFs.readOnly) {
    if (!isPathCoveredByPrefixList(roPath, boundaryAllReadable)) {
      violations.push({
        type: 'read_only_exceeds_boundary',
        path: roPath,
        detail: `Candidate read_only path '${roPath}' is outside boundary readable prefixes`,
      });
    }
  }

  for (const rwPath of cFs.readWrite) {
    if (!isPathCoveredByPrefixList(rwPath, bFs.readWrite)) {
      violations.push({
        type: 'read_write_exceeds_boundary',
        path: rwPath,
        detail: `Candidate read_write path '${rwPath}' is outside boundary read_write prefixes`,
      });
    }
  }

  const bRootAllowed = Boolean(
    boundaryPolicy.process_policy && boundaryPolicy.process_policy.allow_root === true,
  );
  const cWantsRoot = Boolean(
    candidatePolicy.process_policy &&
      (candidatePolicy.process_policy.allow_root === true ||
        candidatePolicy.process_policy.user === 'root' ||
        candidatePolicy.process_policy.uid === 0),
  );
  if (cWantsRoot && !bRootAllowed) {
    violations.push({
      type: 'process_root_escalation',
      detail: 'Candidate requests root process execution outside boundary process_policy',
    });
  }

  return {
    ok: true,
    contained: violations.length === 0,
    violationsCount: violations.length,
    violations,
  };
}

/**
 * Evaluate OpenShell Endpoint-Bound Credential Provider injection for an outbound agent request.
 * Agents never see raw credentials; the gateway injects credentials only for approved endpoints & L7 methods.
 */
function evaluateEndpointCredentialInjection({
  providerName,
  credentialEnvVar,
  approvedEndpoints = [],
  request = {},
} = {}) {
  const host = String(request.host || '').trim().toLowerCase();
  const port = Number(request.port || 443);
  const method = String(request.method || 'GET').toUpperCase();
  const protocol = String(request.protocol || 'https').toLowerCase();
  const binary = String(request.binary || '/usr/local/bin/claude');

  const reg = BINARY_CAPABILITY_REGISTRY[binary];
  if (protocol !== 'https' || (reg && reg.bypassesL7)) {
    return {
      injectCredential: false,
      reason: 'l7_inspection_required_for_credential_injection',
      providerName: providerName || 'default',
      exposedSecretToAgentEnv: false,
    };
  }

  if (isLinkLocalHost(host)) {
    return {
      injectCredential: false,
      reason: 'link_local_destination_blocked',
      providerName: providerName || 'default',
      exposedSecretToAgentEnv: false,
    };
  }

  const matchedEndpoint = approvedEndpoints.find((ep) => {
    const epHost = String(ep.host || '').trim().toLowerCase();
    const epPort = Number(ep.port || 443);
    if (epHost !== host || epPort !== port) return false;
    const allowedMethods = resolveRuleMethods(ep);
    return allowedMethods.includes(method);
  });

  if (!matchedEndpoint) {
    return {
      injectCredential: false,
      reason: 'endpoint_or_method_not_approved_for_provider',
      providerName: providerName || 'default',
      exposedSecretToAgentEnv: false,
    };
  }

  return {
    injectCredential: true,
    reason: 'approved_l7_endpoint_bound_injection',
    providerName: providerName || 'default',
    credentialHandle: `openshell://provider/${providerName || 'default'}/${credentialEnvVar || 'TOKEN'}`,
    targetEndpoint: `${host}:${port}`,
    method,
    exposedSecretToAgentEnv: false,
  };
}

/**
 * Two-Layer Formal + Semantic Pre-Action Control Plane:
 * Combines Layer 1 (NVIDIA OpenShell Formal Policy Prover) with Layer 2 (Gemini Decisions Engine).
 */
function evaluateTwoLayerAgentAction({
  toolName = 'bash',
  command = '',
  baselinePolicy = null,
  candidatePolicy = null,
  boundaryPolicy = null,
  credentialHosts = [],
  confidenceThreshold = 0.75,
} = {}) {
  const formalProver = candidatePolicy
    ? provePolicyDelta({ baselinePolicy, candidatePolicy, credentialHosts })
    : {
        ok: true,
        autoApproveEligible: true,
        requiresHumanReview: false,
        findingsCount: 0,
        findings: [],
        validationShorthand: 'PROVER_SKIPPED_NO_POLICY_DELTA',
      };

  const boundaryCheck =
    boundaryPolicy && candidatePolicy
      ? proveBoundaryContainment({ boundaryPolicy, candidatePolicy })
      : { ok: true, contained: true, violationsCount: 0, violations: [] };

  const semanticDecision = evaluatePreActionDecisionPack(
    { toolName, command },
    { confidenceThreshold },
  );

  const hasUnconditionalProverRisk = formalProver.findings.some(
    (f) =>
      f.query === PROVER_CATEGORIES.LINK_LOCAL_REACH ||
      f.query === PROVER_CATEGORIES.L7_BYPASS_CREDENTIALED,
  );

  let finalAction = semanticDecision.effectiveAction;
  let finalReason = semanticDecision.escalationReason;

  if (!boundaryCheck.contained || hasUnconditionalProverRisk) {
    finalAction = 'hard_block_fail_closed';
    finalReason = !boundaryCheck.contained
      ? 'openshell_boundary_containment_violation'
      : 'openshell_unconditional_prover_risk';
  } else if (
    formalProver.requiresHumanReview &&
    finalAction !== 'hard_block_fail_closed'
  ) {
    finalAction = 'require_thumbgate_phone_approval';
    finalReason = 'openshell_policy_delta_requires_human_review';
  }

  return {
    ok: true,
    architecture: 'openshell_formal_prover_plus_gemini_decisions_v1',
    finalAction,
    finalReason,
    allowUnattendedExecution:
      finalAction === 'allow_local_silent' || finalAction === 'allow_with_lease_guard',
    layer1FormalProver: formalProver,
    layer1BoundaryContainment: boundaryCheck,
    layer2SemanticDecision: semanticDecision,
  };
}

module.exports = {
  MAX_MCP_LEGACY_BATCH_MESSAGES,
  MCP_PROTOCOL_VERSIONS,
  DEFAULT_MCP_PROTOCOL_VERSION,
  PROVER_CATEGORIES,
  BINARY_CAPABILITY_REGISTRY,
  validateMcpProtocolVersions,
  isLinkLocalHost,
  buildPolicyModel,
  provePolicyDelta,
  proveBoundaryContainment,
  evaluateEndpointCredentialInjection,
  evaluateTwoLayerAgentAction,
};
