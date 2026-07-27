'use strict';

/**
 * Hermes Browser Bridge — chrome.debugger relay (no Chrome restart).
 *
 * Connects outbound to the local debugger bridge and attaches to everyday
 * tabs via chrome.debugger so hermes-agent can keep using ws://127.0.0.1:9222.
 */

const EXT_WS_URL = 'ws://127.0.0.1:9223/hermes-ext';
const RECONNECT_MS = 1500;
const PROTOCOL_VERSION = '1.3';

/** @type {WebSocket | null} */
let socket = null;
let reconnectTimer = null;
/** @type {Set<number>} */
const attached = new Set();

function setBadge(ok, text) {
  const color = ok ? '#1a7f37' : '#cf222e';
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text: text || (ok ? 'ON' : '…') });
}

function tabPayload(tab) {
  return {
    id: tab.id,
    title: tab.title || '',
    url: tab.url || '',
    active: !!tab.active,
    windowId: tab.windowId,
  };
}

async function listTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((t) => typeof t.id === 'number').map(tabPayload);
}

async function attachTab(tabId) {
  const id = Number(tabId);
  if (attached.has(id)) return { attached: true };
  await chrome.debugger.attach({ tabId: id }, PROTOCOL_VERSION);
  attached.add(id);
  return { attached: true };
}

async function detachTab(tabId) {
  const id = Number(tabId);
  if (!attached.has(id)) return { detached: true };
  try {
    await chrome.debugger.detach({ tabId: id });
  } catch {
    // already detached
  }
  attached.delete(id);
  return { detached: true };
}

async function sendCdp(tabId, method, params) {
  const id = Number(tabId);
  await attachTab(id);
  return chrome.debugger.sendCommand({ tabId: id }, method, params || {});
}

function reply(msg, result, error) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const body = { id: msg.id };
  if (error) body.error = error;
  else body.result = result;
  socket.send(JSON.stringify(body));
}

async function handleBridgeMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    return;
  }
  try {
    if (msg.type === 'welcome') {
      setBadge(true, 'ON');
      const tabs = await listTabs();
      socket.send(JSON.stringify({ type: 'tabs', tabs }));
      return;
    }
    if (msg.type === 'list_tabs') {
      const tabs = await listTabs();
      reply(msg, tabs);
      return;
    }
    if (msg.type === 'attach') {
      reply(msg, await attachTab(msg.tabId));
      return;
    }
    if (msg.type === 'detach') {
      reply(msg, await detachTab(msg.tabId));
      return;
    }
    if (msg.type === 'cdp') {
      const result = await sendCdp(msg.tabId, msg.method, msg.params);
      reply(msg, result ?? {});
      return;
    }
  } catch (err) {
    reply(msg, null, err && err.message ? err.message : String(err));
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  setBadge(false, '…');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    socket = new WebSocket(EXT_WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }
  socket.addEventListener('open', () => {
    setBadge(true, 'ON');
    socket.send(
      JSON.stringify({
        type: 'hello',
        version: '1',
        mode: 'chrome.debugger',
      }),
    );
  });
  socket.addEventListener('message', (ev) => {
    handleBridgeMessage(ev.data);
  });
  socket.addEventListener('close', () => {
    socket = null;
    scheduleReconnect();
  });
  socket.addEventListener('error', () => {
    try {
      socket && socket.close();
    } catch {
      // ignore
    }
  });
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (source.tabId == null) return;
  socket.send(
    JSON.stringify({
      type: 'cdp_event',
      tabId: source.tabId,
      method,
      params: params || {},
    }),
  );
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId != null) attached.delete(source.tabId);
});

chrome.tabs.onUpdated.addListener(async () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const tabs = await listTabs();
  socket.send(JSON.stringify({ type: 'tabs', tabs }));
});

chrome.runtime.onInstalled.addListener(() => {
  connect();
});

chrome.runtime.onStartup.addListener(() => {
  connect();
});

connect();
