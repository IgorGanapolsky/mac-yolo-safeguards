#!/usr/bin/env node
/**
 * outreach-preflight.js — refuses to draft outreach that will bounce, burn sender
 * reputation, or violate the revenue loop's own sourcing rules.
 *
 * Measured 2026-07-31, from the actual Gmail folder
 * -------------------------------------------------
 * Five hard bounces inside the same minute (13:21 UTC), every one a guessed generic
 * address: hello@factory.ai, team@galileo.ai, hello@all-hands.dev,
 * hello@llamaindex.ai, hello@crewai.com — all `550 address not found`.
 *
 * Two days earlier, the entire 2026-07-29 batch sent from igor@igorganapolsky.com
 * failed before it ever reached a recipient: "You're sending this from a different
 * address or alias using the 'Send mail as' feature. The settings for your 'Send
 * mail as' account are misconfigured or out of date." Five prospects — TeamCalendar,
 * Sondos, Layla, ChatFin, stiles.one — were recorded as "sent" and were never
 * delivered. The one reply that did arrive came only after a manual resend from the
 * Gmail address.
 *
 * A design-partner pitch also went to security@e2b.dev, which is a vulnerability
 * disclosure inbox.
 *
 * docs/REVENUE-LOOP.md already forbade all of this — "no guessed addresses" is
 * written into run 1, where seven candidates were correctly skipped for exactly this
 * reason. The rule existed and was not enforced, which is the same failure the rest
 * of this repo keeps hitting: prose does not run.
 *
 * Why bounces are expensive, not merely wasted
 * --------------------------------------------
 * Hard bounces are a primary spam signal. Five in one minute from one sender is the
 * shape of a list-scraping campaign, and mailbox providers score it that way. The
 * cost is not the five lost emails — it is the deliverability of every *good* email
 * sent afterwards, including the ones to real prospects who would have replied.
 * Sender reputation is an asset the loop spends without measuring.
 *
 * Usage:
 *   node tools/outreach-preflight.js --from igor@igorganapolsky.com --to a@b.com --subject "..." \
 *        --body-file draft.md --verified-by apollo --evidence "https://..." [--json]
 *   node tools/outreach-preflight.js --batch prospects.json
 * Default --from is igor@igorganapolsky.com (domain). Missing/unhealthy from is BLOCK.
 *
 * Exit: 0 clear to draft · 1 BLOCKED · 2 usage error
 */

const fs = require("node:fs");
const path = require("node:path");

/**
 * Role addresses. These are not people, they are queues — and the loop's unit of
 * work is "a named human, a specific message." Every bounce measured on 2026-07-31
 * was one of these.
 */
const ROLE_LOCALPARTS = new Set([
  "hello", "info", "team", "support", "sales", "contact", "admin", "help",
  "partnerships", "press", "marketing", "careers", "jobs", "billing", "no-reply",
  "noreply", "founders", "hi", "ask", "inbound",
]);

/**
 * Security and abuse inboxes. Sending BD here is worse than a bounce: it is read by
 * people whose job is triaging hostile mail, and it gets the sender remembered.
 */
const NEVER_CONTACT = new Set(["security", "abuse", "legal", "privacy", "dmca", "compliance", "soc"]);

/** Domains already known to reject mail. Never re-send; repeat bounces compound. */
const KNOWN_BOUNCED = new Set([
  "hello@factory.ai", "team@galileo.ai", "hello@all-hands.dev",
  "hello@llamaindex.ai", "hello@crewai.com", "hello@crewai.com",
  "hello@sourcegraph.com", "partnerships@sourcegraph.com",
]);

/** Fake-familiarity openers, which read as spam when no prior thread exists. */
const FALSE_CONTINUITY = /\b(following up|checking in|circling back|as discussed|per my last|still burning|quick follow-?up)\b/i;

function localpart(addr) {
  return String(addr).toLowerCase().split("@")[0].trim();
}

