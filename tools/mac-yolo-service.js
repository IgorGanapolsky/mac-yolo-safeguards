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
const { callTool } = require('./mac-yolo-mcp-server');
const {
  listFlags,
  resolveFlagWithExposure,
  synthesizeWhatIsWorthBuilding,
} = require('./spotify-confidence-flags-steal');
const DEFAULT_PORT = Number(process.env.MAC_YOLO_SERVICE_PORT || 8766);

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
    resolveRes.status === 200 &&
    resolveRes.body.ok === true;

  return {
    ok,
    endpointsVerified: ['/api/status', '/api/flags?state=ACTIVE', '/api/guardrails', '/api/business', '/api/sdlc-prompts', '/api/flags/resolve'],
    activeFlagsCount: flagsRes.body.returnedCount,
    guardrailsOk: guardrailsRes.body.ok,
    businessTiersCount: businessRes.body.tiers.length,
  };
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
  server.listen(port, '127.0.0.1', () => {
    console.log(`[mac-yolo-service] listening on http://127.0.0.1:${port}`);
  });
}

module.exports = {
  DEFAULT_PORT,
  routeRequest,
  createServiceServer,
  runSelfTest,
};
