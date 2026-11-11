'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { routeRequest } = require('../tools/mac-yolo-service');
const {
  SAAS_PRODUCTS,
  MARKETPLACE_PLATFORMS,
  buildCursorInstallDeepLink,
  validateMcpToolAnnotations,
  validateManifestFiles,
  buildConnectorReviewBundleZip,
  buildMarketplacePromoDrafts,
  runMarketplacePublisher,
} = require('../tools/ai-connectors-marketplace-publisher');

describe('ai-connectors-marketplace-publisher', () => {
  it('validates Anthropic Claude Connectors title and safety annotations on all 12 MCP tools', () => {
    const res = validateMcpToolAnnotations();
    assert.equal(res.ok, true);
    assert.equal(res.toolsCount, 12);
    assert.equal(res.allToolsHaveTitleAndSafetyHints, true);
    assert.deepEqual(res.issues, []);
  });

  it('validates manifest files across Claude, Cursor, Gemini, ChatGPT, Grok, Perplexity, and Official MCP Registry', () => {
    const res = validateManifestFiles();
    assert.equal(res.ok, true);
    assert.equal(res.platformsCount, 7);
    assert.equal(MARKETPLACE_PLATFORMS.length, 7);
    assert.equal(SAAS_PRODUCTS.length, 3);

    const deepLink = buildCursorInstallDeepLink('thumbgate', {
      command: 'npx',
      args: ['-y', 'thumbgate', 'serve'],
    });
    assert.ok(deepLink.startsWith('cursor://anysphere.cursor-deeplink/mcp/install?name=thumbgate&config='));
  });

  it('serves Streamable HTTP /mcp and .well-known discovery endpoints via mac-yolo-service', () => {
    const getMcp = routeRequest('GET', '/mcp');
    assert.equal(getMcp.status, 200);
    assert.equal(getMcp.body.transport, 'streamable-http');
    assert.equal(getMcp.body.toolsCount, 12);

    const postMcpInit = routeRequest('POST', '/mcp', {
      jsonrpc: '2.0',
      id: 10,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });
    assert.equal(postMcpInit.status, 200);
    assert.equal(postMcpInit.body.result.serverInfo.name, 'mac-yolo-safeguards');

    const postMcpTools = routeRequest('POST', '/mcp', {
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/list',
    });
    assert.equal(postMcpTools.status, 200);
    assert.equal(postMcpTools.body.result.tools.length, 12);
    assert.equal(typeof postMcpTools.body.result.tools[0].title, 'string');
    assert.equal(typeof postMcpTools.body.result.tools[0].annotations.readOnlyHint, 'boolean');

    for (const endpoint of [
      '/.well-known/mcp.json',
      '/.well-known/mcp/server-card.json',
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-authorization-server',
      '/.well-known/ai-plugin.json',
      '/openapi.json',
      '/.well-known/agent.json',
      '/api/marketplace/connectors',
    ]) {
      const resp = routeRequest('GET', endpoint);
      assert.equal(resp.status, 200, `Expected 200 OK for ${endpoint}`);
    }
  });

  it('packs a sanitized connector review bundle ZIP and generates <=300 grapheme Bluesky promo facets', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marketplace-pub-test-'));
    const zipPath = path.join(tmpDir, 'connector-bundle.zip');
    const receiptPath = path.join(tmpDir, 'receipt.json');
    const otelPath = path.join(tmpDir, 'otel.jsonl');

    const bundle = buildConnectorReviewBundleZip({ outZip: zipPath });
    assert.equal(bundle.ok, true);
    assert.ok(bundle.sizeBytes > 500);
    assert.equal(typeof bundle.sha256, 'string');

    const promo = buildMarketplacePromoDrafts();
    assert.equal(promo.bluesky.withinLimit, true);
    assert.equal(promo.bluesky.facets.length, 3);
    assert.equal(promo.bluesky.facets[0].features[0].uri, 'https://dayglass.io');
    assert.equal(promo.bluesky.facets[1].features[0].uri, 'https://thumbgate.app');
    assert.equal(promo.bluesky.facets[2].features[0].uri, 'https://iganapolsky.gumroad.com/l/vcrho');

    const full = runMarketplacePublisher({
      outZip: zipPath,
      receiptPath,
      otelPath,
    });
    assert.equal(full.ok, true);
    assert.equal(fs.existsSync(receiptPath), true);
    assert.equal(fs.existsSync(otelPath), true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
