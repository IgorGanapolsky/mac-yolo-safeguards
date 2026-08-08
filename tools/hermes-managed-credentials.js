#!/usr/bin/env node
'use strict';

/**
 * hermes-managed-credentials.js — WorkOS Pipes "managed API key credential" pattern
 *
 * Newsletter (2026-08-04): "Pipes now supports providers that authenticate with
 * API keys … stores it as a managed credential — the same way it manages OAuth
 * tokens today. Integration code doesn't need to know the difference … rotating
 * a key is a single idempotent API call."
 *
 * Steal for Hermes fleet / ThumbGate control plane:
 *   - Credential refs are labels (keychain service+account or env var name)
 *   - Never embed or log secret material
 *   - vend() returns a handle with type (api_key | oauth) — callers use the same path
 *   - rotate() is idempotent by credential id
 *   - HARD never-spend: no purchase / upgrade paths
 *
 * Usage:
 *   node tools/hermes-managed-credentials.js --list --json
 *   node tools/hermes-managed-credentials.js --register --id baseten --type api_key \
 *     --service baseten.co --account model-api --json
 *   node tools/hermes-managed-credentials.js --vend --id baseten --json
 *   node tools/hermes-managed-credentials.js --rotate --id baseten --json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const HOME = os.homedir();
const DEFAULT_REGISTRY =
  process.env.HERMES_CREDENTIAL_REGISTRY ||
  path.join(HOME, '.hermes', 'managed-credentials.json');

const TYPES = new Set(['api_key', 'oauth']);

/** Providers we already use as flat/API-key fleet routes (no secrets stored here). */
const BUILTIN_CATALOG = Object.freeze([
  {
    id: 'litellm_gateway',
    type: 'api_key',
    service: 'hermes.litellm',
    account: 'master-key',
    envVar: 'LITELLM_MASTER_KEY',
    description: 'Local LiteLLM proxy master key',
  },
  {
    id: 'xai_grok',
    type: 'api_key',
    service: 'x.ai',
    account: 'api-key',
    envVar: 'XAI_API_KEY',
    description: 'xAI Grok / SuperGrok API key',
  },
  {
    id: 'baseten',
    type: 'api_key',
    service: 'baseten.co',
    account: 'model-api',
    envVar: 'BASETEN_API_KEY',
    description: 'Baseten Model APIs (mint only when SSO asked)',
  },
  {
    id: 'workos_prod',
    type: 'api_key',
    service: 'workos.com',
    account: 'production-api-key',
    envVar: 'WORKOS_API_KEY',
    description: 'WorkOS Production API key (ThumbGate AuthKit ≤$10/mo cap)',
  },
  {
    id: 'github',
    type: 'oauth',
    service: 'github.com',
    account: 'gh-cli',
    envVar: 'GH_TOKEN',
    description: 'GitHub via gh auth (OAuth-shaped)',
  },
]);

function loadRegistry(filePath = DEFAULT_REGISTRY) {
  try {
    if (!fs.existsSync(filePath)) {
      return { version: 1, credentials: {}, rotations: {} };
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      version: raw.version || 1,
      credentials: raw.credentials || {},
      rotations: raw.rotations || {},
    };
  } catch (err) {
    return { version: 1, credentials: {}, rotations: {}, loadError: err.message };
  }
}

