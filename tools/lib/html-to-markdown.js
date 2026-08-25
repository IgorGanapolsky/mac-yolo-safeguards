'use strict';

/**
 * html-to-markdown.js — tokenizer-based HTML → Markdown extraction.
 *
 * WHY A TOKENIZER AND NOT REGEX TAG FILTERS
 * -----------------------------------------
 * "Delete the dangerous tags out of the HTML string with .replace(/<script.../)"
 * is the CodeQL js/bad-tag-filter + js/incomplete-multi-character-sanitization
 * family, and it is unfixable in the general case:
 *
 *   - `</script >` / `</script\t>` / `</script bar>` are all valid end tags,
 *     so a filter anchored on the literal `</script>` leaks the body.
 *   - A single removal pass can *create* a new `<script` out of `<scr<script>ipt>`.
 *   - `<a href="x>y">` means a `>` inside a quoted attribute value is not the
 *     end of the tag, which no `<[^>]+>` regex can know.
 *   - Chained `.replace(/&amp;/g,'&').replace(/&lt;/g,'<')` double-unescapes:
 *     `&amp;lt;` becomes `<` (CodeQL js/double-escaping).
 *
 * This module never filters HTML. It TOKENIZES it once, left to right, with an
 * HTML5-shaped scanner, and rebuilds Markdown from the token stream. Tags are
 * never carried into the output — they are consumed by the scanner — so there is
 * no "did my filter catch every spelling of this tag" question to get wrong.
 *
 * AGENTS.md, "Code scanning hygiene": naive script strip is banned; HTML helpers
 * live under tools/lib/. Companion to tools/lib/safe-html-strip.js, whose
 * single-pass entity decoder is reused here.
 *
 * The scanner is O(n) with no backtracking and no nested quantifiers, so it is
 * not a ReDoS surface on adversarial input.
 */

const { decodeBasicEntities } = require('./safe-html-strip');

/** Elements whose content is raw text, not markup: `<` inside them is data. */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'noscript', 'textarea', 'title', 'template']);

/** Elements whose entire subtree carries no readable prose. */
const DROP_SUBTREE_TAGS = new Set(['svg', 'math', 'canvas', 'iframe', 'object', 'video', 'audio']);

/** Block-level tags that open with a Markdown prefix. */
const BLOCK_PREFIX = {
  h1: '\n\n# ',
  h2: '\n\n## ',
  h3: '\n\n### ',
  h4: '\n\n#### ',
  h5: '\n\n##### ',
  h6: '\n\n###### ',
  li: '\n- ',
  blockquote: '\n\n> ',
};

/** Block-level tags that merely force a line break around their content. */
const BLOCK_BREAK = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside',
  'ul', 'ol', 'table', 'tr', 'pre', 'hr', 'form', 'figure', 'dl', 'dt', 'dd',
]);

/** Inline tags rebuilt as `<marker>text<marker>` once their content is known. */
const INLINE_MARKER = { strong: '**', b: '**', em: '*', i: '*', code: '`', del: '~~', s: '~~' };

const MAX_INLINE_DEPTH = 64;
const WS = /\s/;
const TAG_NAME_CHAR = /[A-Za-z0-9:_.-]/;

/**
 * Parse one tag starting at `start` (which must index a `<`).
 * Understands quoted attribute values, so a `>` inside `href="x>y"` does not
 * terminate the tag. Returns null when `<` does not begin a tag (e.g. `a < b`).
 */
