'use strict';

const CONNECT_PROMPT =
  'Use the local Chrome CDP bridge at ws://127.0.0.1:9222 (browser tools).';

async function probe() {
  const el = document.getElementById('status');
  try {
    const health = await fetch('http://127.0.0.1:9223/health', {
      method: 'GET',
      cache: 'no-store',
    }).then((r) => (r.ok ? r.json() : null));

    const res = await fetch('http://127.0.0.1:9222/json/version', {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = await res.json();
    if (!body.webSocketDebuggerUrl) {
      throw new Error('missing webSocketDebuggerUrl');
    }
    const debuggerMode =
      String(body.Browser || '').includes('chrome.debugger') ||
      (health && health.mode === 'chrome.debugger');
    el.className = 'status ok';
    if (debuggerMode) {
      const ext = health && health.extensionConnected ? 'extension linked' : 'waiting for extension';
      el.textContent = `Debugger bridge · no Chrome restart · ${ext}`;
    } else {
      el.textContent = `Bridge connected · ${body.Browser || 'Chrome CDP'}`;
    }
  } catch (err) {
    el.className = 'status bad';
    el.textContent =
      'Bridge offline. On your Mac run: bash scripts/install-browser-bridge.sh --mode=debugger';
  }
}

document.getElementById('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(CONNECT_PROMPT);
    document.getElementById('copy').textContent = 'Copied';
  } catch {
    document.getElementById('copy').textContent = 'Copy failed';
  }
});

probe();
