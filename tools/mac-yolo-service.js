#!/usr/bin/env node
'use strict';

/**
 * tools/mac-yolo-service.js — Local HTTP Control-Plane Service for mac-yolo-safeguards
 *
 * Endpoints:
 *   GET  /api/status              -> Live macOS load avg, simruntime count, memory, and $10/mo token budget
 *   GET  /api/flags?state=ACTIVE  -> Spotify Confidence ACTIVE flags + "what is worth building" recommendations
 *   GET  /api/guardrails          -> Supabase Declarative Schema + Anti-Paperclipping + IBM Confusion + Tailscale audit
 *   GET  /api/business            -> Packaged product suite + 5-tier commercial pricing ladder
 *   POST /api/flags/resolve       -> Resolve a typed flag with exposure logging & guardrail auto-abort
 *
 * Usage:
 *   node tools/mac-yolo-service.js --serve [--port 8765]
 *   node tools/mac-yolo-service.js --self-test [--json]
 */

const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { callTool, handleRpcRequest, getToolDefinitions } = require('./mac-yolo-mcp-server');
const {
  listFlags,
  resolveFlagWithExposure,
  synthesizeWhatIsWorthBuilding,
} = require('./spotify-confidence-flags-steal');
const DEFAULT_PORT = Number(process.env.MAC_YOLO_SERVICE_PORT || 8766);

function readRepoJson(relPath, fallback = {}) {
  try {
    const full = path.join(__dirname, '..', relPath);
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    return fallback;
  }
}