function parseTag(src, start) {
  const n = src.length;
  let i = start + 1;
  let closing = false;
  if (src[i] === '/') {
    closing = true;
    i++;
  }
  const nameStart = i;
  while (i < n && TAG_NAME_CHAR.test(src[i])) i++;
  if (i === nameStart) return null;
  const name = src.slice(nameStart, i).toLowerCase();

  const attrs = {};
  let selfClosing = false;
  while (i < n) {
    while (i < n && WS.test(src[i])) i++;
    if (i >= n) break;
    if (src[i] === '>') {
      i++;
      break;
    }
    if (src[i] === '/') {
      selfClosing = true;
      i++;
      continue;
    }
    const attrStart = i;
    while (i < n && !WS.test(src[i]) && src[i] !== '=' && src[i] !== '>') i++;
    if (i === attrStart) {
      // Not a legal attribute-name start (e.g. a stray '='): consume and retry.
      i++;
      continue;
    }
    const attrName = src.slice(attrStart, i).toLowerCase();

    let value = '';
    let j = i;
    while (j < n && WS.test(src[j])) j++;
    if (src[j] === '=') {
      j++;
      while (j < n && WS.test(src[j])) j++;
      const quote = src[j];
      if (quote === '"' || quote === "'") {
        j++;
        const valueStart = j;
        while (j < n && src[j] !== quote) j++;
        value = src.slice(valueStart, j);
        if (j < n) j++;
      } else {
        const valueStart = j;
        while (j < n && !WS.test(src[j]) && src[j] !== '>') j++;
        value = src.slice(valueStart, j);
      }
      i = j;
    }
    if (!(attrName in attrs)) attrs[attrName] = value;
  }
  return { name, closing, selfClosing, attrs, end: i };
}

/**
 * Find the end tag of a raw-text element, per the HTML5 rule that the tag name
 * must be followed by whitespace, `/`, or `>`. This is what makes `</script >`,
 * `</script\t>` and `</script bar>` all terminate the element — the exact case
 * CodeQL js/bad-tag-filter reports against literal `</script>` matchers.
 */
function findRawTextEnd(src, lowerSrc, from, name) {
  const needle = `</${name}`;
  let cursor = from;
  while (cursor <= lowerSrc.length) {
    const hit = lowerSrc.indexOf(needle, cursor);
    if (hit === -1) return -1;
    const after = src[hit + needle.length];
    if (after === undefined || after === '>' || after === '/' || WS.test(after)) return hit;
    cursor = hit + needle.length;
  }
  return -1;
}

/**
 * Tokenize HTML into `text` / `open` / `close` / `dropped` tokens.
 * Comments, doctypes, processing instructions and raw-text bodies are consumed
 * by the scanner and never appear as text.
 */
function tokenizeHtml(html) {
  const src = String(html == null ? '' : html);
  const lowerSrc = src.toLowerCase();
  const tokens = [];
  const n = src.length;
  let i = 0;
  let text = '';

  const flushText = () => {
    if (text) {
      tokens.push({ type: 'text', value: text });
      text = '';
    }
  };

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      text += src.slice(i);
      break;
    }
    text += src.slice(i, lt);

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (src[lt + 1] === '!' || src[lt + 1] === '?') {
      const end = src.indexOf('>', lt + 2);
      i = end === -1 ? n : end + 1;
      continue;
    }

    const tag = parseTag(src, lt);
    if (!tag) {
      // A `<` that does not start a tag is literal data (`a < b`).
      text += '<';
      i = lt + 1;
      continue;
    }
    flushText();

    if (!tag.closing && !tag.selfClosing && RAW_TEXT_TAGS.has(tag.name)) {
      const endIdx = findRawTextEnd(src, lowerSrc, tag.end, tag.name);
      if (endIdx === -1) {
        i = n;
      } else {
        const endTag = parseTag(src, endIdx);
        i = endTag ? endTag.end : n;
      }
      tokens.push({ type: 'dropped', name: tag.name });
      continue;
    }

    tokens.push({
      type: tag.closing ? 'close' : 'open',
      name: tag.name,
      attrs: tag.attrs,
      selfClosing: tag.selfClosing,
    });
    i = tag.end;
  }

  flushText();
  return tokens;
}

/**
 * Re-encode the three markup-significant characters in ONE pass.
 *
 * Text tokens are decoded exactly once (decodeBasicEntities) to recover the real
 * characters, then the characters that could be read as markup downstream are
 * encoded again for the output context. One pass with a callback — never a chain
 * of .replace() calls — so no sequence of entities can be unescaped twice
 * (CodeQL js/double-escaping). `&` is only re-encoded when it actually begins an
 * entity, so ordinary prose ("Tom & Jerry") stays readable while `&amp;lt;`
 * round-trips back to `&amp;lt;` instead of collapsing into `<`.
 */
