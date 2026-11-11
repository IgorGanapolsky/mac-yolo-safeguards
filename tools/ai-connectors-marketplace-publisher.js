#!/usr/bin/env node
'use strict';

/**
 * tools/ai-connectors-marketplace-publisher.js
 *
 * Unified AI Connectors Marketplace Publisher, Validator, Bundle Packager & Promoter
 * for Mac YOLO Safeguards, ThumbGate (https://thumbgate.app), and Dayglass (https://dayglass.io).
 *
 * Targets:
 *   1. Claude Connectors Marketplace & Claude Plugins (claude.ai/directory/manage, .claude-plugin/*)
 *   2. Cursor Marketplace & Deep Links (cursor.com/marketplace/publish, cursor.directory, .cursor-plugin/plugin.json)
 *   3. Google Gemini Extensions & A2A Agent Card (geminicli.com, gemini-extension.json, .well-known/agent.json)
 *   4. ChatGPT Plugins / Actions & Codex (platform.openai.com/plugins, .well-known/ai-plugin.json, .well-known/openapi.json)
 *   5. xAI Grok Plugin & Connector Marketplace (x.ai/bot/marketplace/submit-a-plugin, plugin-metadata.json)
 *   6. Perplexity Connectors & Answer Engine Citations (connectors@perplexity.ai, llms.txt + OpenAPI 3.1.0)
 *   7. Official MCP Registry + Smithery + Glama (registry.modelcontextprotocol.io, server.json, smithery.yaml, glama.json)
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { getToolDefinitions, handleRpcRequest } = require('./mac-yolo-mcp-server');
const { assertAirgapSafe, buildBlueskyLinkFacets, countGraphemes } = require('./bluesky-flowstate-monetizer');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_BUNDLE_DIR = path.join(os.homedir(), '.hermes', 'artifacts', 'marketplace');
const DEFAULT_ZIP_PATH = path.join(DEFAULT_BUNDLE_DIR, 'mac-yolo-safeguards-connector-bundle.zip');
const DEFAULT_RECEIPT_PATH = path.join(os.homedir(), '.hermes', 'receipts', 'ai-connectors-marketplace-latest.json');
const DEFAULT_OTEL_PATH = path.join(os.homedir(), '.paperclip', 'operations', 'telemetry', 'otel_spans.jsonl');

const SAAS_PRODUCTS = Object.freeze([
  {
    id: 'dayglass',
    name: 'Dayglass',
    tagline: 'Local-first macOS screen & meeting memory with MCP context recall',
    websiteUrl: 'https://dayglass.io',
    repoUrl: 'https://github.com/IgorGanapolsky/dayglass',
    installCli: 'brew install --cask igorganapolsky/tap/dayglass',
  },
  {
    id: 'thumbgate',
    name: 'ThumbGate',
    tagline: 'Sub-0.5ms PreToolUse firewall & failure-to-spec compiler for AI coding agents',
    websiteUrl: 'https://thumbgate.app',
    repoUrl: 'https://github.com/IgorGanapolsky/ThumbGate',
    installCli: 'claude mcp add thumbgate -- npx -y thumbgate serve',
  },
  {
    id: 'mac-yolo-safeguards',
    name: 'Mac YOLO Safeguards',
    tagline: 'macOS freeze guard, 60s runaway simulator reaper & $10/mo API token budget gate',
    websiteUrl: 'https://iganapolsky.gumroad.com/l/vcrho',
    playbookUrl: 'https://iganapolsky.gumroad.com/l/odrkon',
    repoUrl: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
    installCli: 'claude mcp add mac-yolo-safeguards -- node tools/mac-yolo-mcp-server.js',
  },
]);

function buildCursorInstallDeepLink(serverName, configObj) {
  const b64 = Buffer.from(JSON.stringify(configObj), 'utf8').toString('base64');
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(serverName)}&config=${encodeURIComponent(b64)}`;
}

const MARKETPLACE_PLATFORMS = Object.freeze([
  {
    id: 'claude-connectors',
    name: 'Claude Connectors Marketplace & Claude Plugins',
    vendor: 'Anthropic',
    submissionPortalUrl: 'https://claude.ai/directory/manage',
    docsUrl: 'https://claude.com/docs/connectors/building/submission',
    manifestPaths: ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', '.well-known/mcp/server-card.json'],
    remoteMcpEndpoint: 'https://thumbgate.app/mcp',
    installCommands: [
      '/plugin marketplace add IgorGanapolsky/mac-yolo-safeguards',
      '/plugin marketplace add IgorGanapolsky/ThumbGate',
      'claude mcp add thumbgate -- npx -y thumbgate serve',
      'claude mcp add mac-yolo-safeguards -- node tools/mac-yolo-mcp-server.js',
    ],
  },
  {
    id: 'cursor-marketplace',
    name: 'Cursor Marketplace & MCP Directory',
    vendor: 'Anysphere (Cursor)',
    submissionPortalUrl: 'https://www.cursor.com/marketplace/publish',
    communityDirectoryUrl: 'https://cursor.directory',
    manifestPaths: ['.cursor-plugin/plugin.json', '.mcp.json'],
    oneClickDeepLinks: {
      thumbgate: buildCursorInstallDeepLink('thumbgate', {
        command: 'npx',
        args: ['-y', 'thumbgate', 'serve'],
      }),
      macYoloSafeguards: buildCursorInstallDeepLink('mac-yolo-safeguards', {
        command: 'node',
        args: ['tools/mac-yolo-mcp-server.js'],
      }),
    },
  },
  {
    id: 'gemini-extensions',
    name: 'Google Gemini Extensions & A2A Agent Directory',
    vendor: 'Google',
    submissionPortalUrl: 'https://console.cloud.google.com/apis/credentials/consent',
    docsUrl: 'https://geminicli.com/docs/extensions/releasing/',
    manifestPaths: ['gemini-extension.json', '.well-known/agent.json'],
    installCommands: [
      'gemini extensions install https://github.com/IgorGanapolsky/mac-yolo-safeguards',
      'gemini extensions install https://github.com/IgorGanapolsky/ThumbGate',
    ],
  },
  {
    id: 'chatgpt-plugins-actions',
    name: 'ChatGPT Plugins, Custom GPT Actions & Codex',
    vendor: 'OpenAI',
    submissionPortalUrl: 'https://platform.openai.com/plugins',
    docsUrl: 'https://developers.openai.com/plugins/deploy/submission',
    manifestPaths: ['.well-known/ai-plugin.json', '.well-known/openapi.json'],
    openApiSpecUrl: 'https://thumbgate.app/openapi.json',
    remoteMcpEndpoint: 'https://thumbgate.app/mcp',
  },
  {
    id: 'grok-xai-marketplace',
    name: 'xAI Grok Plugin & MCP Connector Marketplace',
    vendor: 'xAI',
    submissionPortalUrl: 'https://x.ai/bot/marketplace/submit-a-plugin',
    docsUrl: 'https://docs.x.ai/grok/connector-management',
    manifestPaths: ['plugin-metadata.json', '.well-known/openapi.json'],
    remoteMcpEndpoint: 'https://thumbgate.app/mcp',
  },
  {
    id: 'perplexity-connectors',
    name: 'Perplexity Connectors & Answer Engine Discovery',
    vendor: 'Perplexity AI',
    submissionContact: 'connectors@perplexity.ai',
    docsUrl: 'https://www.perplexity.ai/help-center/en/articles/2026092501-submit-a-connector-proposal',
    manifestPaths: ['.well-known/openapi.json', 'docs/landing/macyolosafeguards-llms.txt'],
    remoteMcpEndpoint: 'https://thumbgate.app/mcp',
  },
  {
    id: 'official-mcp-registry',
    name: 'Official MCP Registry, Smithery & Glama',
    vendor: 'Model Context Protocol / Linux Foundation',
    submissionPortalUrl: 'https://registry.modelcontextprotocol.io',
    manifestPaths: ['server.json', 'smithery.yaml', 'glama.json'],
    installCommands: [
      'mcp-publisher publish',
      'npx -y @smithery/cli install io.github.IgorGanapolsky/mac-yolo-safeguards --client claude',
    ],
  },
]);

function validateMcpToolAnnotations() {
  const tools = getToolDefinitions();
  const issues = [];
  for (const tool of tools) {
    if (!tool.title || typeof tool.title !== 'string') {
      issues.push(`Tool ${tool.name} is missing top-level "title"`);
    }
    const ann = tool.annotations || {};
    if (typeof ann.readOnlyHint !== 'boolean' && typeof ann.destructiveHint !== 'boolean') {
      issues.push(`Tool ${tool.name} is missing annotations.readOnlyHint / destructiveHint`);
    }
    if (!tool.description || tool.description.length < 15) {
      issues.push(`Tool ${tool.name} has an insufficient description`);
    }
  }
  const rpcInit = handleRpcRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05' },
  });
  const rpcList = handleRpcRequest({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  });
  return {
    ok: issues.length === 0 && Boolean(rpcInit?.result?.serverInfo?.name) && rpcList?.result?.tools?.length === tools.length,
    toolsCount: tools.length,
    allToolsHaveTitleAndSafetyHints: issues.length === 0,
    issues,
  };
}

function validateManifestFiles(repoRoot = ROOT) {
  const results = [];
  for (const platform of MARKETPLACE_PLATFORMS) {
    const fileChecks = platform.manifestPaths.map((rel) => {
      const abs = path.join(repoRoot, rel);
      const exists = fs.existsSync(abs);
      let validFormat = exists;
      if (exists && rel.endsWith('.json')) {
        try {
          JSON.parse(fs.readFileSync(abs, 'utf8'));
        } catch {
          validFormat = false;
        }
      }
      return { path: rel, exists, validFormat };
    });
    const ok = fileChecks.every((c) => c.exists && c.validFormat);
    results.push({
      id: platform.id,
      name: platform.name,
      vendor: platform.vendor,
      ok,
      submissionPortalUrl: platform.submissionPortalUrl || platform.submissionContact,
      fileChecks,
      installCommands: platform.installCommands || [],
      oneClickDeepLinks: platform.oneClickDeepLinks || null,
    });
  }
  return {
    ok: results.every((r) => r.ok),
    platformsCount: results.length,
    platforms: results,
  };
}

function buildConnectorReviewBundleZip(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const outZip = options.outZip || DEFAULT_ZIP_PATH;
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'connector-bundle-stage-'));

  try {
    const filesToCopy = [
      '.claude-plugin/plugin.json',
      '.claude-plugin/marketplace.json',
      '.well-known/mcp/server-card.json',
      '.well-known/ai-plugin.json',
      '.well-known/openapi.json',
      '.well-known/agent.json',
      'server.json',
      'smithery.yaml',
      'glama.json',
      'plugin-metadata.json',
      'package.json',
      'README.md',
      'tools/mac-yolo-mcp-server.js',
    ];

    for (const rel of filesToCopy) {
      const src = path.join(repoRoot, rel);
      if (!fs.existsSync(src)) continue;
      const dst = path.join(stagingDir, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }

    // Sanitize .cursor-plugin/plugin.json and gemini-extension.json so no "../../" external paths appear in the uploaded ZIP
    for (const rel of ['.cursor-plugin/plugin.json', 'gemini-extension.json']) {
      const src = path.join(repoRoot, rel);
      if (!fs.existsSync(src)) continue;
      const parsed = JSON.parse(fs.readFileSync(src, 'utf8'));
      if (Array.isArray(parsed.skills)) {
        parsed.skills = parsed.skills.filter((s) => typeof s.path === 'string' && !s.path.startsWith('..'));
      }
      const dst = path.join(stagingDir, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
    }

    fs.mkdirSync(path.dirname(outZip), { recursive: true });
    if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

    const zipRes = spawnSync('zip', ['-r', '-q', outZip, '.'], {
      cwd: stagingDir,
      encoding: 'utf8',
      timeout: 15000,
    });

    const exists = fs.existsSync(outZip);
    const bytes = exists ? fs.statSync(outZip).size : 0;
    const sha256 = exists
      ? crypto.createHash('sha256').update(fs.readFileSync(outZip)).digest('hex')
      : null;

    return {
      ok: zipRes.status === 0 && exists && bytes > 500,
      zipPath: outZip,
      sizeBytes: bytes,
      sha256,
      sanitizedExternalSkillPaths: true,
    };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

function buildMarketplacePromoDrafts() {
  const blueskyBody = [
    'Our macOS & AI agent SaaS stack now ships MCP Connectors for Claude, Cursor, Gemini, ChatGPT, Grok & Perplexity:',
    '• Dayglass: https://dayglass.io',
    '• ThumbGate: https://thumbgate.app',
    '• Mac YOLO Safeguards ($49): https://iganapolsky.gumroad.com/l/vcrho',
  ].join('\n');

  assertAirgapSafe(blueskyBody, 'marketplace-bluesky-promo');
  const graphemes = countGraphemes(blueskyBody);
  const facets = buildBlueskyLinkFacets(blueskyBody);

  const linkedinBody = [
    'We just unified our AI Connector & MCP packages across Claude Connectors, Cursor, Gemini Extensions, ChatGPT Actions, xAI Grok, and Perplexity.',
    '',
    '1. Dayglass (local-first macOS screen & meeting memory): https://dayglass.io',
    '2. ThumbGate (sub-0.5ms PreToolUse firewall & failure-to-spec compiler): https://thumbgate.app',
    '3. Mac YOLO Safeguards (60s runaway simulator reaper, RAM/swap guard & $10/mo API token budget gate): https://iganapolsky.gumroad.com/l/vcrho',
    '',
    'Install in Claude Code / Claude Desktop today:',
    '• claude mcp add thumbgate -- npx -y thumbgate serve',
    '• /plugin marketplace add IgorGanapolsky/mac-yolo-safeguards',
  ].join('\n');

  assertAirgapSafe(linkedinBody, 'marketplace-linkedin-promo');

  return {
    bluesky: {
      body: blueskyBody,
      graphemes,
      withinLimit: graphemes <= 300,
      facets,
    },
    linkedin: {
      body: linkedinBody,
      charLength: linkedinBody.length,
    },
  };
}

function emitOtelSpan(name, attributes, otelPath = DEFAULT_OTEL_PATH) {
  const nowNs = String(BigInt(Date.now()) * 1000000n);
  const span = {
    traceId: crypto.randomBytes(16).toString('hex'),
    spanId: crypto.randomBytes(8).toString('hex'),
    name,
    kind: 'INTERNAL',
    startTimeUnixNano: nowNs,
    endTimeUnixNano: nowNs,
    attributes: {
      'service.name': 'mac-yolo-safeguards',
      'gen_ai.system': 'ai-connectors-marketplace-publisher',
      ...attributes,
    },
    status: { code: 'OK' },
  };
  const serialized = JSON.stringify(span);
  assertAirgapSafe(serialized, 'otel-span');
  fs.mkdirSync(path.dirname(otelPath), { recursive: true });
  fs.appendFileSync(otelPath, `${serialized}\n`, 'utf8');
  return span;
}

function buildMarketplaceCatalogReport(options = {}) {
  const repoRoot = options.repoRoot || ROOT;
  const toolValidation = validateMcpToolAnnotations();
  const manifestValidation = validateManifestFiles(repoRoot);
  const promoDrafts = buildMarketplacePromoDrafts();

  return {
    ok: toolValidation.ok && manifestValidation.ok && promoDrafts.bluesky.withinLimit,
    generatedAt: new Date().toISOString(),
    products: SAAS_PRODUCTS,
    mcpToolValidation: toolValidation,
    marketplaceValidation: manifestValidation,
    promoDrafts,
  };
}

function runMarketplacePublisher(options = {}) {
  const report = buildMarketplaceCatalogReport(options);
  let bundle = null;
  if (options.packZip !== false) {
    bundle = buildConnectorReviewBundleZip({
      repoRoot: options.repoRoot || ROOT,
      outZip: options.outZip || DEFAULT_ZIP_PATH,
    });
  }

  const receiptPath = options.receiptPath || DEFAULT_RECEIPT_PATH;
  const otelPath = options.otelPath || DEFAULT_OTEL_PATH;
  const fullResult = {
    ...report,
    ok: report.ok && (bundle ? bundle.ok : true),
    bundle,
  };

  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, JSON.stringify(fullResult, null, 2) + '\n', 'utf8');

  emitOtelSpan(
    'gen_ai.marketplace.connectors_publish',
    {
      'gen_ai.marketplace.platforms_count': fullResult.marketplaceValidation.platformsCount,
      'gen_ai.marketplace.tools_count': fullResult.mcpToolValidation.toolsCount,
      'gen_ai.marketplace.bundle_ok': Boolean(bundle?.ok),
    },
    otelPath,
  );

  return fullResult;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const noZip = args.includes('--no-zip');
  const res = runMarketplacePublisher({ packZip: !noZip });
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.ok ? 0 : 1);
}

module.exports = {
  SAAS_PRODUCTS,
  MARKETPLACE_PLATFORMS,
  buildCursorInstallDeepLink,
  validateMcpToolAnnotations,
  validateManifestFiles,
  buildConnectorReviewBundleZip,
  buildMarketplacePromoDrafts,
  buildMarketplaceCatalogReport,
  runMarketplacePublisher,
};
