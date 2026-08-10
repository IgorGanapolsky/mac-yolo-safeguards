#!/usr/bin/env node
/**
 * publish-once.js — refuses to publish the same body to the same target twice.
 *
 * The incident this prevents
 * --------------------------
 * 2026-07-30, r/AI_Agents thread 1v87xjd. A reply was submitted three times. Each
 * submit actually succeeded; the verification step read the wrong form and reported
 * failure, so the retry loop fired again — twice. Three identical comments landed
 * under a stranger's post and had to be deleted by hand.
 *
 * The tempting lesson is "write a better verifier." That is the wrong lesson, and
 * it is wrong in a way worth being precise about.
 *
 * Verification of a remote write is fundamentally unreliable. The write can succeed
 * and the confirmation can be lost — a dropped socket, a re-render, a lazy-loaded
 * list, a bridge disconnect. When the confirmation is missing you cannot distinguish
 * "it did not happen" from "it happened and I did not see it." Every retry policy
 * built on that distinction is a coin flip, and the coin lands on double-post.
 *
 * So do not resolve the ambiguity. Remove it: make the retry harmless. A second
 * attempt with the same (target, body) is refused locally, before it reaches the
 * network, whether or not the first attempt was observed to work.
 *
 * This is the same shape as the lease invariant in tools/resource-lease.js — at most
 * one effect per intent, enforced by construction rather than by observation. The
 * bug in that file and this incident are the same bug at different layers.
 *
 * Why hash the body
 * -----------------
 * Keying on target alone would block legitimate follow-ups in the same thread.
 * Keying on (target, sha256(normalised body)) blocks only the actual duplicate.
 * Normalisation collapses whitespace so a re-wrap does not read as new content.
 *
 * Receipts are append-only JSONL under coordination/publish-receipts.jsonl so they
 * survive process death — the crash mid-publish is precisely when this matters.
 *
 * Corruption handling (why a malformed line is never silently dropped)
 * --------------------------------------------------------------------
 * A receipt line that fails to parse could be the "committed" record of a publish
 * that already happened. Dropping it silently turns the guard fail-OPEN: the ledger
 * forgets the publish and the next claim re-grants — the exact triple-post this tool
 * exists to prevent. So malformed lines get an explicit outcome instead:
 *   - every malformed line is copied (once, content-addressed) to
 *     <receipts>.rejects.jsonl for inspection; the source ledger is never rewritten
 *   - a malformed FINAL line is tolerated as crash debris — the append-only contract
 *     already accepts losing at most the in-flight last line — but is reported
 *   - a malformed line anywhere EARLIER is history damage: claims fail CLOSED until
 *     an operator inspects the quarantine and passes --accept-corruption
 *
 * Usage:
 *   node tools/publish-once.js claim --target reddit:t1_p0n78ck --body-file reply.md [--accept-corruption]
 *   node tools/publish-once.js commit --token <token> --url <permalink>
 *   node tools/publish-once.js abandon --token <token> --reason "editor rejected"
 *   node tools/publish-once.js list [--target reddit:t1_p0n78ck]
 *
 * Exit: 0 claim granted / ok · 3 DUPLICATE, do not publish · 4 ledger CORRUPT, fail
 * closed · 1 error · 2 usage
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Overridable so the test suite can exercise the real code against a scratch file.
// A guard that is only ever tested through a mock is a guard nobody has tested.
const RECEIPTS =
  process.env.PUBLISH_RECEIPTS_PATH ||
  path.join(__dirname, "..", "coordination", "publish-receipts.jsonl");

/**
 * A claim older than this with no commit is assumed dead and may be retried.
 * Long enough that a slow editor is not mistaken for a crash; short enough that a
 * genuine crash does not block the target for the rest of the day.
 */
const STALE_CLAIM_MS = 10 * 60 * 1000;

function normalise(body) {
  return String(body).replace(/\s+/g, " ").trim().toLowerCase();
}

function bodyHash(body) {
  return crypto.createHash("sha256").update(normalise(body)).digest("hex").slice(0, 16);
}

/**
 * Copy malformed lines to the quarantine file, once per distinct line content.
 * Reads happen constantly, so this must be idempotent or the rejects file would
 * grow on every list/claim until it drowned the one line that mattered.
 */
