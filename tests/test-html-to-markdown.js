#!/usr/bin/env node
'use strict';

/**
 * Adversarial extraction tests for tools/lib/html-to-markdown.js.
 *
 * Every case in ADVERSARIAL is a real CodeQL finding shape against the regex
 * tag-filter this module replaced (alerts 165-169 on PR #2010):
 *   - js/bad-tag-filter                       → `</script >` with the space
 *   - js/incomplete-multi-character-sanitization → `<script` / `<style` / `<!--`
 *   - js/double-escaping                      → `&amp;lt;` unescaped twice
 *
 * The invariant asserted on ALL of them: the output never contains a `<`.
 * Tags are consumed by the tokenizer and text is escaped once, so there is no
 * spelling of a tag that can survive into the extracted Markdown.
 */

const assert = require('assert');
const {
  htmlToMarkdown,
  tokenizeHtml,
  escapeMarkupChars,
  findRawTextEnd,
} = require('../tools/lib/html-to-markdown');

const ADVERSARIAL = [
  // --- js/bad-tag-filter: end tags that a literal `</script>` matcher misses ---
  ['close tag with space', '<div>keep<script>alert(1)</script >tail</div>', ['alert(1)']],
  ['close tag with tab', '<div>keep<script>alert(2)</script\t>tail</div>', ['alert(2)']],
  ['close tag with attrs', '<div>keep<script type="a">alert(3)</script bar>tail</div>', ['alert(3)']],
  ['close tag self-closing', '<div>keep<script>alert(4)</script/>tail</div>', ['alert(4)']],
  ['style close with space', '<style>.x{color:red}</style >visible', ['color:red']],
  ['noscript close with space', '<noscript>hidden</noscript >shown', ['hidden']],
  ['uppercase SCRIPT', '<div>keep<SCRIPT>alert(5)</SCRIPT >tail</div>', ['alert(5)']],
  ['unterminated script', '<div>keep<script>alert(6)', ['alert(6)']],

  // --- js/incomplete-multi-character-sanitization: one removal pass creates a new tag ---
  ['nested script tag', '<scr<script>ipt>alert(7)</script>x', ['<script', '<scr']],
  ['nested style tag', '<sty<style>le>body{}</style>x', ['<style']],
  ['nested comment', 'A<!--<!-- -->-->B', ['<!--']],
  ['comment wrapping script', '<!--<script>alert(8)</script>-->ok', ['<script', 'alert(8)']],

  // --- js/double-escaping: `&amp;lt;` must NOT become `<` ---
  ['double unescape lt', 'X &amp;lt;script&amp;gt; Y', ['<script', '<']],
  ['double unescape amp', '&amp;amp;lt;img&amp;gt;', ['<img', '<']],
  ['entity encoded script', '&lt;script&gt;alert(9)&lt;/script&gt;', ['<script', '<']],

  // --- tag-boundary cases no `<[^>]+>` regex can get right ---
  ['gt inside quoted attr', '<a href="x>y">hi</a>', ['<a href']],
  ['lt in text', 'if a < b and c > d then', ['< b']],
  ['bogus comment', '<!doctype html><p>doc</p>', ['<!doctype']],
];

function main() {
  for (const [name, html, mustNotContain] of ADVERSARIAL) {
    const out = htmlToMarkdown(html);
    assert.ok(
      !out.includes('<'),
      `${name}: output leaked a raw '<' — got ${JSON.stringify(out)}`,
    );
    for (const forbidden of mustNotContain) {
      assert.ok(
        !out.includes(forbidden),
        `${name}: output leaked ${JSON.stringify(forbidden)} — got ${JSON.stringify(out)}`,
      );
    }
  }

  // Surrounding prose survives; only the dangerous subtree is dropped.
  assert.match(htmlToMarkdown('<div>keep<script>alert(1)</script >tail</div>'), /keep/);
  assert.match(htmlToMarkdown('<div>keep<script>alert(1)</script >tail</div>'), /tail/);
  assert.match(htmlToMarkdown('<style>.x{}</style >visible'), /visible/);

  // findRawTextEnd implements the HTML5 rule directly.
  assert.strictEqual(findRawTextEnd('<script>a</script >', '<script>a</script >', 8, 'script'), 9);
  assert.strictEqual(findRawTextEnd('<script>a</scriptx>', '<script>a</scriptx>', 8, 'script'), -1);

  // Entity handling is exactly one decode + one encode — never two of either.
  assert.strictEqual(escapeMarkupChars('<'), '&lt;');
  assert.strictEqual(escapeMarkupChars('&lt;'), '&amp;lt;');
  assert.strictEqual(escapeMarkupChars('Tom & Jerry'), 'Tom & Jerry', 'bare & stays readable');
  assert.strictEqual(htmlToMarkdown('&amp;lt;'), '&amp;lt;', '&amp;lt; must round-trip, not collapse to <');
  assert.strictEqual(htmlToMarkdown('&lt;'), '&lt;');

  // Markdown structure is preserved.
  const md = htmlToMarkdown(
    '<html><head><script>track()</script></head><body><h1>Hello</h1>' +
      '<p>This is <strong>bold</strong> and a <a href="https://example.com">link</a>.</p>' +
      '<ul><li>One</li><li>Two</li></ul></body></html>',
  );
  assert.match(md, /# Hello/);
  assert.match(md, /\*\*bold\*\*/);
  assert.match(md, /\[link\]\(https:\/\/example\.com\)/);
  assert.match(md, /- One/);
  assert.match(md, /- Two/);
  assert.doesNotMatch(md, /track\(\)/);

  // javascript: and data: hrefs are not rendered as links.
  assert.strictEqual(htmlToMarkdown('<a href="javascript:alert(1)">click</a>'), 'click');
  assert.strictEqual(htmlToMarkdown('<a href="JavaScript:alert(1)">click</a>'), 'click');
  assert.strictEqual(htmlToMarkdown('<a href="data:text/html,x">click</a>'), 'click');

  // svg / iframe subtrees carry no prose and are dropped whole.
  assert.doesNotMatch(htmlToMarkdown('<p>a</p><svg><text>inside</text></svg><p>b</p>'), /inside/);
  assert.doesNotMatch(htmlToMarkdown('<iframe><p>framed</p></iframe>ok'), /framed/);

  // Malformed / hostile input must not throw or hang.
  for (const junk of ['<<<<>>>>', '<a href=', '<'.repeat(2000), '<p '.repeat(2000), '&#x', '&#999999999;']) {
    assert.strictEqual(typeof htmlToMarkdown(junk), 'string');
  }

  // Tokenizer contract: no token stream ever carries a tag through as text.
  const tokens = tokenizeHtml('<div>x<script>y</script >z</div>');
  assert.ok(tokens.every((t) => t.type !== 'text' || !t.value.includes('<script')));

  console.log(`ok tests/test-html-to-markdown.js (${ADVERSARIAL.length} adversarial inputs)`);
}

main();