function escapeMarkupChars(s) {
  return String(s).replace(/[<>]|&(?=#?[0-9a-zA-Z]{1,31};)/g, (c) => {
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    return '&amp;';
  });
}

function renderInline(tag, attrs, inner) {
  const body = inner.trim();
  if (!body) return ' ';
  if (tag === 'a') {
    // Attribute values are raw source: decode once, then re-encode markup chars
    // on the same one-pass path as text so a crafted href cannot smuggle markup.
    const href = escapeMarkupChars(decodeBasicEntities(String(attrs.href || ''))).trim();
    if (!href || /^(?:javascript|data|vbscript):/i.test(href)) return body;
    return `[${body}](${href})`;
  }
  const marker = INLINE_MARKER[tag];
  return marker ? `${marker}${body}${marker}` : body;
}

/**
 * Convert an HTML document to Markdown-ish plain text.
 * The output is guaranteed to contain no HTML tags: every `<` in the result is
 * encoded, because tags are consumed by the tokenizer and text is escaped once.
 */
function htmlToMarkdown(html) {
  const tokens = tokenizeHtml(html);
  const frames = [{ tag: null, attrs: {}, out: [] }];
  const top = () => frames[frames.length - 1];
  const emit = (s) => {
    if (s) top().out.push(s);
  };

  let skipTag = null;
  let skipDepth = 0;

  const closeFrame = () => {
    const frame = frames.pop();
    emit(renderInline(frame.tag, frame.attrs, frame.out.join('')));
  };

  for (const token of tokens) {
    if (skipDepth > 0) {
      if (token.type === 'open' && token.name === skipTag && !token.selfClosing) skipDepth++;
      else if (token.type === 'close' && token.name === skipTag) skipDepth--;
      continue;
    }

    if (token.type === 'text') {
      emit(escapeMarkupChars(decodeBasicEntities(token.value)));
      continue;
    }
    if (token.type === 'dropped') {
      emit(' ');
      continue;
    }

    if (token.type === 'open') {
      const { name, attrs, selfClosing } = token;
      if (DROP_SUBTREE_TAGS.has(name)) {
        if (!selfClosing) {
          skipTag = name;
          skipDepth = 1;
        }
        emit(' ');
        continue;
      }
      if (name === 'br') {
        emit('\n');
        continue;
      }
      if (BLOCK_PREFIX[name]) {
        emit(BLOCK_PREFIX[name]);
        continue;
      }
      if (BLOCK_BREAK.has(name)) {
        emit('\n\n');
        continue;
      }
      if ((name === 'a' || INLINE_MARKER[name]) && !selfClosing) {
        if (frames.length < MAX_INLINE_DEPTH) {
          frames.push({ tag: name, attrs, out: [] });
        }
        continue;
      }
      emit(' ');
      continue;
    }

    // close
    const { name } = token;
    if (BLOCK_PREFIX[name] || BLOCK_BREAK.has(name)) {
      emit(name === 'li' ? '' : '\n\n');
      continue;
    }
    if (name === 'a' || INLINE_MARKER[name]) {
      // Unwind to the matching frame; ignore a close tag that was never opened.
      let depth = -1;
      for (let k = frames.length - 1; k >= 1; k--) {
        if (frames[k].tag === name) {
          depth = k;
          break;
        }
      }
      if (depth === -1) continue;
      while (frames.length > depth) closeFrame();
      continue;
    }
    emit(' ');
  }

  while (frames.length > 1) closeFrame();

  return frames[0].out
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  tokenizeHtml,
  htmlToMarkdown,
  escapeMarkupChars,
  parseTag,
  findRawTextEnd,
  RAW_TEXT_TAGS,
  DROP_SUBTREE_TAGS,
};
