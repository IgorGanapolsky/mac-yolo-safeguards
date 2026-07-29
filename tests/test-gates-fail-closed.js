#!/usr/bin/env node
'use strict';

// Fault-injection suite: our verification gates must FAIL CLOSED.
//
// WHY THIS EXISTS
//   Borrowed from Antithesis's central claim about deterministic simulation
//   testing: ordinary tests exercise the happy path, so the code that runs when
//   a dependency FAILS is the code nobody ever executes — and that is where the
//   bugs live. Their fault taxonomy is clock, scheduling, network and storage.
//
//   That claim lands hard here, because this repo's most load-bearing scripts
//   are VERIFIERS — things that answer "did it actually work?". A verifier with
//   unexercised error handling does not merely break; it answers YES when it
//   cannot know. Every expensive failure in this repo has that exact shape:
//
//     - the outreach reply scanner reported "0 replies" for three days while a
//       real buyer reply sat in Trash (auth fault read as an empty result)
//     - grepai returned confident wrong files for five days over a frozen index
//       (storage/staleness fault read as a valid answer)
//     - the CodeQL alert list looked healthy while nothing had scanned main for
//       242 commits (a dead scanner read as a clean scan)
//     - a phantom "31/31 assets 404" outage was reported four times, because a
//       cross-host redirect was measured as if it were our own host
//
//   In every case the instrument was broken and its silence was read as data.
//
// THE PROPERTY UNDER TEST
//   For each injected fault: the gate must NOT report success. `live` must never
//   be true unless the page was genuinely fetched and genuinely contained the
//   post. "Cannot determine" must surface as not-live, never as live.
//
// HOW WE MEASURE IT
//   Faults are injected by replacing global fetch — fully deterministic, no
//   network, no sleeps, so this cannot flake. A POSITIVE CONTROL runs last: a
//   genuinely good page MUST come back live. Without it this suite would pass
//   vacuously if `verify` were changed to always return not-live, which is the
//   most likely way for a fail-closed suite to rot into uselessness.

const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const vpp = require(path.join(ROOT, 'tools', 'verify-public-post.js'));

let pass = 0;
let fail = 0;
function test(name, fn) {
  const realFetch = globalThis.fetch;
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`PASS ${name}`); pass += 1; })
    .catch((e) => {
      console.error(`FAIL ${name}\n  ${e.message}`);
      fail += 1;
      process.exitCode = 1;
    })
    .then(() => { globalThis.fetch = realFetch; });
}

// --- fault injectors ---------------------------------------------------------
// Each returns a fetch replacement simulating one class of dependency failure.

const faults = {
  // NETWORK: connection refused / DNS failure.
  networkDown: () => () => Promise.reject(new Error('ECONNREFUSED')),

  // CLOCK / SCHEDULING: the request never returns and the AbortController fires.
  // Modelled as the DOMException fetch actually throws on abort, so we exercise
  // the same catch path as a real 20s hang without waiting 20 seconds.
  timeoutAbort: () => () => {
    const e = new Error('The operation was aborted');
    e.name = 'AbortError';
    return Promise.reject(e);
  },

  // AUTH: the platform demands a login. Silent 200s are the dangerous shape.
  loginWall401: () => () => Promise.resolve(mkRes(401, '<html><body>Sign in</body></html>')),
  loginWall200: () => () => Promise.resolve(mkRes(200,
    '<html><head><title>Sign In</title></head><body><h1>Sign in</h1>'
    + '<p>Log in to continue to LinkedIn</p></body></html>')),

  // SERVER: 5xx and 404.
  serverError: () => () => Promise.resolve(mkRes(500, 'Internal Server Error')),
  notFound: () => () => Promise.resolve(mkRes(404, '<html><body>Not found</body></html>')),

  // STORAGE / TRUNCATION: a partial write or truncated transfer. This is the
  // fault that actually corrupted grepai's index.gob to 377 bytes, and the shape
  // that matters is a 200 with a body cut mid-document.
  truncatedBody: () => () => Promise.resolve(mkRes(200, '<html><head><title>My Po')),

  // EMPTY: 200 with nothing in it. The purest "absence read as presence" case.
  emptyBody: () => () => Promise.resolve(mkRes(200, '')),

  // CONTENT-SHAPED-LIKE-CONTENT: a 200 whose only bulk is script source.
  //
  // The end tag deliberately carries whitespace — `</script >` — which HTML
  // permits and which the strip regex must therefore handle. A bare
  // `</script>` here would make this case pass trivially and prove nothing,
  // since that form was already stripped correctly.
  scriptOnly: () => () => Promise.resolve(mkRes(200,
    `<html><body><script>var pad="${'x'.repeat(3000)}";</script ></body></html>`)),

  // REDIRECT TO ANOTHER HOST: the exact error that produced a phantom "31/31
  // assets 404" outage report in this repo. A 200 arrives, but from somewhere
  // else entirely.
  //
  // The body is deliberately RICH — long enough and title-matched enough to
  // clear every content threshold. So this case can only pass if the gate
  // actually compares the FINAL url's host against the requested one. A thin
  // body would fail the min-body check instead and hide whether that
  // comparison exists at all.
  crossHostRedirect: (target) => () => Promise.resolve(
    mkRes(200, richPage(), target)),
};

