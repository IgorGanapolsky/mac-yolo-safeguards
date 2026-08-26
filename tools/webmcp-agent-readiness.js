#!/usr/bin/env node
'use strict';

/**
 * Fail-closed WebMCP readiness audit.
 *
 * This tool does not launch or mutate Chrome. It validates a separate readiness
 * manifest and, when supplied, fresh runtime evidence captured by a WebMCP-aware
 * browser/agent. Static correctness and observed journey success stay distinct.
 *
 * Sources:
 * - https://developer.chrome.com/docs/ai/webmcp
 * - https://developer.chrome.com/docs/ai/webmcp/evals
 * - https://developer.chrome.com/docs/ai/webmcp/secure-tools
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REPORT_VERSION = 1;
const DEFAULT_MAX_EVIDENCE_AGE_HOURS = 24;
const TOOL_NAME_MAX = 30;
const TOOL_DESCRIPTION_MAX = 500;
const PARAM_DESCRIPTION_MAX = 150;
const EFFECTS = new Set(['read', 'write', 'consequential']);
const CONFIRMATIONS = new Set(['not_applicable', 'agent_decides', 'required']);
const JOURNEY_MODES = new Set(['read_only', 'preview', 'sandbox']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
  return result;
}

function manifestSha256(manifest) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(manifest)))
    .digest('hex');
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.resolve(filePath))).digest('hex');
}

function validateSite(site, errors) {
  if (!nonEmptyString(site)) {
    errors.push('site must be a non-empty URL');
    return;
  }
  try {
    const url = new URL(site);
    const localDev = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !localDev) {
      errors.push('site must use HTTPS (HTTP is allowed only for local development)');
    }
  } catch {
    errors.push('site must be a valid URL');
  }
}

function validateInputSchema(tool, errors, warnings) {
  const prefix = `tool ${tool.name || '<unnamed>'}`;
  const schema = tool.inputSchema;
  if (!isObject(schema) || schema.type !== 'object' || !isObject(schema.properties)) {
    errors.push(`${prefix} inputSchema must be an object schema with properties`);
    return;
  }

  const propertyNames = Object.keys(schema.properties);
  for (const propertyName of propertyNames) {
    const property = schema.properties[propertyName];
    if (propertyName.length > TOOL_NAME_MAX) {
      errors.push(`${prefix} parameter ${propertyName} exceeds ${TOOL_NAME_MAX} characters`);
    }
    if (!isObject(property)) {
      errors.push(`${prefix} parameter ${propertyName} must be a schema object`);
      continue;
    }
    if (!nonEmptyString(property.description)) {
      errors.push(`${prefix} parameter ${propertyName} needs a description`);
    } else if (property.description.length > PARAM_DESCRIPTION_MAX) {
      errors.push(`${prefix} parameter ${propertyName} description exceeds ${PARAM_DESCRIPTION_MAX} characters`);
    }
    if (property.type === 'string' && (!Number.isInteger(property.maxLength) || property.maxLength <= 0)) {
      errors.push(`${prefix} parameter ${propertyName} must set a positive maxLength to bound agent input`);
    }
    if (property.type === 'array' && (!Number.isInteger(property.maxItems) || property.maxItems <= 0)) {
      errors.push(`${prefix} parameter ${propertyName} must set a positive maxItems to bound agent input`);
    }
  }

  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some((name) => !nonEmptyString(name))) {
      errors.push(`${prefix} inputSchema.required must be an array of property names`);
    } else {
      for (const requiredName of schema.required) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties, requiredName)) {
          errors.push(`${prefix} requires unknown parameter ${requiredName}`);
        }
      }
    }
  }
}

function validateManifest(manifest) {
  const errors = [];
  const warnings = [];

  if (!isObject(manifest)) return { errors: ['manifest must be a JSON object'], warnings };
  if (manifest.version !== 1) errors.push('manifest version must be 1');
  validateSite(manifest.site, errors);

  if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
    errors.push('tools must contain at least one WebMCP tool definition');
  }
  if (!isObject(manifest.policies)) errors.push('policies must map every tool name to a safety policy');
  if (!Array.isArray(manifest.journeys) || manifest.journeys.length === 0) {
    errors.push('journeys must contain at least one customer journey');
  }

  const tools = Array.isArray(manifest.tools) ? manifest.tools : [];
  const policies = isObject(manifest.policies) ? manifest.policies : {};
  const toolNames = new Set();

  for (const tool of tools) {
    if (!isObject(tool)) {
      errors.push('each tool must be an object');
      continue;
    }
    if (!nonEmptyString(tool.name)) {
      errors.push('each tool needs a non-empty name');
      continue;
    }
    if (tool.name.length > TOOL_NAME_MAX) {
      errors.push(`tool ${tool.name} name exceeds ${TOOL_NAME_MAX} characters`);
    }
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(tool.name)) {
      errors.push(`tool ${tool.name} uses unsupported name characters`);
    }
    if (toolNames.has(tool.name)) errors.push(`duplicate tool name ${tool.name}`);
    toolNames.add(tool.name);

    if (!nonEmptyString(tool.description)) {
      errors.push(`tool ${tool.name} needs a description`);
    } else if (tool.description.length > TOOL_DESCRIPTION_MAX) {
      errors.push(`tool ${tool.name} description exceeds ${TOOL_DESCRIPTION_MAX} characters`);
    }
    validateInputSchema(tool, errors, warnings);

    if (!isObject(tool.annotations) || typeof tool.annotations.readOnlyHint !== 'boolean') {
      errors.push(`tool ${tool.name} annotations.readOnlyHint must be boolean`);
    }
    if (
      isObject(tool.annotations) &&
      tool.annotations.untrustedContentHint !== undefined &&
      typeof tool.annotations.untrustedContentHint !== 'boolean'
    ) {
      errors.push(`tool ${tool.name} annotations.untrustedContentHint must be boolean when present`);
    }

    const policy = policies[tool.name];
    if (!isObject(policy)) {
      errors.push(`tool ${tool.name} is missing a safety policy`);
      continue;
    }
    if (!EFFECTS.has(policy.effect)) {
      errors.push(`tool ${tool.name} policy.effect must be read, write, or consequential`);
    }
    if (!CONFIRMATIONS.has(policy.confirmation)) {
      errors.push(`tool ${tool.name} policy.confirmation is invalid`);
    }

    const readOnlyHint = isObject(tool.annotations) ? tool.annotations.readOnlyHint : undefined;
    if (policy.effect === 'read') {
      if (readOnlyHint !== true) errors.push(`read tool ${tool.name} must set readOnlyHint=true`);
      if (policy.confirmation !== 'not_applicable') {
        errors.push(`read tool ${tool.name} confirmation must be not_applicable`);
      }
    }
    if (policy.effect === 'write' || policy.effect === 'consequential') {
      if (readOnlyHint !== false) errors.push(`${policy.effect} tool ${tool.name} must set readOnlyHint=false`);
    }
    if (policy.effect === 'write' && !['agent_decides', 'required'].includes(policy.confirmation)) {
      errors.push(`write tool ${tool.name} confirmation must be agent_decides or required`);
    }
    if (policy.effect === 'consequential' && policy.confirmation !== 'required') {
      errors.push(`consequential tool ${tool.name} confirmation must be required`);
    }
    if (
      policy.returnsUntrustedContent === true &&
      (!isObject(tool.annotations) || tool.annotations.untrustedContentHint !== true)
    ) {
      errors.push(`tool ${tool.name} returns untrusted content but does not set untrustedContentHint=true`);
    }
  }

  for (const policyName of Object.keys(policies)) {
    if (!toolNames.has(policyName)) errors.push(`policy references unknown tool ${policyName}`);
  }

  const journeyIds = new Set();
  const journeys = Array.isArray(manifest.journeys) ? manifest.journeys : [];
  for (const journey of journeys) {
    if (!isObject(journey) || !nonEmptyString(journey.id)) {
      errors.push('each journey needs a non-empty id');
      continue;
    }
    if (journeyIds.has(journey.id)) errors.push(`duplicate journey id ${journey.id}`);
    journeyIds.add(journey.id);
    if (!nonEmptyString(journey.prompt)) errors.push(`journey ${journey.id} needs a prompt`);
    if (!JOURNEY_MODES.has(journey.mode)) {
      errors.push(`journey ${journey.id} mode must be read_only, preview, or sandbox`);
    }
    if (!Array.isArray(journey.expectedCalls) || journey.expectedCalls.length === 0) {
      errors.push(`journey ${journey.id} expectedCalls must contain at least one tool`);
      continue;
    }

    let hasMutation = false;
    let hasConsequential = false;
    for (const toolName of journey.expectedCalls) {
      if (!toolNames.has(toolName)) {
        errors.push(`journey ${journey.id} references unknown tool ${toolName}`);
        continue;
      }
      const effect = policies[toolName] && policies[toolName].effect;
      if (effect === 'write' || effect === 'consequential') hasMutation = true;
      if (effect === 'consequential') hasConsequential = true;
    }
    if (journey.mode === 'read_only' && hasMutation) {
      errors.push(`journey ${journey.id} is read_only but calls a mutating tool`);
    }
    if (hasConsequential && !['preview', 'sandbox'].includes(journey.mode)) {
      errors.push(`journey ${journey.id} must use preview or sandbox mode for consequential tools`);
    }
  }

  return { errors, warnings };
}

function arraysEqual(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateRuntime(manifest, runtime, options = {}) {
  const errors = [];
  const warnings = [];
  if (!isObject(runtime)) return { errors: ['No runtime evidence was supplied'], warnings };

  const expectedDigest = manifestSha256(manifest);
  if (runtime.manifestSha256 !== expectedDigest) {
    errors.push(`runtime manifestSha256 does not match current manifest (${expectedDigest})`);
  }
  if (runtime.site !== manifest.site) errors.push('runtime site must exactly match the manifest site');
  if (!isObject(runtime.collector) || !nonEmptyString(runtime.collector.name) || !nonEmptyString(runtime.collector.version)) {
    errors.push('runtime collector.name and collector.version are required');
  }
  if (!/^[a-f0-9]{64}$/.test(runtime.artifactSha256 || '')) {
    errors.push('runtime artifactSha256 must be a lowercase SHA-256 digest of the raw capture');
  }
  if (!/^[a-f0-9]{64}$/.test(options.artifactSha256 || '')) {
    errors.push('raw capture artifact was not supplied or could not be hashed');
  } else if (runtime.artifactSha256 !== options.artifactSha256) {
    errors.push('runtime artifactSha256 does not match the supplied raw capture artifact');
  }

  const capturedMs = Date.parse(runtime.capturedAt);
  const now = options.now instanceof Date ? options.now : new Date();
  const maxAgeHours = Number.isFinite(options.maxEvidenceAgeHours)
    ? options.maxEvidenceAgeHours
    : DEFAULT_MAX_EVIDENCE_AGE_HOURS;
  if (!Number.isFinite(capturedMs)) {
    errors.push('runtime capturedAt must be an ISO timestamp');
  } else {
    const ageMs = now.getTime() - capturedMs;
    if (ageMs > maxAgeHours * 60 * 60 * 1000) {
      errors.push(`runtime evidence is older than ${maxAgeHours} hours`);
    }
    if (ageMs < -5 * 60 * 1000) errors.push('runtime capturedAt is more than five minutes in the future');
  }

  if (!isObject(runtime.browser) || !nonEmptyString(runtime.browser.name) || !nonEmptyString(runtime.browser.version)) {
    errors.push('runtime browser.name and browser.version are required');
  }
  for (const key of ['webmcpEnabled', 'originIsolated', 'toolsPermission']) {
    if (!isObject(runtime.browser) || runtime.browser[key] !== true) {
      errors.push(`runtime browser.${key} must be true`);
    }
  }

  const expectedTools = manifest.tools.map((tool) => tool.name).sort();
  const registeredTools = Array.isArray(runtime.registeredTools)
    ? [...runtime.registeredTools].sort()
    : null;
  if (!arraysEqual(registeredTools, expectedTools)) {
    errors.push('runtime registeredTools must exactly match the manifest tool set for the evaluated state');
  }
  if (!['production', 'sandbox'].includes(runtime.environment)) {
    errors.push('runtime environment must be production or sandbox');
  }

  if (!isObject(runtime.journeys)) {
    errors.push('runtime journeys evidence is required');
    return { errors, warnings };
  }

  for (const journey of manifest.journeys) {
    const evidence = runtime.journeys[journey.id];
    if (!isObject(evidence)) {
      errors.push(`runtime is missing journey ${journey.id}`);
      continue;
    }
    if (evidence.status !== 'pass') errors.push(`journey ${journey.id} status is not pass`);
    if (!arraysEqual(evidence.calls, journey.expectedCalls)) {
      errors.push(`journey ${journey.id} calls do not match expectedCalls in order`);
    }

    const effects = journey.expectedCalls.map((name) => manifest.policies[name].effect);
    const hasConsequential = effects.includes('consequential');
    if (hasConsequential && evidence.confirmationObserved !== true) {
      errors.push(`journey ${journey.id} must record confirmationObserved=true`);
    }
    if (journey.mode === 'preview' && hasConsequential && evidence.sideEffect !== 'not_executed') {
      errors.push(`journey ${journey.id} preview sideEffect must be not_executed`);
    }
    if (journey.mode === 'sandbox' && hasConsequential) {
      if (runtime.environment !== 'sandbox') {
        errors.push(`journey ${journey.id} sandbox verification requires runtime environment=sandbox`);
      }
      if (evidence.sideEffect !== 'verified') {
        errors.push(`journey ${journey.id} sandbox sideEffect must be verified`);
      }
    }
  }

  for (const runtimeJourney of Object.keys(runtime.journeys)) {
    if (!manifest.journeys.some((journey) => journey.id === runtimeJourney)) {
      warnings.push(`runtime contains unrequested journey ${runtimeJourney}`);
    }
  }
  return { errors, warnings };
}

function auditReadiness(manifest, runtime = null, options = {}) {
  const staticResult = validateManifest(manifest);
  const digest = isObject(manifest) ? manifestSha256(manifest) : null;
  const base = {
    reportVersion: REPORT_VERSION,
    manifestSha256: digest,
    staticReady: staticResult.errors.length === 0,
    runtimeVerified: false,
    staticErrors: staticResult.errors,
    runtimeErrors: [],
    warnings: [...staticResult.warnings],
  };

  if (staticResult.errors.length > 0) {
    return { ...base, status: 'BLOCKED', errors: [...staticResult.errors] };
  }
  if (options.staticOnly === true) {
    return { ...base, status: 'STATIC_READY', errors: [] };
  }

  const runtimeResult = validateRuntime(manifest, runtime, options);
  const report = {
    ...base,
    runtimeErrors: runtimeResult.errors,
    warnings: [...base.warnings, ...runtimeResult.warnings],
  };
  if (runtimeResult.errors.length > 0) {
    return { ...report, status: 'UNVERIFIED', errors: [...runtimeResult.errors] };
  }
  return { ...report, status: 'READY', runtimeVerified: true, errors: [] };
}

function usage() {
  return [
    'Usage: node tools/webmcp-agent-readiness.js --manifest <path> [options]',
    '',
    'Options:',
    '  --runtime <path>       Fresh WebMCP browser/journey evidence JSON',
    '  --artifact <path>      Raw browser capture bound to runtime artifactSha256',
    '  --static-only          Validate the contract without claiming runtime readiness',
    '  --max-age-hours <n>    Runtime evidence freshness limit (default: 24)',
    '  --out <path>           Write the JSON report to a file',
    '  --json                 Print JSON instead of a short text summary',
    '  --help                 Show this help without side effects',
    '',
    'Exit codes: 0=READY or STATIC_READY, 1=BLOCKED/input error, 2=UNVERIFIED',
  ].join('\n');
}

function parseArgs(argv) {
  const options = { json: false, staticOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--static-only') options.staticOnly = true;
    else if (arg === '--manifest' && argv[index + 1]) options.manifestPath = argv[++index];
    else if (arg === '--runtime' && argv[index + 1]) options.runtimePath = argv[++index];
    else if (arg === '--artifact' && argv[index + 1]) options.artifactPath = argv[++index];
    else if (arg === '--out' && argv[index + 1]) options.outPath = argv[++index];
    else if (arg === '--max-age-hours' && argv[index + 1]) {
      options.maxEvidenceAgeHours = Number(argv[++index]);
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return options;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  } catch (error) {
    throw new Error(`${label} JSON could not be read: ${error.message}`);
  }
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
    if (options.help) {
      console.log(usage());
      return 0;
    }
    if (!options.manifestPath) throw new Error('--manifest is required');
    if (!Number.isFinite(options.maxEvidenceAgeHours) && options.maxEvidenceAgeHours !== undefined) {
      throw new Error('--max-age-hours must be a number');
    }
    if (options.maxEvidenceAgeHours !== undefined && options.maxEvidenceAgeHours <= 0) {
      throw new Error('--max-age-hours must be positive');
    }

    const manifest = readJson(options.manifestPath, 'manifest');
    const runtime = options.runtimePath ? readJson(options.runtimePath, 'runtime') : null;
    if (options.artifactPath) options.artifactSha256 = fileSha256(options.artifactPath);
    const report = auditReadiness(manifest, runtime, options);
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (options.outPath) fs.writeFileSync(path.resolve(options.outPath), serialized, 'utf8');

    if (options.json) {
      process.stdout.write(serialized);
    } else {
      console.log(`WebMCP readiness: ${report.status}`);
      console.log(`Manifest: ${report.manifestSha256 || 'invalid'}`);
      console.log(`Static contract: ${report.staticReady ? 'ready' : 'blocked'}`);
      console.log(`Runtime journey: ${report.runtimeVerified ? 'verified' : 'not verified'}`);
      for (const error of report.errors) console.log(`- ${error}`);
      for (const warning of report.warnings) console.log(`- warning: ${warning}`);
    }

    if (report.status === 'BLOCKED') return 1;
    if (report.status === 'UNVERIFIED') return 2;
    return 0;
  } catch (error) {
    console.error(`WebMCP readiness error: ${error.message}`);
    return 1;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = {
  auditReadiness,
  canonicalize,
  fileSha256,
  manifestSha256,
  parseArgs,
  validateManifest,
  validateRuntime,
};
