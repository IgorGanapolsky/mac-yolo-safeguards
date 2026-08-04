#!/usr/bin/env node
'use strict';

// Coverage for the URL/HTML parsing in tools/verify-public-post.js.
//
// Why this exists
//   This tool answers one question: "did the post actually go live?" Everything
//   it does downstream of inferPlatform() is chosen BY that answer —
//   defaultMinBody() returns 500 chars for 'medium' but 40 for 'x', and
//   extractArticleish() switches strategy on the same value. So a misread
//   platform does not produce an obviously wrong answer; it produces a
//   confidently wrong SUCCESS. That is the failure mode that matters here: the
//   verifier reporting a post live that it never confirmed.
//
// What went wrong
//   CodeQL flagged 8 x js/incomplete-url-substring-sanitization (2026-07-29,
//   first scan of main in 7 days). inferPlatform matched with
//   url.includes('linkedin.com'), so the marker could sit anywhere in the URL —
//   in a query string, or in a lookalike host. Separately, the script-stripping
//   regex required a bare `</script>` and so missed the legal `</script >`,
//   leaving JS source to be counted as post body.
//
// How we measure it
//   Every assertion below was mutation-tested: the fix was reverted and each
//   test confirmed to FAIL, then restored. A test that passes against both the
//   old and new code proves nothing, and three such tests were caught this way
//   earlier in this session.

const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { inferPlatform, stripHtml, defaultMinBody } = require(
  path.join(ROOT, 'tools', 'verify-public-post.js'),
);

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    failures += 1;
    process.exitCode = 1;
  }
}

// --- inferPlatform: the real hosts still resolve ------------------------------
// Guards against "fixed" by breaking: a stricter matcher that classifies
// everything as 'generic' would silently lower every threshold to 80.
test('genuine post URLs still resolve to their platform', () => {
  assert.equal(inferPlatform('https://medium.com/@igor/some-post-abc123'), 'medium');
  assert.equal(inferPlatform('https://dev.to/igor/some-post'), 'dev.to');
  assert.equal(inferPlatform('https://bsky.app/profile/igor/post/xyz'), 'bluesky');
  assert.equal(inferPlatform('https://www.threads.net/@igor/post/xyz'), 'threads');
  assert.equal(inferPlatform('https://www.linkedin.com/posts/igor_activity-123'), 'linkedin');
  assert.equal(inferPlatform('https://x.com/igor/status/123'), 'x');
  assert.equal(inferPlatform('https://twitter.com/igor/status/123'), 'x');
  assert.equal(inferPlatform('https://news.ycombinator.com/item?id=123'), 'hackernews');
  assert.equal(inferPlatform('https://www.reddit.com/r/x/comments/abc/def/'), 'reddit');
});

test('subdomains of a platform still resolve to it', () => {
  assert.equal(inferPlatform('https://igor.medium.com/a-post-abc123'), 'medium');
  assert.equal(inferPlatform('https://old.reddit.com/r/x/comments/abc/def/'), 'reddit');
});

// --- inferPlatform: THE defect --------------------------------------------
// A substring match let the marker appear anywhere in the URL.
test('a platform marker in the PATH or QUERY does not claim the platform', () => {
  assert.equal(inferPlatform('https://example.com/?ref=linkedin.com'), 'generic');
  assert.equal(inferPlatform('https://example.com/medium.com/post'), 'generic');
  assert.equal(inferPlatform('https://example.com/#news.ycombinator.com'), 'generic');
  assert.equal(inferPlatform('https://example.com/?u=https://x.com/igor/status/1'), 'generic');
});

test('a lookalike host does not claim the platform', () => {
  // Suffix attack: the real domain is a prefix of the attacker's.
  assert.equal(inferPlatform('https://medium.com.evil.test/p'), 'generic');
  assert.equal(inferPlatform('https://linkedin.com.evil.test/p'), 'generic');
  // Prefix attack: the real domain is a suffix but not on a label boundary.
  assert.equal(inferPlatform('https://evil-medium.com/p'), 'generic');
  assert.equal(inferPlatform('https://notreddit.com/p'), 'generic');
});