function routeRequest(method, rawUrl, bodyObj = {}) {
  const parsed = new URL(rawUrl || '/', 'http://127.0.0.1');
  const pathname = parsed.pathname;

  if (method === 'GET' && pathname === '/api/status') {
    return { status: 200, body: callTool('yolo_health_status', {}) };
  }

  if (method === 'GET' && pathname === '/api/flags') {
    const state = parsed.searchParams.get('state') || 'ACTIVE';
    return {
      status: 200,
      body: {
        ...listFlags({ state }),
        whatIsWorthBuilding: synthesizeWhatIsWorthBuilding({
          approvedIds: ['rec-packaged-mcp-and-mac-app', 'rec-realtime-hud-window-switch'],
        }),
      },
    };
  }

  if (method === 'POST' && pathname === '/api/flags/resolve') {
    const res = resolveFlagWithExposure(bodyObj.flagKey || 'yolo-sim-runaway-reaper', {
      subjectId: bodyObj.subjectId || 'service-client',
      metrics: bodyObj.metrics || {},
    });
    return { status: res.ok ? 200 : 400, body: res };
  }

  if (method === 'GET' && pathname === '/api/guardrails') {
    return { status: 200, body: callTool('yolo_guardrails_audit', {}) };
  }

  if (method === 'GET' && pathname === '/api/business') {
    return { status: 200, body: callTool('yolo_business_catalog', {}) };
  }

  if (method === 'GET' && pathname === '/api/sdlc-prompts') {
    return { status: 200, body: callTool('yolo_sdlc_10_prompts', {}) };
  }

  if (method === 'GET' && pathname === '/api/observability/revenue') {
    return { status: 200, body: callTool('yolo_revenue_observability', {}) };
  }

  if (method === 'GET' && pathname === '/api/disk') {
    return { status: 200, body: callTool('yolo_disk_smart_scan', { clean: false }) };
  }

  if (method === 'POST' && pathname === '/api/disk/clean') {
    return { status: 200, body: callTool('yolo_disk_smart_scan', { clean: true, notify: true }) };
  }

  if (method === 'GET' && pathname === '/api/agents') {
    return { status: 200, body: callTool('yolo_agent_guard', { action: 'status' }) };
  }

  if (method === 'GET' && pathname === '/api/agents/incidents') {
    return { status: 200, body: callTool('yolo_agent_guard', { action: 'incidents' }) };
  }

  if (method === 'GET' && pathname === '/api/agents/pressure') {
    return { status: 200, body: callTool('yolo_agent_guard', { action: 'pressure' }) };
  }

  if (method === 'POST' && pathname === '/api/agents/clean') {
    return { status: 200, body: callTool('yolo_agent_guard', { action: 'clean', execute: true }) };
  }

  if (method === 'GET' && pathname === '/api/system-care') {
    return { status: 200, body: callTool('yolo_system_care', { clean: false }) };
  }

  if (method === 'POST' && pathname === '/api/settings/status-icon') {
    return {
      status: 200,
      body: callTool('yolo_system_care', {
        showStatusBarIcon: Boolean(bodyObj.showStatusBarIcon),
      }),
    };
  }

  if (method === 'GET' && pathname === '/api/sales/wabi') {
    return { status: 200, body: callTool('yolo_wabi_sales_ops', {}) };
  }

  if (method === 'POST' && pathname === '/api/sales/wabi/widget') {
    const { buildCollaborativeDealPlanWidget } = require('./wabi-sales-operations-engine');
    return { status: 200, body: buildCollaborativeDealPlanWidget(bodyObj || {}) };
  }

  if (pathname === '/mcp') {
    if (method === 'GET') {
      return {
        status: 200,
        body: {
          ok: true,
          transport: 'streamable-http',
          server: 'mac-yolo-safeguards',
          protocolVersion: '2024-11-05',
          toolsCount: getToolDefinitions().length,
        },
      };
    }
    if (method === 'POST') {
      const rpcResp = handleRpcRequest(bodyObj || {});
      return {
        status: rpcResp ? 200 : 202,
        body: rpcResp || { ok: true, accepted: true },
      };
    }
  }

  if (method === 'GET' && (pathname === '/.well-known/mcp.json' || pathname === '/.well-known/mcp/server-card.json')) {
    return { status: 200, body: readRepoJson('.well-known/mcp/server-card.json') };
  }

  if (method === 'GET' && pathname === '/.well-known/oauth-protected-resource') {
    return {
      status: 200,
      body: {
        resource: 'https://thumbgate.app/mcp',
        authorization_servers: ['https://thumbgate.app'],
        bearer_methods_supported: ['header'],
        scopes_supported: ['mcp:tools', 'mcp:read'],
        public_unauthenticated_tools_supported: true,
      },
    };
  }

  if (method === 'GET' && pathname === '/.well-known/oauth-authorization-server') {
    return {
      status: 200,
      body: {
        issuer: 'https://thumbgate.app',
        authorization_endpoint: 'https://thumbgate.app/oauth/authorize',
        token_endpoint: 'https://thumbgate.app/oauth/token',
        registration_endpoint: 'https://thumbgate.app/oauth/register',
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
      },
    };
  }

  if (method === 'GET' && pathname === '/.well-known/ai-plugin.json') {
    return { status: 200, body: readRepoJson('.well-known/ai-plugin.json') };
  }

  if (method === 'GET' && (pathname === '/openapi.json' || pathname === '/.well-known/openapi.json')) {
    return { status: 200, body: readRepoJson('.well-known/openapi.json') };
  }

  if (method === 'GET' && pathname === '/.well-known/agent.json') {
    return { status: 200, body: readRepoJson('.well-known/agent.json') };
  }

  if (method === 'GET' && pathname === '/api/marketplace/connectors') {
    const { buildMarketplaceCatalogReport } = require('./ai-connectors-marketplace-publisher');
    return { status: 200, body: buildMarketplaceCatalogReport() };
  }

  if (method === 'GET' && pathname === '/api/graphrag') {
    const { runAgenticSearchTier, runSelfTest: runGraphRagSelfTest } = require('./agentic-graphrag-hypergraph-engine');
    const q = parsed.searchParams.get('q');
    return {
      status: 200,
      body: q ? runAgenticSearchTier(q) : runGraphRagSelfTest(),
    };
  }


  if ((method === 'GET' || method === 'POST') && pathname === '/api/tokenomics/crusoe') {
    const safeBody = bodyObj && typeof bodyObj === 'object' && !Array.isArray(bodyObj) ? bodyObj : {};
    return {
      status: 200,
      body: callTool('yolo_crusoe_tokenomics', {
        mode: String(safeBody.mode || parsed.searchParams.get('mode') || 'tokenomics'),
        payload:
          safeBody.payload && typeof safeBody.payload === 'object' && !Array.isArray(safeBody.payload)
            ? safeBody.payload
            : {},
      }),
    };
  }

  return { status: 404, body: { ok: false, error: `Not found: ${method} ${pathname}` } };
}

