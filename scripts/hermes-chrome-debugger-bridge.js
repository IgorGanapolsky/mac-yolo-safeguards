#!/usr/bin/env node
'use strict';

/**
 * Hermes chrome.debugger CDP bridge (no Chrome restart).
 *
 * Serves a Chrome-compatible CDP discovery + WebSocket endpoint on
 * 127.0.0.1:9222 while the MV3 extension attaches to everyday tabs via
 * chrome.debugger and relays commands over ws://127.0.0.1:9223/hermes-ext.
 *
 * Grounded in existing browser-bridge hosting — alternative to launching
 * Chrome with --remote-debugging-port (which forces a quit/restart).
 */

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const CDP_HOST = process.env.HERMES_DEBUGGER_BIND || '127.0.0.1';
const CDP_PORT = Number(process.env.HERMES_DEBUGGER_CDP_PORT || process.env.HERMES_CDP_PORT || 9222);
const EXT_PORT = Number(process.env.HERMES_DEBUGGER_EXT_PORT || 9223);
const LOG =
  process.env.HERMES_DEBUGGER_LOG ||
  `${process.env.HOME || ''}/Library/Logs/hermes-chrome-debugger.log`;

const BROWSER_ID = crypto.randomBytes(16).toString('hex');

/** @type {import('net').Socket | null} */
let extSocket = null;
/** @type {Map<number, object>} */
let tabsById = new Map();
let nextMsgId = 1;
/** @type {Map<number, {resolve: Function, reject: Function, timer: NodeJS.Timeout}>} */
const pending = new Map();
/** @type {Map<string, {tabId: number, sockets: Set<import('net').Socket>}>} */
const sessions = new Map();
/** @type {Set<import('net').Socket>} */
const browserSockets = new Set();

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  try {
    require('fs').appendFileSync(LOG, line);
  } catch {
    // ignore log failures
  }
  if (process.env.HERMES_DEBUGGER_VERBOSE === '1') {
    process.stderr.write(line);
  }
}

function sendExt(msg) {
  if (!extSocket || extSocket.readyState !== 1) {
    throw new Error('extension_not_connected');
  }
  extSocket.send(JSON.stringify(msg));
}

function askExt(type, payload = {}, timeoutMs = 8000) {
  const id = nextMsgId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`extension_timeout:${type}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try {
      sendExt({ id, type, ...payload });
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err);
    }
  });
}

function handleExtMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    return;
  }
  if (msg.type === 'hello') {
    log('extension hello', msg.version || '');
    return;
  }
  if (msg.type === 'tabs' && Array.isArray(msg.tabs)) {
    tabsById = new Map(msg.tabs.map((t) => [Number(t.id), t]));
    return;
  }
  if (msg.type === 'cdp_event') {
    const session = [...sessions.values()].find((s) => s.tabId === Number(msg.tabId));
    const event = {
      method: msg.method,
      params: msg.params || {},
    };
    if (session) {
      for (const sock of session.sockets) {
        wsSend(sock, event);
      }
    }
    for (const sock of browserSockets) {
      wsSend(sock, {
        method: msg.method,
        params: {
          ...(msg.params || {}),
          sessionId: session
            ? [...sessions.entries()].find(([, v]) => v === session)?.[0]
            : undefined,
        },
      });
    }
    return;
  }
  if (msg.id != null && pending.has(Number(msg.id))) {
    const p = pending.get(Number(msg.id));
    pending.delete(Number(msg.id));
    clearTimeout(p.timer);
    if (msg.error) {
      p.reject(new Error(String(msg.error)));
    } else {
      p.resolve(msg.result);
    }
  }
}

async function refreshTabs() {
  if (!extSocket || extSocket.readyState !== 1) {
    return [];
  }
  try {
    const result = await askExt('list_tabs');
    const tabs = Array.isArray(result) ? result : result?.tabs || [];
    tabsById = new Map(tabs.map((t) => [Number(t.id), t]));
    return tabs;
  } catch (err) {
    log('list_tabs failed', err.message || err);
    return [...tabsById.values()];
  }
}

function targetFromTab(tab) {
  const id = String(tab.id);
  return {
    description: '',
    devtoolsFrontendUrl: '',
    id,
    title: tab.title || 'Tab',
    type: 'page',
    url: tab.url || 'about:blank',
    webSocketDebuggerUrl: `ws://${CDP_HOST}:${CDP_PORT}/devtools/page/${id}`,
  };
}

function versionBody() {
  return {
    Browser: 'Hermes/chrome.debugger-bridge',
    'Protocol-Version': '1.3',
    'User-Agent': 'HermesChromeDebuggerBridge/1.0',
    'V8-Version': '0',
    'WebKit-Version': '0',
    webSocketDebuggerUrl: `ws://${CDP_HOST}:${CDP_PORT}/devtools/browser/${BROWSER_ID}`,
  };
}

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function acceptWs(req, socket, head, onOpen) {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      '\r\n',
  );
  if (head && head.length) {
    socket.unshift(head);
  }
  const ws = wrapSocket(socket);
  onOpen(ws);
}