/**
 * Sender health, recorded by a live probe rather than assumed.
 *
 * On 2026-07-29 five prospects were recorded as "sent" from igor@igorganapolsky.com and not
 * one was delivered — every message bounced on a send-as relay misconfiguration. The ledger
 * said sent; the recipients never existed as far as the mail system was concerned. A probe on
 * 2026-07-31T15:20:11Z bounced again 4 seconds later, making it 7/7.
 *
 * The alias is NOT the problem — Gmail's send-as enum returns it. The SMTP relay behind it is.
 * That distinction matters because "the alias is configured" reads like proof and isn't.
 *
 * A campaign sent from a broken sender is worse than no campaign: it consumes the prospect
 * (you only get one first email) while producing no delivery. So the sender is treated as a
 * resource with a health state, and drafting against an unhealthy one is refused.
 */
const SENDER_HEALTH = path.join(__dirname, "..", "coordination", "sender-health.json");

function senderHealth(from) {
  if (!from) return null;
  try {
    const all = JSON.parse(fs.readFileSync(SENDER_HEALTH, "utf8"));
    return all[from.toLowerCase()] || null;
  } catch {
    return null;
  }
}

function check({ to = [], subject = "", body = "", evidence = null, priorThread = false, verifiedBy = null, from = null }) {
  const blocks = [];
  const warnings = [];
  const recipients = Array.isArray(to) ? to : [to];

  if (from) {
    const h = senderHealth(from);
    if (!h) {
      warnings.push(`No probe record for sender ${from}. Run a send-as probe before a campaign.`);
    } else if (h.status !== "ok") {
      blocks.push(
        `Sender ${from} is UNHEALTHY (last probe ${h.lastProbe}: ${h.status}). ${h.detail || ""} ` +
          `Drafting against a broken sender consumes the prospect and delivers nothing — five ` +
          `were burned that way on 2026-07-29. Fix the sender, re-probe, then draft.`,
      );
    }
  }

  if (recipients.length === 0) blocks.push("No recipient.");

  // One message, one human. Batched To: lines are the shape of a blast, and every
  // recipient can see the others.
  if (recipients.length > 1) {
    blocks.push(
      `${recipients.length} recipients on one message. The loop's unit is a named human. ` +
        `Batched sends were how 2026-07-31 put four unrelated founders on one To: line — ` +
        `visible to each other, and unpersonalisable by construction.`,
    );
  }

  for (const addr of recipients) {
    const lp = localpart(addr);
    const lower = String(addr).toLowerCase().trim();

    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(lower)) {
      blocks.push(`"${addr}" is not a valid address.`);
      continue;
    }
    if (NEVER_CONTACT.has(lp)) {
      blocks.push(
        `${addr} is a ${lp}@ inbox — a disclosure/abuse queue, not a BD channel. ` +
          `A pitch went to security@e2b.dev on 2026-07-31.`,
      );
    }
    if (ROLE_LOCALPARTS.has(lp)) {
      blocks.push(
        `${addr} is a role address, not a person. All five hard bounces on 2026-07-31 ` +
          `were guessed role addresses. REVENUE-LOOP.md run 1 already required skipping these.`,
      );
    }
    if (KNOWN_BOUNCED.has(lower)) {
      blocks.push(`${addr} has already hard-bounced. Re-sending compounds the spam signal.`);
    }
  }

  // Provenance: who says this address is real?
  if (!verifiedBy) {
    blocks.push(
      "No --verified-by. State the source of the address (apollo | self-disclosed | public-profile | " +
        "prior-thread). REVENUE-LOOP.md run 1 skipped seven otherwise-good candidates for exactly this.",
    );
  }

  // Personalisation: the message must reference something specific and checkable.
  if (!evidence) {
    warnings.push(
      "No --evidence URL. Without a specific public artifact (their issue, post, or incident) " +
        "the message is a template, and templates are what produced 0 replies across ~20 sends.",
    );
  }

  if (FALSE_CONTINUITY.test(subject + " " + body) && !priorThread) {
    blocks.push(
      `Message implies an existing conversation ("${(subject + " " + body).match(FALSE_CONTINUITY)[0]}") ` +
        `but --prior-thread was not set. "Still burning on..." to someone who never replied is ` +
        `fake familiarity; it reads as spam and it is how the 2026-07-31 batch was written.`,
    );
  }

  const links = (body.match(/https?:\/\/\S+/g) || []).length;
  if (links > 1) {
    warnings.push(`${links} links in a first-touch email. One link converts better and looks less like bulk mail.`);
  }
  if (/buy\.stripe\.com/.test(body) && !priorThread) {
    blocks.push("Stripe checkout link in a first-touch email. Ask for a conversation before asking for a card.");
  }

  const words = body.trim().split(/\s+/).filter(Boolean).length;
  if (words > 200) warnings.push(`${words} words. First emails over ~200 get skimmed and deleted.`);

  return { ok: blocks.length === 0, recipients: recipients.length, blocks, warnings };
}