function quarantine(bad) {
  if (!bad.length) return;
  const qPath = `${RECEIPTS}.rejects.jsonl`;
  const seen = new Set(
    fs.existsSync(qPath)
      ? fs.readFileSync(qPath, "utf8").split("\n").filter(Boolean).map((l) => {
          try { return JSON.parse(l).rawSha256; } catch { return null; }
        })
      : [],
  );
  const fresh = bad
    .map((b) => ({
      quarantinedAt: new Date().toISOString(),
      source: RECEIPTS,
      lineNumber: b.lineNumber,
      raw: b.raw.slice(0, 500),
      reason: b.reason,
      rawSha256: crypto.createHash("sha256").update(b.raw).digest("hex"),
    }))
    .filter((b) => !seen.has(b.rawSha256));
  if (!fresh.length) return;
  fs.mkdirSync(path.dirname(qPath), { recursive: true });
  fs.appendFileSync(qPath, fresh.map((b) => JSON.stringify(b)).join("\n") + "\n");
}

/**
 * Read the ledger without discarding evidence. A malformed FINAL line is torn-tail
 * crash debris (the append-only contract accepts that loss); a malformed line
 * anywhere earlier means history was damaged and uniqueness can no longer be proven.
 */
function readReceiptsAudited() {
  if (!fs.existsSync(RECEIPTS)) return { receipts: [], rejects: [], tornTail: null };
  const lines = fs.readFileSync(RECEIPTS, "utf8").split("\n");
  const receipts = [];
  const bad = [];
  let lastContentLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    lastContentLine = i + 1;
    try {
      receipts.push(JSON.parse(lines[i]));
    } catch (err) {
      bad.push({ lineNumber: i + 1, raw: lines[i], reason: String((err && err.message) || err) });
    }
  }
  const acked = new Set(
    receipts.filter((r) => r && r.state === "torn_tail_acknowledged").map((r) => r.rawSha256),
  );
  const sha = (b) => crypto.createHash("sha256").update(b.raw).digest("hex");
  const debris = bad.filter((b) => acked.has(sha(b)));
  const tornTail = bad.find((b) => b.lineNumber === lastContentLine && !acked.has(sha(b))) || null;
  const rejects = bad.filter((b) => b !== tornTail && !acked.has(sha(b)));
  quarantine(bad);
  return { receipts, rejects, tornTail, debris };
}

function readReceipts() {
  return readReceiptsAudited().receipts;
}

function append(rec) {
  fs.mkdirSync(path.dirname(RECEIPTS), { recursive: true });
  // Append-only: a torn write loses at most the last line, never earlier receipts.
  // If the previous append died mid-write the file ends in a torn fragment with no
  // newline. Gluing a valid record onto it would corrupt that record too, so first
  // terminate the fragment — and annotate it as ACKNOWLEDGED debris, because once
  // it is no longer the tail, reads could not otherwise tell expected crash debris
  // from real history damage and would fail closed forever.
  if (fs.existsSync(RECEIPTS)) {
    const content = fs.readFileSync(RECEIPTS, "utf8");
    if (content.length && !content.endsWith("\n")) {
      const fragment = content.slice(content.lastIndexOf("\n") + 1);
      let fragmentParses = true;
      try { JSON.parse(fragment); } catch { fragmentParses = false; }
      fs.appendFileSync(RECEIPTS, "\n");
      if (!fragmentParses) {
        fs.appendFileSync(
          RECEIPTS,
          JSON.stringify({
            state: "torn_tail_acknowledged",
            rawSha256: crypto.createHash("sha256").update(fragment).digest("hex"),
            notedAt: new Date().toISOString(),
          }) + "\n",
        );
      }
    }
  }
  fs.appendFileSync(RECEIPTS, JSON.stringify(rec) + "\n");
}

/** Latest state per token, so abandon/commit supersede the original claim. */
function stateByToken(receipts) {
  const m = new Map();
  for (const r of receipts) {
    if (!r || r.token === undefined) continue; // annotation records carry no token
    m.set(r.token, { ...(m.get(r.token) || {}), ...r });
  }
  return m;
}