function wrapSocket(socket) {
  const ws = {
    readyState: 1,
    socket,
    send(data) {
      wsSend(socket, data);
    },
    close() {
      try {
        socket.end();
      } catch {
        // ignore
      }
      ws.readyState = 3;
    },
    onMessage: null,
    onClose: null,
  };
  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const parsed = parseFrame(buffer);
      if (!parsed) break;
      buffer = parsed.rest;
      if (parsed.opcode === 0x8) {
        ws.readyState = 3;
        if (ws.onClose) ws.onClose();
        socket.end();
        return;
      }
      if (parsed.opcode === 0x1 || parsed.opcode === 0x2) {
        if (ws.onMessage) ws.onMessage(parsed.payload);
      }
    }
  });
  socket.on('close', () => {
    ws.readyState = 3;
    if (ws.onClose) ws.onClose();
  });
  socket.on('error', () => {
    ws.readyState = 3;
    if (ws.onClose) ws.onClose();
  });
  return ws;
}

function parseFrame(buf) {
  if (buf.length < 2) return null;
  const second = buf[1];
  const masked = (second & 0x80) !== 0;
  let len = second & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }
  const maskLen = masked ? 4 : 0;
  if (buf.length < offset + maskLen + len) return null;
  let payload = buf.subarray(offset + maskLen, offset + maskLen + len);
  if (masked) {
    const mask = buf.subarray(offset, offset + 4);
    const out = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      out[i] = payload[i] ^ mask[i % 4];
    }
    payload = out;
  }
  return {
    opcode: buf[0] & 0x0f,
    payload: payload.toString('utf8'),
    rest: buf.subarray(offset + maskLen + len),
  };
}

function wsSend(socket, data) {
  if (socket.destroyed) return;
  const payload = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  socket.write(Buffer.concat([header, payload]));
}

async function ensureAttached(tabId) {
  await askExt('attach', { tabId: Number(tabId) });
}

async function sendCdpToTab(tabId, method, params) {
  await ensureAttached(tabId);
  return askExt('cdp', { tabId: Number(tabId), method, params: params || {} });
}

function attachPageSocket(ws, tabId) {
  const sessionId = `page-${tabId}`;
  let session = sessions.get(sessionId);
  if (!session) {
    session = { tabId: Number(tabId), sockets: new Set() };
    sessions.set(sessionId, session);
  }
  session.sockets.add(ws.socket);

  ensureAttached(tabId).catch((err) => log('attach failed', err.message || err));

  ws.onMessage = async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const { id, method, params } = msg;
    try {
      const result = await sendCdpToTab(tabId, method, params);
      wsSend(ws.socket, { id, result: result ?? {} });
    } catch (err) {
      wsSend(ws.socket, {
        id,
        error: { message: err.message || String(err) },
      });
    }
  };
  ws.onClose = () => {
    session.sockets.delete(ws.socket);
    if (session.sockets.size === 0) {
      sessions.delete(sessionId);
      askExt('detach', { tabId: Number(tabId) }).catch(() => {});
    }
  };
}

