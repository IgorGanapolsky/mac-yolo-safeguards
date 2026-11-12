#!/usr/bin/env node
'use strict';

const fs = require('fs');

const CARD_RE = /\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const LETTERS = 'abcdefghijkmnopqrstuvwxyz';

function prefixSk() {
  return 'sk-';
}

function prefixGh() {
  return ['gh', 'p_'].join('');
}

function prefixXo() {
  return ['xo', 'xb-'].join('');
}

function fold(input) {
  let state = 2166136261;
  const text = String(input);
  for (let i = 0; i < text.length; i += 1) {
    state ^= text.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0;
}

function lettersFor(seed, count) {
  let state = seed >>> 0;
  let out = '';
  for (let i = 0; i < count; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out += LETTERS[state % LETTERS.length];
  }
  return out;
}

function maskDigits(raw) {
  const seed = fold(String(raw).replace(/\D/g, ''));
  let state = seed;
  return String(raw).replace(/\d/g, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return LETTERS[state % LETTERS.length];
  });
}

function keySpans(text) {
  const prefixes = [prefixSk(), prefixGh(), prefixXo()];
  const spans = [];
  prefixes.forEach((prefix) => {
    let from = 0;
    while (from < text.length) {
      const at = text.indexOf(prefix, from);
      if (at === -1) break;
      const rest = text.slice(at + prefix.length);
      const run = rest.match(/^[A-Za-z0-9]{20,}/);
      if (run) {
        spans.push({ start: at, end: at + prefix.length + run[0].length, raw: text.slice(at, at + prefix.length + run[0].length) });
        from = at + prefix.length + run[0].length;
      } else {
        from = at + prefix.length;
      }
    }
  });
  return spans;
}

function maskText(text) {
  const spans = keySpans(text).sort((a, b) => b.start - a.start);
  let out = text;
  spans.forEach((span) => {
    const stand = 'redacted-' + lettersFor(fold(span.raw), 8);
    out = out.slice(0, span.start) + stand + out.slice(span.end);
  });
  out = out.replace(CARD_RE, (raw) => maskDigits(raw));
  out = out.replace(SSN_RE, (raw) => maskDigits(raw));
  return out;
}

function hasRawKey(text) {
  return keySpans(text).length > 0;
}

function reviewSelfScoreSource(src) {
  const text = String(src || '');
  const findings = [];
  if (text.indexOf('businessValueScore') !== -1 && text.indexOf('ratio >= 1') !== -1) {
    findings.push({ id: 'selfScore', detail: 'A caller-supplied score ratio is treated as value.' });
  }
  if (text.indexOf('Databolt') !== -1 || text.indexOf('Capital One') !== -1) {
    findings.push({ id: 'vendorName', detail: 'A vendor product name is in the check.' });
  }
  return findings;
}

function guardSourceValue(evidence) {
  const packet = evidence || {};
  const findings = [];
  const text = String(packet.text || '');
  if (packet.skipGovernance === true || packet.bypass === true) {
    findings.push({ id: 'skipped', detail: 'A skip flag is set. Governance that can be skipped does not count.' });
  }
  const measured = typeof packet.measuredCents === 'number' && packet.measuredCents > 0 && packet.measuredSource === 'processor';
  if ((packet.valueScore != null || packet.riskScore != null) && !measured) {
    findings.push({ id: 'selfScore', detail: 'A typed score is present and no processor return is attached.' });
  }
  const figures = Array.isArray(packet.vendorFigures) ? packet.vendorFigures : [];
  if (figures.some((item) => item && item.asLocal === true)) {
    findings.push({ id: 'vendorFigure', detail: 'A vendor figure is marked as a local result.' });
  }
  if (packet.spend === true && !(Number(packet.callCap) > 0)) {
    findings.push({ id: 'noCap', detail: 'Spend is on and no call cap is set.' });
  }
  const agents = Array.isArray(packet.agents) ? packet.agents : [];
  if (agents.some((agent) => agent && agent.tracked === false)) {
    findings.push({ id: 'untracked', detail: 'An agent in the action is untracked.' });
  }
  if (CARD_RE.test(text)) {
    findings.push({ id: 'rawCard', detail: 'A card-shaped number is in the text.' });
  }
  CARD_RE.lastIndex = 0;
  if (SSN_RE.test(text)) {
    findings.push({ id: 'rawSsn', detail: 'An identity-number shape is in the text.' });
  }
  SSN_RE.lastIndex = 0;
  if (hasRawKey(text)) {
    findings.push({ id: 'rawKey', detail: 'A key-shaped value is in the text.' });
  }
  const outbound = maskText(text);
  if (CARD_RE.test(outbound) || SSN_RE.test(outbound) || hasRawKey(outbound)) {
    findings.push({ id: 'maskLeftRaw', detail: 'The stand-in still matches a raw sensitive shape.' });
  }
  CARD_RE.lastIndex = 0;
  SSN_RE.lastIndex = 0;
  return { ok: findings.length === 0, findings, outbound };
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('usage: node tools/source-value-guard.js <evidence.json>');
    process.exit(2);
  }
  if (!fs.existsSync(filePath)) {
    console.error('missing evidence file');
    process.exit(2);
  }
  const before = fs.readFileSync(filePath);
  const report = guardSourceValue(JSON.parse(before.toString('utf8')));
  const after = fs.readFileSync(filePath);
  if (!before.equals(after)) {
    console.error('evidence file changed');
    process.exit(2);
  }
  const lines = ['source-value-guard: ' + (report.ok ? 'PASS' : 'FAIL ' + report.findings.length)];
  report.findings.forEach((item) => lines.push(item.id + ': ' + item.detail));
  console.log(lines.join('\n'));
  process.exit(report.ok ? 0 : 1);
}

module.exports = { guardSourceValue, reviewSelfScoreSource, maskText };

if (require.main === module) main();
