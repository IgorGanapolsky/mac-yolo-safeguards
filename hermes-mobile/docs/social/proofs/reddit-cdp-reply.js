#!/usr/bin/env node
/**
 * One-shot Reddit reply via Chrome CDP (Igor's logged-in session).
 * Usage: node reddit-cdp-reply.js [--verify-only]
 */
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const TARGET_URL =
  'https://www.reddit.com/r/hermesagent/comments/1uwdf2n/comment/oxmvy88/?context=3';
const REPLY_TEXT = `Thanks — means a lot coming from the Nous team. Hermes Agent is the brain; Hermes Mobile is the phone client for the same gateway: chat, approve/deny Leash tool calls, QR pair over Tailscale or home Wi-Fi — no cloud relay, keys stay on your machine.

On Google Play + App Store if you want to try it. Would love feedback on what would make Nous + mobile smoother — especially first-run pairing.`;
const PROOF_DIR = path.join(__dirname);
const verifyOnly = process.argv.includes('--verify-only');

function getTabs() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json/list', (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      });
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 60000);
    });
  }

  evaluate(expression) {
    return this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }).then((r) => r.result.value);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const tabs = await getTabs();
  if (!tabs.length) throw new Error('No Chrome CDP tabs');
  const tab = tabs.find((t) => t.type === 'page') || tabs[0];
  const cdp = new CDP(tab.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  await cdp.send('Page.navigate', { url: TARGET_URL });
  await sleep(8000);

  const context = await cdp.evaluate(`(() => {
    const body = document.body.innerText;
    return {
      title: document.title,
      url: location.href,
      posted: body.includes('Thanks — means a lot coming from the Nous team'),
      postTitle: (document.querySelector('h1')?.innerText || document.title).slice(0,200),
      comments: [...document.querySelectorAll('shreddit-comment')].map(c => ({
        author: c.getAttribute('author'),
        text: (c.innerText||'').replace(/\\s+/g,' ').slice(0,180)
      }))
    };
  })()`);

  console.log('CONTEXT:', JSON.stringify(context, null, 2));

  if (context.posted) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const proofPath = path.join(
      PROOF_DIR,
      `reddit-nous-reply-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-posted.png`
    );
    fs.writeFileSync(proofPath, Buffer.from(shot.data, 'base64'));
    console.log('ALREADY_POSTED:', proofPath);
    cdp.close();
    return { posted: true, proofPath, replyText: REPLY_TEXT };
  }

  if (verifyOnly) {
    cdp.close();
    return { posted: false, replyText: REPLY_TEXT };
  }

  const clickReply = await cdp.evaluate(`(() => {
    const comments = [...document.querySelectorAll('shreddit-comment')];
    const target = comments.find(c => (c.getAttribute('author')||'').includes('Mean-Loquat'));
    if (!target) return { error: 'comment not found', count: comments.length };
    target.scrollIntoView({ block: 'center' });
    const replyBtn = [...target.querySelectorAll('button')].find(b => b.innerText.trim() === 'Reply');
    if (!replyBtn) return { error: 'reply btn not found' };
    replyBtn.click();
    return { ok: true };
  })()`);
  console.log('CLICK_REPLY:', clickReply);
  await sleep(2500);

  const typed = await cdp.evaluate(`(() => {
    function deepQuery(root, sel) {
      let found = [...root.querySelectorAll(sel)];
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) found.push(...deepQuery(el.shadowRoot, sel));
      }
      return found;
    }
    const text = ${JSON.stringify(REPLY_TEXT)};
    const faceplate = [...document.querySelectorAll('faceplate-textarea-input')].find(e => e.getBoundingClientRect().height > 20);
    if (faceplate) {
      faceplate.click();
      faceplate.focus();
    }
    const textareas = deepQuery(document, 'textarea').filter(t => {
      const r = t.getBoundingClientRect();
      return r.height > 0 && r.top > 100;
    });
    const ta = textareas.sort((a,b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
    if (ta) {
      ta.focus();
      ta.value = text;
      ta.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertFromPaste' }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      return { method: 'textarea', len: ta.value.length, preview: ta.value.slice(0, 80) };
    }
    const ce = deepQuery(document, '[contenteditable=true]').find(e => e.getBoundingClientRect().height > 10);
    if (ce) {
      ce.focus();
      ce.textContent = text;
      ce.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
      return { method: 'contenteditable', len: ce.textContent.length, preview: ce.textContent.slice(0, 80) };
    }
    return { error: 'no editor' };
  })()`);
  console.log('TYPED:', typed);
  await sleep(1500);

  const submitted = await cdp.evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const commentBtn = btns.find(b => {
      const t = (b.innerText || '').replace(/\\s+/g, ' ').trim();
      return /^Comment$/i.test(t) || (t.includes('Comment') && !t.includes('Promote'));
    });
    if (!commentBtn) {
      return { error: 'comment btn not found', sample: btns.map(b => b.innerText.replace(/\\s+/g,' ').trim()).slice(0,20) };
    }
    commentBtn.click();
    return { ok: true, text: commentBtn.innerText.replace(/\\s+/g,' ').trim(), disabled: commentBtn.disabled };
  })()`);
  console.log('SUBMIT:', submitted);
  await sleep(5000);

  const verify = await cdp.evaluate(`document.body.innerText.includes('Thanks — means a lot coming from the Nous team')`);
  console.log('VERIFY_POSTED:', verify);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const proofPath = path.join(
    PROOF_DIR,
    `reddit-nous-reply-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${verify ? 'posted' : 'attempt'}.png`
  );
  fs.writeFileSync(proofPath, Buffer.from(shot.data, 'base64'));
  console.log('PROOF:', proofPath);
  console.log('REPLY_TEXT:', REPLY_TEXT);

  cdp.close();
  return { posted: !!verify, proofPath, replyText: REPLY_TEXT, typed, submitted };
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