function mkRes(status, body, finalUrl) {
  return {
    status,
    url: finalUrl || 'https://medium.com/@igor/real-post-abc123',
    text: () => Promise.resolve(body),
  };
}

const ARGS = {
  url: 'https://medium.com/@igor/real-post-abc123',
  mustContain: [],
  timeoutMs: 20000,
};

async function verifyUnder(faultFetch, extra = {}) {
  globalThis.fetch = faultFetch;
  return vpp.verify({ ...ARGS, ...extra });
}

// --- the fault matrix --------------------------------------------------------

const cases = [
  ['network down does not report live', faults.networkDown()],
  ['a fetch timeout does not report live', faults.timeoutAbort()],
  ['a 401 login wall does not report live', faults.loginWall401()],
  ['a 200 login wall does not report live', faults.loginWall200()],
  ['a 500 does not report live', faults.serverError()],
  ['a 404 does not report live', faults.notFound()],
  ['a truncated body does not report live', faults.truncatedBody()],
  ['an empty 200 body does not report live', faults.emptyBody()],
  ['a script-only page does not report live', faults.scriptOnly()],
  ['a cross-host redirect does not report live',
    faults.crossHostRedirect('https://accounts.google.com/signin')],
];

async function main() {
  for (const [name, faultFetch] of cases) {
    // eslint-disable-next-line no-await-in-loop
    await test(name, async () => {
      const r = await verifyUnder(faultFetch);
      assert.notStrictEqual(r.live, true,
        `reported live=true under this fault (status=${r.status}, reason=${r.reason})`);
      assert.notStrictEqual(r.exitCode, 0,
        `exited 0 under this fault — a caller checking $? would read success (status=${r.status})`);
      assert.ok(r.reason && String(r.reason).length > 0,
        'must state WHY it could not confirm, not just fail silently');
    });
  }

  // A --must-contain needle must never be satisfied from script source.
  await test('a --must-contain needle is not satisfied by script source', async () => {
    globalThis.fetch = () => Promise.resolve(mkRes(200,
      `<html><body><p>hello</p><script>var s="NEEDLE_IN_SCRIPT";${'y'.repeat(3000)}</script></body></html>`));
    const r = await vpp.verify({ ...ARGS, mustContain: ['NEEDLE_IN_SCRIPT'] });
    assert.notStrictEqual(r.live, true,
      'a needle found only inside <script> must not count as published copy');
  });

  // Draft/editor URLs must never verify, regardless of what the network returns.
  await test('an editor URL never reports live even on a perfect 200', async () => {
    globalThis.fetch = () => Promise.resolve(mkRes(200, richPage()));
    const r = await vpp.verify({ ...ARGS, url: 'https://medium.com/p/abc/edit/' });
    assert.notStrictEqual(r.live, true, 'draft/editor URL must never be LIVE');
  });

  // Ordinary canonicalisation must NOT be treated as drift, or every www/apex
  // redirect on the internet would read as a failed verification.
  await test('www -> apex canonicalisation still reports live', async () => {
    globalThis.fetch = () => Promise.resolve(
      mkRes(200, richPage(), 'https://medium.com/@igor/real-post-abc123'));
    const r = await vpp.verify({
      ...ARGS, url: 'https://www.medium.com/@igor/real-post-abc123',
    });
    assert.strictEqual(r.live, true,
      `www->apex is canonicalisation, not a different party (reason=${r.reason})`);
  });

  await test('describeHostDrift: direct unit cases', async () => {
    const d = vpp.describeHostDrift;
    // Equivalent — no drift.
    assert.strictEqual(d('https://medium.com/p', 'https://medium.com/p'), '');
    assert.strictEqual(d('https://www.medium.com/p', 'https://medium.com/p'), '');
    assert.strictEqual(d('https://medium.com/p', 'https://igor.medium.com/p'), '');
    // Different party — drift, and it must NAME both sides.
    assert.strictEqual(d('https://medium.com/p', 'https://accounts.google.com/signin'),
      'medium.com -> accounts.google.com');
    // A suffix that is not a label boundary is a different party.
    assert.strictEqual(d('https://medium.com/p', 'https://evil-medium.com/p'),
      'medium.com -> evil-medium.com');
    // Absent/unparseable must not manufacture a redirect.
    assert.strictEqual(d('https://medium.com/p', ''), '');
    assert.strictEqual(d('https://medium.com/p', 'not a url'), '');
  });

  // ---- POSITIVE CONTROL -----------------------------------------------------
  // Without this, changing verify() to always return not-live would make every
  // test above pass. This is the assertion that keeps the suite honest.
  await test('POSITIVE CONTROL: a genuine rich page DOES report live', async () => {
    globalThis.fetch = () => Promise.resolve(mkRes(200, richPage()));
    const r = await vpp.verify({ ...ARGS, mustContain: ['governed agents'] });
    assert.strictEqual(r.live, true,
      `a real page must verify, else the fail-closed cases above are vacuous `
      + `(status=${r.status}, reason=${r.reason})`);
    assert.strictEqual(r.exitCode, 0, 'a genuine live post must exit 0');
  });

  console.log(`\n=== gates-fail-closed: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}

function richPage() {
  const body = 'We shipped governed agents that ask before they act. '.repeat(30);
  return `<html><head><title>Governed agents: a field report</title></head>`
    + `<body><article><h1>Governed agents: a field report</h1>`
    + `<p>${body}</p></article></body></html>`;
}

main();
