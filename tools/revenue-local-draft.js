#!/usr/bin/env node
'use strict';

/**
 * revenue-local-draft.js — Open-weights follow-up draft for cash path (not auto-send).
 *
 * Input: structured prospect fields (CLI flags or JSON stdin).
 * Output: JSON { subject, body, offer, payment_url, model, source }.
 *
 * Prefer local Ollama (qwen3-hermes-tinker:q4 or override). Falls back to
 * deterministic template when Ollama is down so CI/tests stay offline-green.
 *
 * Never marks paid. Never sends email. Pair with payment-readiness + send gates.
 *
 * Usage:
 *   node tools/revenue-local-draft.js --label acme --offer diagnostic --notes "..." --json
 *   echo '{"label":"acme","offer":"diagnostic"}' | node tools/revenue-local-draft.js --json
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_MODEL = process.env.HERMES_REVENUE_DRAFT_MODEL || 'qwen3-hermes-tinker:q4';
const OLLAMA_BASE = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

const OFFER_DEFAULTS = {
  diagnostic: {
    name: 'Agent Reliability Diagnostic',
    amount: 499,
    url:
      process.env.STRIPE_DIAGNOSTIC_URL ||
      'https://buy.stripe.com/9B69ATbmI4r4aK5eOD3sI3k',
  },
  hardening: {
    name: 'AI Agent Hardening Sprint',
    amount: 1500,
    url:
      process.env.STRIPE_HARDENING_URL ||
      'https://buy.stripe.com/4gM28r1M8g9M3hD0XN3sI38',
  },
  pilot: {
    name: 'Partner Pilot',
    amount: 3000,
    url:
      process.env.STRIPE_PILOT_URL ||
      'https://buy.stripe.com/fZucN5bmI8HkbO98qf3sI3j',
  },
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    label: '',
    offer: 'diagnostic',
    notes: '',
    paymentUrl: '',
    model: DEFAULT_MODEL,
    json: false,
    help: false,
    forceTemplate: process.env.HERMES_REVENUE_DRAFT_TEMPLATE === '1',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--label') args.label = String(argv[++i] || '');
    else if (a === '--offer') args.offer = String(argv[++i] || 'diagnostic').toLowerCase();
    else if (a === '--notes') args.notes = String(argv[++i] || '');
    else if (a === '--payment-url') args.paymentUrl = String(argv[++i] || '');
    else if (a === '--model') args.model = String(argv[++i] || DEFAULT_MODEL);
    else if (a === '--json') args.json = true;
    else if (a === '--template') args.forceTemplate = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function normalizeOffer(offer) {
  const key = String(offer || 'diagnostic').toLowerCase();
  if (key.includes('hard')) return 'hardening';
  if (key.includes('pilot') || key.includes('partner')) return 'pilot';
  return 'diagnostic';
}

function templateDraft(input) {
  const offerKey = normalizeOffer(input.offer);
  const offer = OFFER_DEFAULTS[offerKey] || OFFER_DEFAULTS.diagnostic;
  const paymentUrl = input.paymentUrl || offer.url;
  const label = input.label || 'there';
  const notes = (input.notes || '').trim();
  const subject = `Quick follow-up: ${offer.name} for ${label}`;
  const body = [
    `Hi ${label},`,
    '',
    notes
      ? `Following up on our last note (${notes.slice(0, 180)}).`
      : 'Following up on agent reliability / runaway-loop risk on your stack.',
    '',
    `If useful, the ${offer.name} ($${offer.amount}) is a fixed-scope pass: diagnose failure modes, name the highest-leverage fix, and leave a concrete next step.`,
    '',
    `Book / pay here: ${paymentUrl}`,
    '',
    'Happy to adjust scope if this is not the right fit.',
    '',
    '— Igor / ThumbGate',
  ].join('\n');
  return {
    ok: true,
    source: 'template',
    model: null,
    subject,
    body,
    offer: offer.name,
    offerKey,
    payment_url: paymentUrl,
    gross_potential_usd: offer.amount,
  };
}

function ollamaChat(model, messages, baseUrl = OLLAMA_BASE) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL('/api/chat', baseUrl);
    } catch (e) {
      reject(e);
      return;
    }
    const payload = JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: 0.4, num_predict: 400 },
    });
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 25000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Ollama HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Ollama timeout'));
    });
    req.write(payload);
    req.end();
  });
}

function parseModelJson(text) {
  const raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function draftWithOllama(input) {
  const offerKey = normalizeOffer(input.offer);
  const offer = OFFER_DEFAULTS[offerKey] || OFFER_DEFAULTS.diagnostic;
  const paymentUrl = input.paymentUrl || offer.url;
  const system = [
    'You draft B2B follow-up emails for ThumbGate agent-reliability offers.',
    'Return ONLY JSON: {"subject":"...","body":"..."}',
    'No markdown fences. Include the payment URL in the body. No fake claims of results.',
    'Tone: direct, non-sleazy, authority diagnostic.',
  ].join(' ');
  const user = [
    `prospect: ${input.label || 'prospect'}`,
    `offer: ${offer.name} ($${offer.amount})`,
    `payment_url: ${paymentUrl}`,
    `notes: ${input.notes || '(none)'}`,
  ].join('\n');

  const res = await ollamaChat(input.model || DEFAULT_MODEL, [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
  const content = res?.message?.content || res?.response || '';
  const parsed = parseModelJson(content);
  if (!parsed || !parsed.subject || !parsed.body) {
    throw new Error('Model did not return subject/body JSON');
  }
  return {
    ok: true,
    source: 'ollama',
    model: input.model || DEFAULT_MODEL,
    subject: String(parsed.subject).slice(0, 200),
    body: String(parsed.body).slice(0, 4000),
    offer: offer.name,
    offerKey,
    payment_url: paymentUrl,
    gross_potential_usd: offer.amount,
  };
}

async function buildDraft(input) {
  if (input.forceTemplate) return templateDraft(input);
  try {
    return await draftWithOllama(input);
  } catch {
    const fallback = templateDraft(input);
    fallback.fallbackReason = 'ollama_unavailable_or_invalid_json';
    return fallback;
  }
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(`Usage:
  node tools/revenue-local-draft.js --label NAME --offer diagnostic|hardening|pilot [--notes "..."] [--json]
  node tools/revenue-local-draft.js --template --json   # offline template only

Env: OLLAMA_HOST, HERMES_REVENUE_DRAFT_MODEL, HERMES_REVENUE_DRAFT_TEMPLATE=1`);
    process.exit(0);
  }

  let stdinJson = null;
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (raw) {
      try {
        stdinJson = JSON.parse(raw);
      } catch {
        /* ignore */
      }
    }
  }

  const input = {
    label: args.label || stdinJson?.label || stdinJson?.prospect_label || '',
    offer: args.offer || stdinJson?.offer || 'diagnostic',
    notes: args.notes || stdinJson?.notes || stdinJson?.last_touch_notes || '',
    paymentUrl: args.paymentUrl || stdinJson?.payment_url || stdinJson?.payment_link_url || '',
    model: args.model,
    forceTemplate: args.forceTemplate,
  };

  const draft = await buildDraft(input);
  if (args.json) {
    console.log(JSON.stringify(draft, null, 2));
  } else {
    console.log(`source: ${draft.source}${draft.model ? ` model=${draft.model}` : ''}`);
    console.log(`offer: ${draft.offer}`);
    console.log(`payment_url: ${draft.payment_url}`);
    console.log(`subject: ${draft.subject}`);
    console.log('');
    console.log(draft.body);
  }
  process.exit(draft.ok ? 0 : 1);
}

module.exports = {
  parseArgs,
  templateDraft,
  parseModelJson,
  buildDraft,
  normalizeOffer,
  OFFER_DEFAULTS,
  DEFAULT_MODEL,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