function claim({ target, body, now = Date.now(), acceptCorruption = false }) {
  const hash = bodyHash(body);
  const token = `${target}#${hash}`;
  const { receipts, rejects, tornTail } = readReceiptsAudited();

  if (rejects.length && !acceptCorruption) {
    return {
      ok: false,
      corrupt: true,
      token,
      reason:
        `${rejects.length} malformed receipt line(s) before the tail — history is damaged, so this ` +
        `ledger can no longer prove the body was NOT already published. Claims fail CLOSED. ` +
        `Inspect ${RECEIPTS}.rejects.jsonl (first bad line: ${rejects[0].lineNumber}); if the damaged ` +
        `records are confirmed irrelevant, re-run with --accept-corruption.`,
    };
  }

  const states = stateByToken(receipts);
  const prior = states.get(token);

  if (prior) {
    if (prior.state === "committed") {
      return {
        ok: false,
        duplicate: true,
        token,
        reason:
          `Already published to ${target} at ${prior.committedAt}` +
          (prior.url ? ` (${prior.url})` : "") +
          `. A retry here is how the 2026-07-30 triple-post happened: the first ` +
          `attempt worked and the confirmation was lost.`,
      };
    }
    if (prior.state === "claimed" && now - prior.claimedAtMs < STALE_CLAIM_MS) {
      return {
        ok: false,
        duplicate: true,
        token,
        reason:
          `An unfinished claim on this exact body opened ${Math.round((now - prior.claimedAtMs) / 1000)}s ago. ` +
          `It may have succeeded without reporting. Verify the target before retrying; ` +
          `if it truly failed, run: publish-once.js abandon --token ${token}`,
      };
    }
    // Stale or abandoned: fall through and re-claim.
  }

  append({ token, target, hash, state: "claimed", claimedAtMs: now, claimedAt: new Date(now).toISOString(), pid: process.pid });
  const granted = { ok: true, duplicate: false, token };
  if (tornTail) {
    granted.warning =
      `torn final line ${tornTail.lineNumber} quarantined (crash debris; earlier receipts intact). ` +
      `If a publish was in flight when it tore, verify the target manually.`;
  }
  return granted;
}

function commit({ token, url, now = Date.now() }) {
  const states = stateByToken(readReceipts());
  if (!states.has(token)) return { ok: false, reason: `No claim for token ${token}. Claim before committing.` };
  append({ token, state: "committed", committedAt: new Date(now).toISOString(), url: url || null });
  return { ok: true, token };
}

function abandon({ token, reason, now = Date.now() }) {
  append({ token, state: "abandoned", abandonedAt: new Date(now).toISOString(), reason: reason || null });
  return { ok: true, token };
}

function flag(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || argv.includes("--help")) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
    return 2;
  }

  if (cmd === "list") {
    const t = flag(argv, "target");
    const { receipts, rejects, tornTail } = readReceiptsAudited();
    if (rejects.length || tornTail) {
      console.error(
        `publish-once: WARNING ${rejects.length} corrupt line(s)` +
          `${tornTail ? " + torn tail" : ""} quarantined at ${RECEIPTS}.rejects.jsonl`,
      );
    }
    const rows = [...stateByToken(receipts).values()].filter((r) => !t || r.target === t);
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }

  if (cmd === "claim") {
    const target = flag(argv, "target");
    const bodyFile = flag(argv, "body-file");
    const body = bodyFile ? fs.readFileSync(bodyFile, "utf8") : flag(argv, "body");
    if (!target || !body) {
      console.error("Usage: publish-once.js claim --target <id> (--body-file <f> | --body <text>) [--accept-corruption]");
      return 2;
    }
    const r = claim({ target, body, acceptCorruption: argv.includes("--accept-corruption") });
    if (!r.ok && r.corrupt) {
      console.error(`publish-once: LEDGER CORRUPT — failing closed\n  token: ${r.token}\n  ${r.reason}`);
      return 4;
    }
    if (!r.ok) {
      console.error(`publish-once: DUPLICATE\n  token: ${r.token}\n  ${r.reason}`);
      return 3;
    }
    if (r.warning) console.error(`publish-once: WARNING ${r.warning}`);
    console.log(r.token);
    return 0;
  }

  if (cmd === "commit") {
    const token = flag(argv, "token");
    if (!token) { console.error("Usage: publish-once.js commit --token <token> [--url <permalink>]"); return 2; }
    const r = commit({ token, url: flag(argv, "url") });
    if (!r.ok) { console.error(r.reason); return 1; }
    console.error(`committed ${token}`);
    return 0;
  }

  if (cmd === "abandon") {
    const token = flag(argv, "token");
    if (!token) { console.error("Usage: publish-once.js abandon --token <token> [--reason <why>]"); return 2; }
    abandon({ token, reason: flag(argv, "reason") });
    console.error(`abandoned ${token}`);
    return 0;
  }

  console.error(`Unknown command: ${cmd}`);
  return 2;
}

if (require.main === module) process.exit(main());
module.exports = { claim, commit, abandon, bodyHash, normalise, readReceiptsAudited, STALE_CLAIM_MS, RECEIPTS };
