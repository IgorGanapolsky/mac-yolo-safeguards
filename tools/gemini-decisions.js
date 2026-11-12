#!/usr/bin/env node
'use strict';

// Gemini Decisions API (gemini-decision-1): scores a fixed set of answers in one
// pass and returns a confidence for each, instead of generating text.
// $0.10 per 1M input tokens, no output tokens billed.
// We use it to sort outreach replies into the buyer-reply-packet kinds, and fall
// back to the regex classifier when the key is missing, the call fails, or the
// model is unsure.

const { spawnSync } = require('child_process');

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/decisions';
const MODEL = 'gemini-decision-1';
const MIN_CONFIDENCE = 0.6;

// Keys match tools/buyer-reply-packet.js kinds, plus auto_reply (not a lead).
const REPLY_KINDS = {
  engaged: 'Wants to talk, asks about price, a trial, a call, or how to buy.',
  not_now: 'Declines, says not now, or asks to be removed.',
  langsmith: 'Says they already use LangSmith, LangChain or another tracing or observability tool.',
  hosting: 'Says they already host or orchestrate agents (Kubernetes, ECS, Bedrock agents, a platform).',
  gateway: 'Says they already route model calls through a gateway (LiteLLM, OpenRouter, their own base_url).',
  auto_reply: 'Out-of-office, auto-reply, bounce or newsletter, not written by the person.',
};

function postDecision(body, { apiKey = process.env.GEMINI_API_KEY, post } = {}) {
  if (!apiKey && !post) return { ok: false, reason: 'GEMINI_API_KEY not set' };
  try {
    const text = post ? post(body) : curlPostSync(body, apiKey);
    const json = JSON.parse(text || '{}');
    if (json.error || !json.answers) return { ok: false, reason: (json.error && json.error.message) || 'no answers' };
    return { ok: true, answers: json.answers, usage: json.usage || null };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// The key reaches curl through a config on fd 3, never on the command line,
// so it doesn't show up in `ps`.
function curlPostSync(body, apiKey, timeoutMs = 15000) {
  const script = 'exec 3<<EOF\nurl = "' + ENDPOINT + '"\nheader = "x-goog-api-key: $MYS_GEMINI_KEY"\nheader = "content-type: application/json"\nEOF\ncurl -s -m ' + Math.ceil(timeoutMs / 1000) + ' -K /dev/fd/3 --data-binary @-';
  const r = spawnSync('/bin/sh', ['-c', script], {
    input: JSON.stringify(body),
    encoding: 'utf8',
    timeout: timeoutMs + 2000,
    env: { PATH: process.env.PATH || '/usr/bin:/bin', MYS_GEMINI_KEY: apiKey },
  });
  if (r.status !== 0) throw new Error(`curl exit ${r.status}`);
  return r.stdout;
}

// Returns { kind, confidence, source } for one reply, or null to fall back.
function classifyReply(text, opts = {}) {
  const res = postDecision(
    {
      model: MODEL,
      input: [{ type: 'text', text: String(text || '').slice(0, 8000) }],
      questions: {
        kind: {
          type: 'choice',
          instructions: 'This is a reply to a sales email about a developer tool. Which describes it best?',
          criteria: REPLY_KINDS,
        },
      },
    },
    opts,
  );
  if (!res.ok) return { ok: false, reason: res.reason };
  const a = res.answers.kind || {};
  if (!REPLY_KINDS[a.choice]) return { ok: false, reason: 'unknown choice' };
  return { ok: true, kind: a.choice, confidence: Number(a.confidence) || 0, sure: (Number(a.confidence) || 0) >= MIN_CONFIDENCE };
}

module.exports = { classifyReply, postDecision, REPLY_KINDS, MIN_CONFIDENCE, MODEL };

if (require.main === module) {
  const text = process.argv.slice(2).join(' ');
  if (!text) {
    console.error('usage: gemini-decisions.js "<reply text>"');
    process.exit(2);
  }
  console.log(JSON.stringify(classifyReply(text), null, 2));
}
