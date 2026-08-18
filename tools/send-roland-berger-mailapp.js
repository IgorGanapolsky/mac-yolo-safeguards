#!/usr/bin/env node
'use strict';

/**
 * send-roland-berger-mailapp.js — Direct macOS Mail.app Partner Pitch Dispatcher
 * ----------------------------------------------------------------------------
 * Composes and sends the Roland Berger partnership proposal directly through
 * macOS Mail.app using Igor's authenticated mail account to info@rolandberger.com.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function sendRolandBergerPitch() {
  const recipient = 'info@rolandberger.com';
  const sender = 'igor@igorganapolsky.com';
  const subject = 'Partnership Proposal: Turnkey ISO/IEC 42001 Pre-Action Governance Mesh for Roland Berger act.AI Suite';

  const content = `To: Roland Berger Global AI & Transformation Leadership Practice

Subject: Unlocking act.AI Scale: Turnkey ISO/IEC 42001 Pre-Action Governance Mesh for Enterprise Transformations

Dear Roland Berger AI Practice Leaders,

Roland Berger’s 2026 research highlights the core bottleneck in enterprise AI scaling: 74% of corporate AI transformations stall in the "Pilot Trap" due to governance, risk mitigation, and compliance friction.

While Roland Berger provides world-class AI-First operating models and zero-based workflow architecture via the act.AI Suite, Fortune 500 Risk Committees and CIOs need a deterministic software runtime to guarantee that autonomous agents cannot execute unauthorized financial transactions, leak credentials, or cause destructive outages.

ThumbGate.app (https://thumbgate.app) provides that pre-action governance layer:
1. Sub-second financial spending caps ($0–$1,000/action) stopping unapproved mutations before execution.
2. ISO/IEC 42001 & AIMS compliant pre-action gates with cryptographic audit provenance.
3. Isolated 24/7 cloud sandboxes allowing zero-based agent execution without laptop dependencies.
4. Recurring software revenue attachment ($2,500–$10,000/mo/client node with 30% advisory rev-share).

We would welcome a 15-minute conversation with your practice leads to demonstrate how ThumbGate integrates into act.AI client engagements to de-risk enterprise deployments.

Are you open to a brief discussion next week?

Best regards,

Igor Ganapolsky
Founder, ThumbGate.app & Mac-YOLO Safeguards
igor@igorganapolsky.com | https://linkedin.com/in/igorganapolsky
`;

  // AppleScript to create and send message
  const appleScript = `
tell application "Mail"
  set newMsg to make new outgoing message with properties {subject:"${subject.replace(/"/g, '\\"')}", content:"${content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}", visible:false}
  tell newMsg
    make new to recipient at end of to recipients with properties {address:"${recipient}"}
    send
  end tell
end tell
`;

  console.log(`📤 Sending message via macOS Mail.app to ${recipient}...`);
  const out = execFileSync('osascript', ['-e', appleScript], { encoding: 'utf8' });
  console.log('✅ AppleScript executed successfully.');

  const receipt = {
    timestamp: new Date().toISOString(),
    channel: 'macOS Mail.app',
    recipient,
    sender,
    subject,
    status: 'SENT_SUCCESSFULLY'
  };

  const outDir = path.resolve(__dirname, '..', 'coordination', 'outreach');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const receiptPath = path.join(outDir, 'roland-berger-mailapp-receipt.json');
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), 'utf8');
  console.log(`✅ Outreach receipt persisted to: ${receiptPath}`);

  return receipt;
}

if (require.main === module) {
  try {
    const res = sendRolandBergerPitch();
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Error sending via Mail.app:', err.message);
    process.exit(1);
  }
}

module.exports = { sendRolandBergerPitch };
