#!/usr/bin/env node
/**
 * domain-sendas-probe.js — live check whether igor@igorganapolsky.com can deliver.
 *
 * Why: alias verificationStatus=accepted is NOT delivery proof. On 2026-07-29..31
 * every sendAs attempt bounced in ~2–4s on PrivateEmail SMTP auth (535). The ledger
 * recorded "sent" while recipients never received mail.
 *
 * This tool does NOT send (no credentials for SMTP repair). It records the last
 * known probe into coordination/sender-health.json from evidence you pass, or
 * prints the exact Gmail Settings steps + the API sendAs shape.
 *
 * Usage:
 *   node tools/domain-sendas-probe.js --status
 *   node tools/domain-sendas-probe.js --record-fail --msg-id ID --dsn-id ID --at ISO
 *   node tools/domain-sendas-probe.js --record-ok --msg-id ID --at ISO
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HEALTH = path.join(ROOT, 'coordination', 'sender-health.json');
const DOMAIN = 'igor@igorganapolsky.com';
const GMAIL = 'iganapolsky@gmail.com';

function load() {
  try { return JSON.parse(fs.readFileSync(HEALTH, 'utf8')); }
  catch { return {}; }
}

function save(data) {
  fs.mkdirSync(path.dirname(HEALTH), { recursive: true });
  fs.writeFileSync(HEALTH, JSON.stringify(data, null, 2) + '\n');
}

function flag(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.length === 0) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace('/**\n *', '').trim());
    return 0;
  }

  if (argv.includes('--status')) {
    const h = load();
    console.log(JSON.stringify({
      path: HEALTH,
      domain: h[DOMAIN] || null,
      gmail: h[GMAIL] || null,
      smtpFix: {
        ui: 'Gmail → Settings → Accounts → Send mail as → edit igor@igorganapolsky.com',
        host: 'mail.privateemail.com',
        port: '587 starttls or 465 ssl',
        username: DOMAIN,
        note: 'Password is never returned by Gmail API; must re-enter PrivateEmail mailbox password.',
      },
    }, null, 2));
    return 0;
  }

  const at = flag(argv, 'at') || new Date().toISOString();
  const msg = flag(argv, 'msg-id') || '';
  const dsn = flag(argv, 'dsn-id') || '';
  const h = load();

  if (argv.includes('--record-fail')) {
    h[DOMAIN] = {
      status: 'unhealthy',
      lastProbe: at,
      detail: `LIVE fail msg ${msg}${dsn ? ` DSN ${dsn}` : ''}: Send mail as / PrivateEmail SMTP misconfigured. Alias accepted ≠ delivery.`,
    };
    save(h);
    console.log(JSON.stringify({ ok: false, wrote: HEALTH, entry: h[DOMAIN] }, null, 2));
    return 1;
  }

  if (argv.includes('--record-ok')) {
    h[DOMAIN] = {
      status: 'ok',
      lastProbe: at,
      detail: `LIVE ok msg ${msg}: domain send-as delivered without DSN.`,
    };
    save(h);
    console.log(JSON.stringify({ ok: true, wrote: HEALTH, entry: h[DOMAIN] }, null, 2));
    return 0;
  }

  console.error('Unknown args. Use --status | --record-fail | --record-ok');
  return 2;
}

process.exit(main() || 0);