test('userinfo in the authority cannot smuggle a platform host', () => {
  // The host here is evil.test; 'medium.com' is only the username.
  assert.equal(inferPlatform('https://medium.com@evil.test/p'), 'generic');
});

// --- the consequence, stated as a test ---------------------------------------
// This is why the misclassification is a security finding and not a cosmetic
// one: it silently relaxes how much content must exist to call a post live.
test('a spoofed URL cannot borrow a laxer body threshold than generic', () => {
  const spoofed = inferPlatform('https://example.com/?ref=x.com/igor/status/1');
  assert.equal(spoofed, 'generic');
  // Under the old substring match this returned 'x' -> 40 chars. A 45-character
  // near-empty page would then have verified as a live post.
  assert.equal(defaultMinBody(spoofed), 80);
  assert.ok(defaultMinBody(spoofed) > defaultMinBody('x'),
    'generic must not be laxer than the platform a spoofed URL was borrowing');
});

// --- inferPlatform: robustness -----------------------------------------------
test('unparseable and empty input degrade to generic rather than guessing', () => {
  assert.equal(inferPlatform(''), 'generic');
  assert.equal(inferPlatform(null), 'generic');
  assert.equal(inferPlatform(undefined), 'generic');
  // No scheme -> not a valid URL. Guessing from its text is what caused the bug.
  assert.equal(inferPlatform('medium.com/@igor/post'), 'generic');
  assert.equal(inferPlatform('not a url at all'), 'generic');
});

test('an explicit --platform still overrides inference', () => {
  assert.equal(inferPlatform('https://example.com/', 'medium'), 'medium');
  assert.equal(inferPlatform('https://medium.com/p', 'reddit'), 'reddit');
  assert.equal(inferPlatform('https://example.com/', 'dev to'), 'devto');
});

// --- stripHtml: the closing-tag defect ---------------------------------------
test('script content is removed even when the end tag contains whitespace', () => {
  const html = '<p>real</p><script>var leaked = "SECRETMARKER";</script >';
  const text = stripHtml(html);
  assert.ok(!text.includes('SECRETMARKER'),
    'JS source must not survive as body text when the end tag is `</script >`');
  assert.ok(text.includes('real'), 'visible copy must survive');
});

test('style and noscript end tags with whitespace are also handled', () => {
  assert.ok(!stripHtml('<style>.a{color:STYLEMARKER}</style >').includes('STYLEMARKER'));
  assert.ok(!stripHtml('<noscript>NOSCRIPTMARKER</noscript >').includes('NOSCRIPTMARKER'));
});

test('a whitespace end tag cannot inflate the body past a min-body threshold', () => {
  // The concrete false-green: a page whose only "content" is script source.
  const filler = 'x'.repeat(400);
  const html = `<html><body><script>var a="${filler}";</script ></body></html>`;
  const text = stripHtml(html);
  assert.ok(text.length < defaultMinBody('linkedin'),
    `script-only page must not reach the ${defaultMinBody('linkedin')}-char linkedin floor, got ${text.length}`);
});

test('ordinary script tags are still stripped', () => {
  assert.ok(!stripHtml('<script>var a="PLAINMARKER";</script>').includes('PLAINMARKER'));
});

// --- stripHtml: entity double-unescaping -------------------------------------
test('an escaped entity is not double-unescaped into real markup', () => {
  // The author wrote the literal text "&lt;" — it must stay "&lt;", not become "<".
  assert.equal(stripHtml('<p>&amp;lt;</p>'), '&lt;');
  assert.equal(stripHtml('<p>&amp;gt;</p>'), '&gt;');
  assert.equal(stripHtml('<p>&amp;amp;</p>'), '&amp;');
});

test('single-level entities still decode normally', () => {
  assert.equal(stripHtml('<p>a &amp; b</p>'), 'a & b');
  assert.equal(stripHtml('<p>&lt;tag&gt;</p>'), '<tag>');
  assert.equal(stripHtml('<p>it&#39;s &quot;quoted&quot;</p>'), 'it\'s "quoted"');
  assert.equal(stripHtml('<p>a&nbsp;b</p>'), 'a b');
});

if (failures === 0) console.log('\nall verify-public-post URL/HTML checks passed');
