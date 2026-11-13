'use strict';
/**
 * Price table for the cost math in mac-yolo-measure. USD per million tokens.
 * Source: https://platform.claude.com/docs/en/about-claude/pricing
 * Checked: 2026-11-13 (fetched this session; cacheWrite is the 5-minute cache write price).
 * Any model not listed here is "unpriced". Never guess a price: add a row only after reading the vendor page.
 * Keys are model-id prefixes as they appear in session logs (longest prefix wins).
 */
const PRICES_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing';
const PRICES_CHECKED = '2026-11-13';
const PRICES = {
  'claude-fable-5-2': { input: 8, cacheWrite: 10, cacheRead: 0.2, output: 40 },
  'claude-fable-5-1': { input: 10, cacheWrite: 12.5, cacheRead: 0.25, output: 50 },
  'claude-fable-5': { input: 10, cacheWrite: 12.5, cacheRead: 1, output: 50 },
  'claude-opus-5-5': { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
  'claude-opus-5': { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  'claude-opus-4-8': { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  'claude-opus-4-7': { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  'claude-opus-4-6': { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  'claude-opus-4-5': { input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25 },
  'claude-sonnet-5-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 },
  'claude-sonnet-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
  'claude-sonnet-4-6': { input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 },
  'claude-sonnet-4-5': { input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 },
};

function priceFor(model, table) {
  const t = table || PRICES;
  const m = String(model || '').toLowerCase();
  const keys = Object.keys(t).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (m === k || m.startsWith(k + '-')) return t[k];
  }
  return null;
}

/** usage: {input, output, cacheWrite, cacheRead} token counts. Returns USD, or null when the model is unpriced. */
function costUSD(model, usage, table) {
  const p = priceFor(model, table);
  if (!p) return null;
  const u = usage || {};
  return ((u.input || 0) * p.input + (u.output || 0) * p.output
    + (u.cacheWrite || 0) * p.cacheWrite + (u.cacheRead || 0) * p.cacheRead) / 1e6;
}

module.exports = { PRICES, PRICES_SOURCE, PRICES_CHECKED, priceFor, costUSD };
