#!/usr/bin/env node
'use strict';

/**
 * buyer-reply-packet.js — Paste-ready buyer replies (no send).
 *
 * High-ROI: when a prospect replies to a Diagnostic follow-up, print the right
 * objection/engagement packet with optional live Stripe link (curl-checked).
 *
 * Usage:
 *   node tools/buyer-reply-packet.js --kind engaged --name Ann
 *   node tools/buyer-reply-packet.js --kind langsmith --link https://buy.stripe.com/...
 *   node tools/buyer-reply-packet.js --kind hosting --name Jake --offer diagnostic
 *   node tools/buyer-reply-packet.js --list
 *   node tools/buyer-reply-packet.js --json --kind engaged
 */

const https = require('https');
const http = require('http');
const {
  buildBuyerReplyPacket,
  OFFER_LADDER,
  ladderMarkdown,
  WEDGES,
} = require('./governed-agent-sales-copy');

const usage = `Usage:
  node tools/buyer-reply-packet.js --kind <engaged|langsmith|hosting|gateway|not_now> [options]

Options:
  --name NAME       First or full name for greeting
  --link URL        Live buy.stripe.com URL (verified with HEAD/GET unless --no-verify)
  --offer LABEL     Offer label override
  --no-verify       Skip HTTP check on --link
  --list            Print offer ladder + kinds
  --json            Machine-readable packet
  --help
`;

function parseArgs(argv) {
  const out = {
    kind: 'engaged',
    name: '',
    link: '',
    offer: '',
    verify: true,
    list: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--list') out.list = true;
    else if (a === '--json') out.json = true;
    else if (a === '--no-verify') out.verify = false;
    else if (a === '--kind') out.kind = argv[++i] || out.kind;
    else if (a === '--name') out.name = argv[++i] || '';
    else if (a === '--link') out.link = argv[++i] || '';
    else if (a === '--offer') out.offer = argv[++i] || '';
  }
  return out;
}

function httpStatus(url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.request(
        url,
        { method: 'GET', timeout: timeoutMs },
        (res) => {
          res.resume();
          resolve(res.statusCode || 0);
        },
      );
      req.on('error', () => resolve(0));
      req.on('timeout', () => {
        req.destroy();
        resolve(0);
      });
      req.end();
    } catch {
      resolve(0);
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage}\n`);
    process.exit(0);
  }
  if (args.list) {
    process.stdout.write(
      [
        '# Offer ladder',
        ladderMarkdown(),
        '',
        '# Reply kinds',
        '- engaged',
        '- langsmith (also: objection_langsmith)',
        '- hosting',
        '- gateway',
        '- not_now',
        '',
        '# Wedge keys',
        ...Object.keys(WEDGES).map((k) => `- ${k}`),
        '',
        '# Offers',
        ...OFFER_LADDER.map((o) => `- ${o.key}: ${o.label}`),
        '',
      ].join('\n'),
    );
    process.exit(0);
  }

  let link = args.link;
  let linkHttp = null;
  if (link && args.verify) {
    linkHttp = await httpStatus(link);
    if (linkHttp !== 200) {
      process.stderr.write(
        `WARN: link HTTP ${linkHttp} — omitting broken pay link from packet (use --no-verify to force).\n`,
      );
      link = '';
    }
  }

  const offer =
    args.offer ||
    (args.kind === 'hosting' ? OFFER_LADDER[0].label : OFFER_LADDER[0].label);

  const packet = buildBuyerReplyPacket({
    kind: args.kind,
    name: args.name,
    link,
    offer,
  });

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({ ...packet, linkHttp, offerLadder: OFFER_LADDER }, null, 2)}\n`,
    );
  } else {
    process.stdout.write(`Subject: ${packet.subject}\n\n${packet.body}`);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
