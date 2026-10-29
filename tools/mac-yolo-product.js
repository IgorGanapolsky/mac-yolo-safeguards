#!/usr/bin/env node
'use strict';

const http = require('node:http');
const readline = require('node:readline');

const LOOPBACK = '127.0.0.1';
const SERVICE_PORT = 47831;
const HERO = 'https://thumbgate.app/';

const MEASURED_PLAN = {
  checkedAt: '2026-10-29T16:23:03Z',
  source: 'https://thumbgate.app/api/billing/plan',
  configured: true,
  active: true,
  unitAmount: 1000,
  currency: 'usd',
  interval: 'month',
};

const TOOLS = [
  {
    name: 'product_health',
    description: 'Report the loopback service address. Does not reap processes or open a port.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'product_offer',
    description: 'Map a billing plan to the public ThumbGate price. An omitted plan uses the measured snapshot. Cleared revenue is never claimed.',
    inputSchema: {
      type: 'object',
      properties: {
        plan: {
          type: ['object', 'null'],
          description: 'Billing plan. Omit to use the measured snapshot. Null means the price is unknown.',
        },
      },
    },
  },
  {
    name: 'product_surfaces',
    description: 'Name the MCP, the loopback HTTP routes, and the menu-bar source file.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function offerFromPlan(plan) {
  const offer = {
    priceKnown: false,
    hero: HERO,
    clearedRevenue: null,
    display: null,
    currency: null,
    interval: null,
    unitAmount: null,
    snapshot: false,
  };
  if (!plan || plan.active !== true || !Number.isInteger(plan.unitAmount) || plan.unitAmount < 0) {
    return offer;
  }
  offer.priceKnown = true;
  offer.currency = plan.currency ?? null;
  offer.interval = plan.interval ?? null;
  offer.unitAmount = plan.unitAmount;
  if (plan.currency === 'usd' && plan.interval === 'month' && plan.unitAmount % 100 === 0) {
    offer.display = `$${plan.unitAmount / 100}/month`;
  }
  return offer;
}

function productOffer(plan) {
  const snapshot = plan === undefined;
  const offer = offerFromPlan(snapshot ? MEASURED_PLAN : plan);
  offer.snapshot = snapshot;
  if (snapshot) {
    offer.checkedAt = MEASURED_PLAN.checkedAt;
    offer.source = MEASURED_PLAN.source;
    offer.configured = MEASURED_PLAN.configured;
  }
  return offer;
}

function productHealth() {
  return { ok: true, bind: LOOPBACK, port: SERVICE_PORT, hero: HERO };
}

function productSurfaces() {
  return {
    mcp: 'mac-yolo-product',
    service: `http://${LOOPBACK}:${SERVICE_PORT}`,
    routes: ['/health', '/offer'],
    macApp: 'macos/MacYoloProductApp.swift',
    hero: HERO,
    bind: LOOPBACK,
  };
}

function assertLoopback(host) {
  if (host !== LOOPBACK) {
    const err = new Error('loopback_only');
    err.code = 'loopback_only';
    throw err;
  }
}

function startService({ host = LOOPBACK, port = SERVICE_PORT } = {}) {
  assertLoopback(host);
  const server = http.createServer((req, res) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url || '/', `http://${LOOPBACK}`).pathname;
    } catch {
      pathname = '/';
    }
    const route = req.method === 'GET' && (pathname === '/health' || pathname === '/offer');
    if (!route) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    const body = pathname === '/health' ? productHealth() : productOffer();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      resolve({
        server,
        host,
        port: server.address().port,
        close() {
          return new Promise((done) => server.close(done));
        },
      });
    });
  });
}

function callTool(name, args) {
  if (name === 'product_health') return productHealth();
  if (name === 'product_surfaces') return productSurfaces();
  if (name === 'product_offer') {
    const plan = args && Object.prototype.hasOwnProperty.call(args, 'plan') ? args.plan : undefined;
    return productOffer(plan);
  }
  return null;
}

function handleMessage(message) {
  const { id, method, params } = message || {};
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mac-yolo-product', version: '1.0.0' },
      },
    };
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }
  if (method === 'tools/call') {
    const payload = callTool(params && params.name, (params && params.arguments) || {});
    if (!payload) {
      return {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: 'unknown tool' }], isError: true },
      };
    }
    return {
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
    };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (id !== undefined) {
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
  return null;
}

function fixtureReport() {
  const offer = productOffer();
  const health = productHealth();
  const surfaces = productSurfaces();
  const odd = offerFromPlan({ active: true, unitAmount: 1999, currency: 'usd', interval: 'month' });
  const unknown = productOffer(null);
  let refused = false;
  try {
    assertLoopback('localhost');
  } catch (err) {
    refused = err.message === 'loopback_only';
  }
  const ok = offer.display === '$10/month'
    && offer.clearedRevenue === null
    && offer.priceKnown === true
    && offer.snapshot === true
    && health.bind === LOOPBACK
    && surfaces.bind === LOOPBACK
    && odd.priceKnown === true
    && odd.display === null
    && odd.clearedRevenue === null
    && unknown.priceKnown === false
    && unknown.clearedRevenue === null
    && unknown.snapshot === false
    && unknown.hero === HERO
    && refused;
  return { fixtures: true, ok, offer, health, surfaces };
}

function serveStdio() {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const reply = handleMessage(JSON.parse(line));
      if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
    } catch {
      /* ignore a line that is not JSON */
    }
  });
}

async function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--json')) {
    const report = fixtureReport();
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exit(report.ok ? 0 : 1);
  }
  if (args.includes('--service')) {
    const started = await startService();
    process.stdout.write(`${JSON.stringify({ listening: true, host: started.host, port: started.port })}\n`);
    return;
  }
  serveStdio();
}

if (require.main === module) {
  main(process.argv).catch((err) => {
    process.stderr.write(`${err && err.message ? err.message : err}\n`);
    process.exit(1);
  });
}

module.exports = {
  MEASURED_PLAN,
  LOOPBACK,
  SERVICE_PORT,
  HERO,
  offerFromPlan,
  productOffer,
  productHealth,
  productSurfaces,
  startService,
  handleMessage,
  fixtureReport,
};