function attachBrowserSocket(ws) {
  browserSockets.add(ws.socket);
  /** @type {Map<string, number>} */
  const sessionToTab = new Map();

  ws.onMessage = async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const { id, method, params } = msg;
    try {
      if (method === 'Browser.getVersion') {
        wsSend(ws.socket, { id, result: versionBody() });
        return;
      }
      if (method === 'Target.getTargets' || method === 'Target.setDiscoverTargets') {
        const tabs = await refreshTabs();
        if (method === 'Target.setDiscoverTargets') {
          wsSend(ws.socket, { id, result: {} });
          return;
        }
        wsSend(ws.socket, {
          id,
          result: {
            targetInfos: tabs.map((t) => ({
              targetId: String(t.id),
              type: 'page',
              title: t.title || 'Tab',
              url: t.url || 'about:blank',
              attached: false,
              canAccessOpener: false,
            })),
          },
        });
        return;
      }
      if (method === 'Target.attachToTarget') {
        const tabId = Number(params?.targetId);
        const sessionId = crypto.randomBytes(8).toString('hex');
        await ensureAttached(tabId);
        sessionToTab.set(sessionId, tabId);
        sessions.set(sessionId, { tabId, sockets: new Set([ws.socket]) });
        wsSend(ws.socket, {
          id,
          result: { sessionId },
        });
        wsSend(ws.socket, {
          method: 'Target.attachedToTarget',
          params: {
            sessionId,
            targetInfo: {
              targetId: String(tabId),
              type: 'page',
              title: tabsById.get(tabId)?.title || 'Tab',
              url: tabsById.get(tabId)?.url || 'about:blank',
              attached: true,
            },
            waitingForDebugger: false,
          },
        });
        return;
      }
      if (method === 'Target.detachFromTarget') {
        const sessionId = params?.sessionId;
        const tabId = sessionToTab.get(sessionId);
        if (tabId != null) {
          sessionToTab.delete(sessionId);
          sessions.delete(sessionId);
          await askExt('detach', { tabId }).catch(() => {});
        }
        wsSend(ws.socket, { id, result: {} });
        return;
      }
      if (params?.sessionId && sessionToTab.has(params.sessionId)) {
        const tabId = sessionToTab.get(params.sessionId);
        const { sessionId: _s, ...rest } = params;
        const result = await sendCdpToTab(tabId, method, rest);
        wsSend(ws.socket, { id, result: result ?? {} });
        return;
      }
      // Flat sessionId field used by some clients
      if (msg.sessionId && sessionToTab.has(msg.sessionId)) {
        const tabId = sessionToTab.get(msg.sessionId);
        const result = await sendCdpToTab(tabId, method, params);
        wsSend(ws.socket, { id, result: result ?? {} });
        return;
      }
      wsSend(ws.socket, {
        id,
        error: { message: `unsupported_method:${method || 'unknown'}` },
      });
    } catch (err) {
      wsSend(ws.socket, {
        id,
        error: { message: err.message || String(err) },
      });
    }
  };
  ws.onClose = () => {
    browserSockets.delete(ws.socket);
  };
}

function createCdpServer() {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url || '/', `http://${CDP_HOST}:${CDP_PORT}`);
    if (u.pathname === '/json/version' || u.pathname === '/json/version/') {
      json(res, 200, versionBody());
      return;
    }
    if (
      u.pathname === '/json' ||
      u.pathname === '/json/' ||
      u.pathname === '/json/list' ||
      u.pathname === '/json/list/'
    ) {
      const tabs = await refreshTabs();
      json(res, 200, tabs.map(targetFromTab));
      return;
    }
    if (u.pathname === '/json/protocol') {
      json(res, 200, { version: { major: '1', minor: '3' }, domains: [] });
      return;
    }
    json(res, 404, { error: 'not_found' });
  });

  server.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url || '/', `http://${CDP_HOST}:${CDP_PORT}`);
    if (u.pathname.startsWith('/devtools/page/')) {
      const tabId = u.pathname.split('/').pop();
      acceptWs(req, socket, head, (ws) => attachPageSocket(ws, tabId));
      return;
    }
    if (u.pathname.startsWith('/devtools/browser/')) {
      acceptWs(req, socket, head, (ws) => attachBrowserSocket(ws));
      return;
    }
    socket.destroy();
  });

  return server;
}

function createExtServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      json(res, 200, {
        ok: true,
        extensionConnected: !!(extSocket && extSocket.readyState === 1),
        tabs: tabsById.size,
        mode: 'chrome.debugger',
      });
      return;
    }
    json(res, 404, { error: 'not_found' });
  });

  server.on('upgrade', (req, socket, head) => {
    const u = new URL(req.url || '/', `http://${CDP_HOST}:${EXT_PORT}`);
    if (u.pathname !== '/hermes-ext') {
      socket.destroy();
      return;
    }
    acceptWs(req, socket, head, (ws) => {
      if (extSocket && extSocket.readyState === 1) {
        try {
          extSocket.close();
        } catch {
          // ignore
        }
      }
      extSocket = ws;
      log('extension connected');
      ws.onMessage = (raw) => handleExtMessage(raw);
      ws.onClose = () => {
        if (extSocket === ws) extSocket = null;
        log('extension disconnected');
      };
      wsSend(ws.socket, { type: 'welcome', cdpPort: CDP_PORT });
    });
  });

  return server;
}

function main() {
  const cdp = createCdpServer();
  const ext = createExtServer();
  cdp.listen(CDP_PORT, CDP_HOST, () => {
    log(`CDP listening on http://${CDP_HOST}:${CDP_PORT}`);
  });
  ext.listen(EXT_PORT, CDP_HOST, () => {
    log(`extension relay on ws://${CDP_HOST}:${EXT_PORT}/hermes-ext`);
  });
  cdp.on('error', (err) => {
    console.error(`CDP bind failed on ${CDP_HOST}:${CDP_PORT}: ${err.message}`);
    process.exit(1);
  });
  ext.on('error', (err) => {
    console.error(`Extension bind failed on ${CDP_HOST}:${EXT_PORT}: ${err.message}`);
    process.exit(1);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  versionBody,
  targetFromTab,
  parseFrame,
  BROWSER_ID,
};
