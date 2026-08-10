#!/usr/bin/env node
'use strict';

/**
 * test-social-publish.js — focused tests for the token-based publisher.
 *
 * Everything here runs offline with a stub fetch: no credentials, no network,
 * so this is safe in CI and in an unattended run. The cases that matter most are
 * the ones that would silently ship broken content — byte-offset link facets and
 * the two-shaped Retry-After header — rather than the happy path.
 */

const assert = require('assert');
const {
  detectLinkFacets, graphemeLength, parseRetryAfter, describeHttpFailure,
  normalizeTags, verifyPublished, run,
} = require('../tools/social-publish.js');

let passed = 0;
function t(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); passed++; }
  catch (err) { console.error(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}
async function ta(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (err) { console.error(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

console.log('detectLinkFacets — byte offsets, not string indices');

t('finds a plain link and brackets it exactly', () => {
  const text = 'see https://thumbgate.app/ now';
  const [f] = detectLinkFacets(text);
  assert.strictEqual(f.features[0].uri, 'https://thumbgate.app/');
  // Slice by BYTES and confirm we recovered the URL exactly.
  const got = Buffer.from(text, 'utf8').slice(f.index.byteStart, f.index.byteEnd).toString('utf8');
  assert.strictEqual(got, 'https://thumbgate.app/');
});

t('multi-byte text before the link shifts the offset (the real bug)', () => {
  // Emoji + curly quotes are 2-4 bytes each. If we used JS string indices here the
  // facet would land mid-URL and the link would render dead or truncated.
  const text = '🚀 “agents” — https://thumbgate.app/?a=1';
  const [f] = detectLinkFacets(text);
  const got = Buffer.from(text, 'utf8').slice(f.index.byteStart, f.index.byteEnd).toString('utf8');
  assert.strictEqual(got, 'https://thumbgate.app/?a=1');
  assert.notStrictEqual(f.index.byteStart, text.indexOf('https'),
    'byte offset should differ from the JS string index when multi-byte chars precede the URL');
});

t('trailing sentence punctuation is not swallowed into the URL', () => {
  const [f] = detectLinkFacets('read it at https://thumbgate.app/go/ios.');
  assert.strictEqual(f.features[0].uri, 'https://thumbgate.app/go/ios');
});

t('handles multiple links and no links', () => {
  assert.strictEqual(detectLinkFacets('a https://x.test b https://y.test').length, 2);
  assert.deepStrictEqual(detectLinkFacets('no links here'), []);
});

console.log('graphemeLength — Bluesky counts graphemes');
t('emoji counts as one grapheme, not two UTF-16 units', () => {
  assert.strictEqual(graphemeLength('🚀'), 1);
  assert.ok('🚀'.length === 2, 'sanity: JS .length would say 2');
});

console.log('parseRetryAfter — dev.to sends two different shapes');
t('integer seconds', () => {
  assert.strictEqual(parseRetryAfter('30', Date.parse('2026-08-10T00:00:00Z')), 30000);
});
t('RFC 7231 HTTP-date', () => {
  const now = Date.parse('2026-07-31T06:59:00Z');
  assert.strictEqual(parseRetryAfter('Fri, 31 Jul 2026 07:00:00 GMT', now), 60000);
});
t('garbage returns null rather than NaN (NaN would cause a retry storm)', () => {
  assert.strictEqual(parseRetryAfter('soon', Date.now()), null);
  assert.strictEqual(parseRetryAfter(undefined, Date.now()), null);
});
t('a date already in the past clamps to 0, never negative', () => {
  assert.strictEqual(parseRetryAfter('Fri, 31 Jul 2026 07:00:00 GMT', Date.parse('2026-08-10T00:00:00Z')), 0);
});

console.log('describeHttpFailure — 401/403/429 are different fixes');
t('distinguishes the auth failure modes', () => {
  assert.match(describeHttpFailure(401, 'dev.to'), /revoked|missing/i);
  assert.match(describeHttpFailure(403, 'dev.to'), /permission/i);
  assert.match(describeHttpFailure(429, 'dev.to'), /Retry-After/i);
});

console.log('normalizeTags');
t('lowercases, strips punctuation, caps at 4', () => {
  assert.deepStrictEqual(normalizeTags('DevOps, AI, Security, SRE, extra'), ['devops', 'ai', 'security', 'sre']);
});

console.log('credential absence is a usage error, not a crash');
(async () => {
  await ta('devto without DEVTO_API_KEY exits 2 with an actionable message', async () => {
    const r = await run({ platform: 'devto', title: 'x', body: 'y' },
      { fetch: async () => { throw new Error('must not be called'); }, env: {}, now: () => new Date() });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 2);
    assert.match(r.error, /DEVTO_API_KEY/);
  });

  await ta('bluesky without credentials exits 2', async () => {
    const r = await run({ platform: 'bluesky', text: 'hi' },
      { fetch: async () => { throw new Error('must not be called'); }, env: {}, now: () => new Date() });
    assert.strictEqual(r.code, 2);
    assert.match(r.error, /BLUESKY_HANDLE/);
  });

  await ta('unsupported platform names why, and does not silently no-op', async () => {
    const r = await run({ platform: 'x' }, { fetch: async () => {}, env: {}, now: () => new Date() });
    assert.strictEqual(r.code, 2);
    assert.match(r.error, /Medium|X/);
  });

  console.log('dry run never touches the network');
  await ta('bluesky dry run computes facets without fetching', async () => {
    const r = await run(
      { platform: 'bluesky', text: 'go https://thumbgate.app/ now', dryRun: true },
      { fetch: async () => { throw new Error('network must not be touched in a dry run'); },
        env: { BLUESKY_HANDLE: 'h', BLUESKY_APP_PASSWORD: 'p' }, now: () => new Date('2026-08-10T00:00:00Z') });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.dryRun, true);
    assert.strictEqual(r.facetCount, 1);
  });

  await ta('bluesky refuses an over-length post before spending a request', async () => {
    const r = await run(
      { platform: 'bluesky', text: 'a'.repeat(301) },
      { fetch: async () => { throw new Error('must not be called'); },
        env: { BLUESKY_HANDLE: 'h', BLUESKY_APP_PASSWORD: 'p' }, now: () => new Date() });
    assert.strictEqual(r.code, 2);
    assert.match(r.error, /301 graphemes/);
  });

  console.log('the honesty contract: no verified URL => not Published');
  await ta('publish that cannot be refetched reports NOT ok and says log it Blocked', async () => {
    const fetchStub = async (url, init) => {
      if (String(url).includes('dev.to/api/articles') && init && init.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ url: 'https://dev.to/x/y', id: 1 }) };
      }
      return { ok: false, status: 404, text: async () => '' }; // refetch fails
    };
    const r = await run({ platform: 'devto', title: 'T', body: 'B' },
      { fetch: fetchStub, env: { DEVTO_API_KEY: 'k' }, now: () => new Date() });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.verified, false);
    assert.match(r.error, /Blocked, not Published/);
  });

  await ta('publish + successful refetch containing the text reports verified', async () => {
    const fetchStub = async (url, init) => {
      if (String(url).includes('dev.to/api/articles') && init && init.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ url: 'https://dev.to/x/y', id: 1 }) };
      }
      return { ok: true, status: 200, text: async () => 'page body with SENTINEL inside' };
    };
    const r = await run({ platform: 'devto', title: 'T', body: 'B', mustContain: 'SENTINEL' },
      { fetch: fetchStub, env: { DEVTO_API_KEY: 'k' }, now: () => new Date() });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.verified, true);
    assert.strictEqual(r.url, 'https://dev.to/x/y');
  });

  await ta('refetch missing the expected text is NOT verified', async () => {
    const fetchStub = async (url, init) => {
      if (String(url).includes('dev.to/api/articles') && init && init.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ url: 'https://dev.to/x/y' }) };
      }
      return { ok: true, status: 200, text: async () => 'an unrelated page' };
    };
    const r = await run({ platform: 'devto', title: 'T', body: 'B', mustContain: 'SENTINEL' },
      { fetch: fetchStub, env: { DEVTO_API_KEY: 'k' }, now: () => new Date() });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /did not contain/);
  });

  await ta('a 201 with no URL is not Published', async () => {
    const fetchStub = async () => ({ ok: true, status: 201, json: async () => ({ id: 7 }) });
    const r = await run({ platform: 'devto', title: 'T', body: 'B' },
      { fetch: fetchStub, env: { DEVTO_API_KEY: 'k' }, now: () => new Date() });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /no URL/);
  });

  await ta('429 surfaces a parsed Retry-After instead of retrying blindly', async () => {
    const fetchStub = async () => ({
      ok: false, status: 429,
      headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? '45' : null) },
      text: async () => 'rate limited',
    });
    const r = await run({ platform: 'devto', title: 'T', body: 'B' },
      { fetch: fetchStub, env: { DEVTO_API_KEY: 'k' }, now: () => new Date() });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.retryAfterMs, 45000);
  });

  await ta('verifyPublished treats a network throw as unverified, never as success', async () => {
    const r = await verifyPublished('https://x.test', 'SENTINEL',
      { fetch: async () => { throw new Error('ECONNRESET'); } });
    assert.strictEqual(r.verified, false);
    assert.match(r.reason, /ECONNRESET/);
  });


  console.log('hashnode — permanently frozen, must refuse');

  await ta('hashnode refuses even with a token set, citing the ban not a capability gap', async () => {
    const r = await run({ platform: 'hashnode', title: 'T', body: 'B' },
      { fetch: async () => { throw new Error('must never reach the network'); },
        env: { HASHNODE_TOKEN: 'valid-looking-token' }, now: () => new Date() });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /permanently frozen/);
    assert.match(r.error, /AGENTS\.md/);
  });

  console.log('verification requires content evidence');

  await ta('a 2xx with no mustContain is NOT verified (SPA and login shells return 200)', async () => {
    const r = await verifyPublished('https://x.test', null,
      { fetch: async () => ({ ok: true, status: 200, text: async () => 'a login wall' }) });
    assert.strictEqual(r.verified, false);
    assert.match(r.reason, /content evidence/);
  });

  await ta('publish without mustContain reports unverified but still returns the URL to persist', async () => {
    const fetchStub = async (url, init) => {
      if (init && init.method === 'POST') return { ok: true, status: 201, json: async () => ({ url: 'https://dev.to/a/b' }) };
      return { ok: true, status: 200, text: async () => 'whatever' };
    };
    const r = await run({ platform: 'devto', title: 'T', body: 'B' },
      { fetch: fetchStub, env: { DEVTO_API_KEY: 'k' }, now: () => new Date() });
    assert.strictEqual(r.ok, false);
    // The URL must survive a failed verification or the caller cannot dedupe and republishes.
    assert.strictEqual(r.url, 'https://dev.to/a/b');
  });

  console.log(`\n${passed} passed${process.exitCode ? ' — WITH FAILURES' : ''}`);
})();
