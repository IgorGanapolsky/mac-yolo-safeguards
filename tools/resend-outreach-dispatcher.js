#!/usr/bin/env node
'use strict';

/**
 * resend-outreach-dispatcher.js — Automated B2B Email Outreach Dispatcher
 * -----------------------------------------------------------------------
 * Connects directly to the Resend API using macOS Keychain credentials
 * to dispatch high-propensity $3,000 Partner Pilot pitches to agency leads.
 *
 * Usage:
 *   node tools/resend-outreach-dispatcher.js --doctor
 *   node tools/resend-outreach-dispatcher.js --dry-run
 *   node tools/resend-outreach-dispatcher.js --send
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const HOME = os.homedir();
const OUTREACH_FILE = path.join(HOME, '.hermes', 'revenue', 'outreach_batch.json');
const DISPATCH_LOG_FILE = path.join(HOME, '.hermes', 'revenue', 'dispatch_log.json');

function getResendApiKey() {
  try {
    return execSync('security find-generic-password -s "RESEND_API_KEY" -w', { encoding: 'utf8' }).trim();
  } catch {
    return process.env.RESEND_API_KEY || '';
  }
}

/**
 * Loads pending outreach packets.
 * @returns {Array<object>}
 */
function loadOutreachPackets() {
  if (!fs.existsSync(OUTREACH_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(OUTREACH_FILE, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Dispatches an email via Resend API.
 */
async function sendEmailViaResend(apiKey, { to, subject, textBody, from = 'Igor Ganapolsky <igor@igorganapolsky.com>' }) {
  const url = 'https://api.resend.com/emails';
  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    text: textBody,
    reply_to: 'iganapolsky@gmail.com',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(`Resend API Error (${response.status}): ${json.message || JSON.stringify(json)}`);
  }
  return json;
}

function runDoctor() {
  const key = getResendApiKey();
  const packets = loadOutreachPackets();
  return {
    engine: 'resend-outreach-dispatcher',
    status: key ? 'READY' : 'KEYCHAIN_KEY_MISSING',
    hasApiKey: Boolean(key),
    pendingPacketsCount: packets.length,
    totalPipelineUsd: packets.reduce((sum, p) => sum + (p.valueUsd || 0), 0),
    outreachFile: OUTREACH_FILE,
  };
}

// CLI
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);

    if (args.includes('--doctor') || args.includes('-d')) {
      const doc = runDoctor();
      console.log(`[resend-dispatcher] Status: ${doc.status}`);
      console.log(`[resend-dispatcher] API Key Present: ${doc.hasApiKey ? 'YES (Keychain)' : 'NO'}`);
      console.log(`[resend-dispatcher] Pending Packets: ${doc.pendingPacketsCount} ($${doc.totalPipelineUsd} pipeline)`);
      process.exit(doc.hasApiKey ? 0 : 1);
    }

    if (args.includes('--dry-run')) {
      const packets = loadOutreachPackets();
      console.log(`\n=== Dry Run: ${packets.length} Packets Ready for Dispatch ===`);
      packets.forEach((p, idx) => {
        console.log(`[${idx + 1}] To: ${p.company} (${p.contactRole})`);
        console.log(`    Subject: ${p.subject}`);
        console.log(`    Offer: ${p.offer} ($${p.valueUsd})`);
      });
      process.exit(0);
    }

    console.log('Usage: resend-outreach-dispatcher [--doctor] [--dry-run] [--send]');
  })();
}

module.exports = {
  getResendApiKey,
  loadOutreachPackets,
  sendEmailViaResend,
  runDoctor,
};
