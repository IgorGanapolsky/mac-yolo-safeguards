'use strict';

/**
 * HTML → plain text with CodeQL-safe tag filters (js/bad-tag-filter).
 * Closing tags may include whitespace/attrs: </script >, </script\t bar>.
 * Use \b[^>]* before > — not just \s* — so those forms match.
 */

function decodeBasicEntities(s) {
  return String(s || '').replace(/&(#x?[0-9a-fA-F]+|nbsp|amp|lt|gt|quot|apos|#39);/g, (m, name) => {
    const n = String(name).toLowerCase();
    if (n === 'nbsp') return ' ';
    if (n === 'amp') return '&';
    if (n === 'lt') return '<';
    if (n === 'gt') return '>';
    if (n === 'quot') return '"';
    if (n === 'apos' || n === '#39') return "'";
    if (n.startsWith('#x')) {
      const cp = parseInt(n.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    if (n.startsWith('#')) {
      const cp = parseInt(n.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return m;
  });
}

function stripHtml(html) {
  let s = String(html || '');
  // Pair-match open+close with attribute-tolerant end tags (CodeQL bad-tag-filter).
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ' ');
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\b[^>]*>/gi, ' ');
  s = s.replace(/<\/?(?:script|style|noscript)\b[^>]*>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeBasicEntities(s);
  return s.replace(/\s+/g, ' ').trim();
}

module.exports = { stripHtml, decodeBasicEntities };
