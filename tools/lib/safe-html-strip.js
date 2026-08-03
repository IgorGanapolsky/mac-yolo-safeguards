'use strict';

/**
 * HTML → plain text with CodeQL-safe tag filters (js/bad-tag-filter, js/double-escaping).
 * Does not implement a full HTML parser; good enough for RSS/post body sniffing.
 */

function decodeBasicEntities(s) {
  // Single-pass entity decode: avoid &amp; → & → later double-use as entity opener.
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
  // Remove script/style blocks — allow whitespace before closing >
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ');
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, ' ');
  // Orphan open/close tags (truncated feeds)
  s = s.replace(/<\/?(?:script|style|noscript)\b[^>]*>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeBasicEntities(s);
  return s.replace(/\s+/g, ' ').trim();
}

module.exports = { stripHtml, decodeBasicEntities };
