#!/usr/bin/env node
'use strict';

/**
 * llm-judge.js — an LLM-as-Judge that can actually FAIL.
 *
 * WHY THIS EXISTS
 *   tools/eval-benchmark-suite.js printed
 *
 *       4. LLM-as-a-Judge: [PASS] Groundedness 98%, Helpfulness 96%
 *
 *   with `groundednessScore: 0.98` written as a literal in the source. No model
 *   was ever called. The same file hardcoded `thumbsUpRatePct: 100` while the
 *   real ThumbGate feedback store says 678 positive of 1640 — 41.3%. A metric
 *   that cannot fail is not a metric; it is a decoration, and it is worse than
 *   nothing because it occupies the slot where a real check would go.
 *
 * WHAT MAKES THIS ONE REAL
 *   1. It calls a PINNED model at temperature 0, through the local gateway.
 *   2. Its prompt is VERSIONED. Change the prompt or the model and the version
 *      changes, which invalidates any calibration recorded against the old pair.
 *   3. It FAILS CLOSED. Unparseable output, a missing verdict, a transport
 *      error — all return {ok:false}. Nothing is scored on a guess, and no
 *      default verdict is invented.
 *   4. Its transport is injectable, so tests are hermetic and deterministic.
 *
 * WHAT THIS DOES NOT DO
 *   It is NOT a gate on its own. Judge output is only trustworthy to the extent
 *   it agrees with humans, which is what tools/llm-judge-calibrate.js measures
 *   against the 1069 human-labelled records in ~/.thumbgate/lessons-index.jsonl.
 *   Until that agreement is measured, a judge score means nothing.
 */

// Bump BOTH together with any prompt edit — calibration is only valid for the
// exact (model, prompt) pair it was measured on.
const JUDGE_MODEL = 'glm-turbo';
const JUDGE_PROMPT_VERSION = 'v1-2026-07-30';

const SYSTEM_PROMPT = [
  'You judge whether a user was SATISFIED or DISSATISFIED with an AI assistant\'s work,',
  'based on a short transcript excerpt.',
  '',
  'Answer with ONLY a JSON object, no prose before or after:',
  '{"verdict":"positive"|"negative","confidence":0.0-1.0,"reason":"<12 words"}',
  '',
  '"negative" means the user is correcting, complaining, or reporting a failure.',
  '"positive" means the user is confirming success or expressing approval.',
  'If the excerpt is genuinely ambiguous, still choose the more likely verdict',
  'and set confidence below 0.6 to say so.',
].join('\n');

const GATEWAY = process.env.HERMES_GATEWAY_URL || 'http://127.0.0.1:4010';

/**
 * Reasoning models emit chain-of-thought before the answer, so the JSON object
 * is usually at the END of the response rather than being the whole of it.
 * Scanning for the LAST balanced {...} is what makes this robust to that.
 * Returns null rather than a guess when nothing parses.
 */
function extractJson(text) {
  const s = String(text || '');
  for (let end = s.lastIndexOf('}'); end !== -1; end = s.lastIndexOf('}', end - 1)) {
    let depth = 0;
    for (let i = end; i >= 0; i -= 1) {
      if (s[i] === '}') depth += 1;
      else if (s[i] === '{') {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(s.slice(i, end + 1));
            if (parsed && typeof parsed === 'object') return parsed;
          } catch { /* keep scanning left */ }
          break;
        }
      }
    }
  }
  return null;
}

async function defaultTransport({ model, messages, temperature, maxTokens, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${GATEWAY}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LITELLM_MASTER_KEY || 'sk-1234'}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    });
    const body = await res.json();
    if (body && body.error) return { ok: false, error: `gateway: ${JSON.stringify(body.error).slice(0, 160)}` };
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return { ok: false, error: 'gateway returned no message content' };
    return { ok: true, content };
  } catch (e) {
    return { ok: false, error: `transport: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Judge one excerpt. Never throws; always returns a discriminated result.
 * ok:false carries a NAMED cause so a failure can never be mistaken for a
 * verdict — the whole point of this file.
 */
async function judge(excerpt, opts = {}) {
  const transport = opts.transport || defaultTransport;
  if (typeof excerpt !== 'string' || excerpt.trim() === '') {
    return { ok: false, error: 'empty excerpt', model: JUDGE_MODEL, promptVersion: JUDGE_PROMPT_VERSION };
  }
  const meta = { model: opts.model || JUDGE_MODEL, promptVersion: JUDGE_PROMPT_VERSION };
  const res = await transport({
    model: meta.model,
    temperature: 0, // determinism is non-negotiable for a regression signal
    maxTokens: opts.maxTokens || 400,
    timeoutMs: opts.timeoutMs || 60000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Transcript: ${excerpt.slice(0, 4000)}` },
    ],
  });
  if (!res.ok) return { ok: false, error: res.error, ...meta };

  const parsed = extractJson(res.content);
  if (!parsed) return { ok: false, error: 'no JSON object in judge output', raw: res.content.slice(-200), ...meta };
  if (parsed.verdict !== 'positive' && parsed.verdict !== 'negative') {
    return { ok: false, error: `invalid verdict: ${JSON.stringify(parsed.verdict)}`, ...meta };
  }
  const confidence = Number(parsed.confidence);
  return {
    ok: true,
    verdict: parsed.verdict,
    // An out-of-range or missing confidence is NOT silently coerced to a
    // plausible number; it is reported as null so calibration can exclude it.
    confidence: Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null,
    reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : '',
    ...meta,
  };
}

module.exports = {
  judge,
  extractJson,
  JUDGE_MODEL,
  JUDGE_PROMPT_VERSION,
  SYSTEM_PROMPT,
};

if (require.main === module) {
  const text = process.argv.slice(2).join(' ');
  if (!text) {
    console.error('usage: node tools/llm-judge.js "<transcript excerpt>"');
    process.exit(2);
  }
  judge(text).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
