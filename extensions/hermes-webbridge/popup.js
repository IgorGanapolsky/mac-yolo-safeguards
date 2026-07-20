'use strict';

const CONNECT_PROMPT =
  'Use the local Chrome CDP bridge at ws://127.0.0.1:9222 (browser tools).';

async function probeCdp() {
  const el = document.getElementById('status');
  try {
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
    el.className = 'status ok';
    el.textContent = `Bridge connected · ${body.Browser || 'Chrome CDP'}`;
  } catch (err) {
    el.className = 'status bad';
    el.textContent =
      'Bridge offline. On your Mac run: bash scripts/install-browser-bridge.sh';
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

probeCdp();