function flag(argv, name, dflt) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help")) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
    return 2;
  }

  // Default sender is the domain alias — the path that burned five prospects while
  // looking "configured". Always validate health; never silently skip.
  const DEFAULT_FROM = "igor@igorganapolsky.com";

  if (flag(argv, "batch")) {
    const batchPath = flag(argv, "batch");
    if (!batchPath || !fs.existsSync(batchPath)) {
      console.error(`outreach-preflight: --batch file missing: ${batchPath || "(none)"}`);
      return 2;
    }
    let rows;
    try {
      rows = JSON.parse(fs.readFileSync(batchPath, "utf8"));
    } catch (e) {
      console.error(`outreach-preflight: --batch not valid JSON: ${e.message}`);
      return 2;
    }
    if (!Array.isArray(rows)) {
      console.error("outreach-preflight: --batch must be a JSON array of message objects");
      return 2;
    }
    let anyBlocked = false;
    const results = [];
    for (const [i, row] of rows.entries()) {
      const r = check({
        to: row.to || row.email || [],
        subject: row.subject || "",
        body: row.body || "",
        evidence: row.evidence || null,
        verifiedBy: row.verifiedBy || row.verified_by || null,
        from: row.from || flag(argv, "from") || DEFAULT_FROM,
        priorThread: Boolean(row.priorThread || row.prior_thread),
      });
      results.push({ index: i, ...r });
      if (!r.ok) anyBlocked = true;
      if (!argv.includes("--json")) {
        console.log(`[${i}] ${r.ok ? "CLEAR" : "BLOCKED"} ${(Array.isArray(row.to) ? row.to[0] : row.to || row.email || "?")}`);
        for (const b of r.blocks) console.log(`  BLOCK: ${b}`);
      }
    }
    if (argv.includes("--json")) console.log(JSON.stringify(results, null, 2));
    else console.log(`outreach-preflight batch: ${anyBlocked ? "BLOCKED" : "CLEAR"} (${results.length} rows)`);
    return anyBlocked ? 1 : 0;
  }

  const bodyFile = flag(argv, "body-file");
  const body = bodyFile && fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, "utf8") : flag(argv, "body", "");
  const from = flag(argv, "from") || DEFAULT_FROM;

  const result = check({
    to: (flag(argv, "to", "") || "").split(",").map((s) => s.trim()).filter(Boolean),
    subject: flag(argv, "subject", ""),
    body,
    evidence: flag(argv, "evidence"),
    verifiedBy: flag(argv, "verified-by"),
    from,
    priorThread: argv.includes("--prior-thread"),
  });

  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`outreach-preflight: ${result.ok ? "CLEAR TO DRAFT" : "BLOCKED"} (from ${from})`);
    for (const b of result.blocks) console.log(`  BLOCK: ${b}`);
    for (const w of result.warnings) console.log(`  note:  ${w}`);
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());
module.exports = { check, ROLE_LOCALPARTS, NEVER_CONTACT, KNOWN_BOUNCED };