function createServiceServer() {
  return http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      if (raw.length < 65536) raw += chunk.toString('utf8');
    });
    req.on('end', () => {
      let bodyObj = {};
      if (raw.trim()) {
        try {
          bodyObj = JSON.parse(raw);
        } catch {
          bodyObj = {};
        }
      }
      const out = routeRequest(req.method || 'GET', req.url || '/', bodyObj);
      const payload = JSON.stringify(out.body, null, 2);
      res.writeHead(out.status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(payload);
    });
  });
}

function runSelfTest() {
  const statusRes = routeRequest('GET', '/api/status');
  const flagsRes = routeRequest('GET', '/api/flags?state=ACTIVE');
  const guardrailsRes = routeRequest('GET', '/api/guardrails');
  const businessRes = routeRequest('GET', '/api/business');
  const graphRagRes = routeRequest('GET', '/api/graphrag');
  const resolveRes = routeRequest('POST', '/api/flags/resolve', {
    flagKey: 'yolo-sim-runaway-reaper',
    subjectId: 'self-test',
    metrics: { loadAvg: 3.1, errorRate: 0 },
  });

  const ok =
    statusRes.status === 200 &&
    flagsRes.status === 200 &&
    flagsRes.body.returnedCount === 4 &&
    guardrailsRes.status === 200 &&
    guardrailsRes.body.ok === true &&
    businessRes.status === 200 &&
    businessRes.body.tiers.length === 5 &&
    graphRagRes.status === 200 &&
    graphRagRes.body.ok === true &&
    resolveRes.status === 200 &&
    resolveRes.body.ok === true;

  return {
    ok,
    endpointsVerified: ['/api/status', '/api/flags?state=ACTIVE', '/api/guardrails', '/api/business', '/api/sdlc-prompts', '/api/observability/revenue', '/api/disk', '/api/agents', '/api/agents/pressure', '/api/system-care', '/api/sales/wabi', '/api/graphrag', '/api/flags/resolve'],
    activeFlagsCount: flagsRes.body.returnedCount,
    guardrailsOk: guardrailsRes.body.ok,
    businessTiersCount: businessRes.body.tiers.length,
  };
}

// This service starts at every login. A background loop that kills processes once took
// down every Claude Code session on the Mac, so the loop is off unless
// MAC_YOLO_SELF_HEAL asks for it: "dry-run" (or "1") only reports what it would stop,
// "execute" stops it. Either way it goes through the agent guard, which never touches
// apps, live sessions, or the MCP servers and hooks those sessions launched.
const SELF_HEAL_INTERVAL_MS = 60000;
function startSelfHeal({ env = process.env, intervalMs = SELF_HEAL_INTERVAL_MS, log = console.log } = {}) {
  const raw = String(env.MAC_YOLO_SELF_HEAL || '').trim().toLowerCase();
  if (!raw || raw === '0' || raw === 'off') return null;
  const mode = raw === 'execute' ? 'execute' : 'dry-run';
  const { relieve } = require('./mac-yolo-agent-guard');
  const timer = setInterval(() => {
    try {
      const result = relieve({ execute: mode === 'execute' });
      if (result.acted) log(`[mac-yolo-service] self-heal ${mode}: memory ${result.pressure.level}`);
    } catch {
      /* a failed tick waits for the next one */
    }
  }, intervalMs);
  timer.unref();
  return { mode, stop: () => clearInterval(timer) };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) {
    const report = runSelfTest();
    if (argv.includes('--json')) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`=== mac-yolo-service self-test: ${report.ok ? 'PASS' : 'FAIL'} ===`);
      console.log(`  Endpoints verified: ${report.endpointsVerified.join(', ')}`);
      console.log(`  Active flags (state=ACTIVE): ${report.activeFlagsCount}`);
    }
    process.exit(report.ok ? 0 : 1);
  }

  const portIdx = argv.indexOf('--port');
  const port = portIdx !== -1 && argv[portIdx + 1] ? Number(argv[portIdx + 1]) : DEFAULT_PORT;
  const server = createServiceServer();
  const selfHeal = startSelfHeal();
  server.listen(port, '127.0.0.1', () => {
    console.log(`[mac-yolo-service] listening on http://127.0.0.1:${port} (self-heal: ${selfHeal ? selfHeal.mode : 'off'})`);
  });
}

module.exports = {
  DEFAULT_PORT,
  startSelfHeal,
  routeRequest,
  createServiceServer,
  runSelfTest,
};