function saveRegistry(registry, filePath = DEFAULT_REGISTRY) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const safe = {
    version: 1,
    credentials: registry.credentials || {},
    rotations: registry.rotations || {},
    updatedAt: new Date().toISOString(),
  };
  // Never persist secret material — only labels
  for (const id of Object.keys(safe.credentials)) {
    const c = safe.credentials[id];
    delete c.secret;
    delete c.token;
    delete c.apiKey;
    delete c.password;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(safe, null, 2)}\n`, { mode: 0o600 });
  return safe;
}

function listCredentials(options = {}) {
  const registry = loadRegistry(options.registryPath);
  const fromFile = Object.values(registry.credentials || {});
  const seen = new Set(fromFile.map((c) => c.id));
  const builtins = BUILTIN_CATALOG.filter((c) => !seen.has(c.id)).map((c) => ({
    ...c,
    source: 'builtin',
  }));
  const custom = fromFile.map((c) => ({ ...c, source: c.source || 'registry' }));
  return [...custom, ...builtins];
}

function registerCredential(spec, options = {}) {
  const id = String(spec.id || '').trim();
  if (!id) throw new Error('id required');
  const type = String(spec.type || 'api_key').trim();
  if (!TYPES.has(type)) throw new Error(`type must be one of ${[...TYPES].join('|')}`);

  // Hard never-spend vocabulary guard (no checkout/upgrade as a "credential")
  const blob = JSON.stringify(spec).toLowerCase();
  if (/\b(purchase|buy\s+credits|upgrade\s+plan|add\s+payment|checkout)\b/.test(blob)) {
    return {
      ok: false,
      error: 'never_spend',
      message: 'Managed credentials never encode purchase/upgrade actions',
    };
  }

  const registry = loadRegistry(options.registryPath);
  const entry = {
    id,
    type,
    service: String(spec.service || id).trim(),
    account: String(spec.account || 'default').trim(),
    envVar: spec.envVar ? String(spec.envVar).trim() : undefined,
    description: spec.description ? String(spec.description).trim() : undefined,
    source: 'registry',
    registeredAt: new Date().toISOString(),
  };
  registry.credentials[id] = entry;
  if (options.persist !== false) saveRegistry(registry, options.registryPath);
  return { ok: true, credential: publicView(entry) };
}

function publicView(entry) {
  return {
    id: entry.id,
    type: entry.type,
    service: entry.service,
    account: entry.account,
    envVar: entry.envVar || null,
    description: entry.description || null,
    source: entry.source || 'registry',
    // Secret presence is boolean only — never the value
    hasEnv: Boolean(entry.envVar && process.env[entry.envVar]),
  };
}

/**
 * Vend a credential handle. Callers get type + retrieval recipe, never the secret.
 * Integration code uses the same handle for api_key and oauth (Pipes pattern).
 */
function vendCredential(id, options = {}) {
  const all = listCredentials(options);
  const entry = all.find((c) => c.id === id);
  if (!entry) {
    return { ok: false, error: 'not_found', id };
  }
  const handle = {
    id: entry.id,
    type: entry.type,
    // Retrieval recipe (no secret)
    retrieval: {
      keychainService: entry.service,
      keychainAccount: entry.account,
      envVar: entry.envVar || null,
    },
    // Presence probes only
    present: {
      env: Boolean(entry.envVar && process.env[entry.envVar]),
    },
    // Opaque token id for audit (not the secret)
    handleId: `cred_${crypto.createHash('sha256').update(entry.id).digest('hex').slice(0, 12)}`,
  };
  return { ok: true, credential: handle };
}

/**
 * Idempotent rotate: same id + same intent within a short window returns prior receipt.
 * Does NOT call paid APIs or mint spend — only records a rotation intent / generation bump.
 */
function rotateCredential(id, options = {}) {
  const vend = vendCredential(id, options);
  if (!vend.ok) return vend;

  const registry = loadRegistry(options.registryPath);
  const intentKey = `${id}:${options.intent || 'manual'}`;
  const prior = registry.rotations[intentKey];
  const now = Date.now();
  const windowMs = options.idempotentWindowMs || 5 * 60 * 1000;

  if (prior && now - Date.parse(prior.at) < windowMs) {
    return {
      ok: true,
      idempotent: true,
      rotation: prior,
      credential: vend.credential,
    };
  }

  const generation = (prior && prior.generation ? prior.generation : 0) + 1;
  const rotation = {
    id,
    intent: options.intent || 'manual',
    generation,
    at: new Date().toISOString(),
    note: 'Rotation recorded as managed-credential intent only — human/keychain completes the secret swap',
  };
  registry.rotations[intentKey] = rotation;
  // Ensure catalog entry exists so rotations stick
  if (!registry.credentials[id]) {
    const fromList = listCredentials(options).find((c) => c.id === id);
    if (fromList) {
      registry.credentials[id] = {
        id: fromList.id,
        type: fromList.type,
        service: fromList.service,
        account: fromList.account,
        envVar: fromList.envVar,
        description: fromList.description,
        source: fromList.source,
      };
    }
  }
  if (options.persist !== false) saveRegistry(registry, options.registryPath);
  return {
    ok: true,
    idempotent: false,
    rotation,
    credential: vend.credential,
  };
}

function parseArgs(argv) {
  const args = { json: false, list: false, register: false, vend: false, rotate: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--list') args.list = true;
    else if (a === '--register') args.register = true;
    else if (a === '--vend') args.vend = true;
    else if (a === '--rotate') args.rotate = true;
    else if (a === '--id') args.id = argv[++i];
    else if (a === '--type') args.type = argv[++i];
    else if (a === '--service') args.service = argv[++i];
    else if (a === '--account') args.account = argv[++i];
    else if (a === '--env') args.envVar = argv[++i];
    else if (a === '--registry') args.registryPath = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage:
  node tools/hermes-managed-credentials.js --list [--json]
  node tools/hermes-managed-credentials.js --register --id NAME --type api_key|oauth --service S --account A [--json]
  node tools/hermes-managed-credentials.js --vend --id NAME [--json]
  node tools/hermes-managed-credentials.js --rotate --id NAME [--json]`);
    process.exit(0);
  }

  const opts = { registryPath: args.registryPath };
  let out;
  if (args.register) {
    out = registerCredential(
      {
        id: args.id,
        type: args.type,
        service: args.service,
        account: args.account,
        envVar: args.envVar,
      },
      opts,
    );
  } else if (args.vend) {
    out = vendCredential(args.id, opts);
  } else if (args.rotate) {
    out = rotateCredential(args.id, opts);
  } else {
    out = { ok: true, credentials: listCredentials(opts).map(publicView) };
  }

  if (args.json) console.log(JSON.stringify(out, null, 2));
  else console.log(JSON.stringify(out, null, 2));
  process.exit(out && out.ok === false ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  BUILTIN_CATALOG,
  TYPES,
  DEFAULT_REGISTRY,
  loadRegistry,
  saveRegistry,
  listCredentials,
  registerCredential,
  vendCredential,
  rotateCredential,
  publicView,
};
