#!/usr/bin/env node
'use strict';

/**
 * send-roland-berger-outreach.js — Dispatches the executive partnership proposal to Roland Berger AI & Transformation Leadership
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getResendKey() {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  try {
    const out = spawnSync('security', ['find-generic-password', '-s', 'RESEND_API_KEY', '-w'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    if (out.status === 0 && out.stdout.trim()) {
      return out.stdout.trim();
    }
  } catch (_) {}
  return null;
}

async function main() {
  const apiKey = getResendKey();
  if (!apiKey) {
    console.error('❌ Error: RESEND_API_KEY not found in Keychain or environment.');
    process.exit(1);
  }

  const recipient = process.env.OUTREACH_TARGET_EMAIL || 'info@rolandberger.com';
  const subject = 'Partnership Proposal: Turnkey ISO/IEC 42001 Pre-Action Governance Mesh for Roland Berger act.AI Suite';
  
  const textBody = `To: Roland Berger Global AI & Transformation Leadership Practice

Subject: Unlocking act.AI Scale: Turnkey ISO/IEC 42001 Pre-Action Governance Mesh for Enterprise Transformations

Dear Roland Berger AI Practice Leaders,

Roland Berger’s 2026 research highlights the core bottleneck in enterprise AI scaling: 74% of corporate AI transformations stall in the "Pilot Trap" due to governance, risk mitigation, and compliance friction.

While Roland Berger provides world-class AI-First operating models and zero-based workflow architecture via the act.AI Suite, Fortune 500 Risk Committees and CIOs need a deterministic software runtime to guarantee that autonomous agents cannot execute unauthorized financial transactions, leak credentials, or cause destructive outages.

ThumbGate.app (https://thumbgate.app) is that pre-action governance layer:
1. Sub-second financial spending caps ($0–$1,000/action) stopping unapproved mutations.
2. ISO/IEC 42001 & AIMS compliant pre-action gates with full cryptographic provenance.
3. Isolated 24/7 cloud sandboxes allowing zero-based agent execution without laptop dependencies.
4. Recurring software revenue attachment ($2,500–$10,000/mo/client node with 30% advisory rev-share).

We would welcome a 15-minute conversation with your practice leads to demonstrate how ThumbGate integrates into act.AI client engagements to de-risk enterprise deployments.

Are you open to a brief discussion next week?

Best regards,

Igor Ganapolsky
Founder, ThumbGate.app & Mac-YOLO Safeguards
iganapolsky@gmail.com | https://linkedin.com/in/igorganapolsky
`;

  const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1e293b; max-width: 600px;">
  <p><strong>To:</strong> Roland Berger Global AI &amp; Transformation Leadership Practice</p>
  
  <h2 style="color: #0f172a; font-size: 18px; margin-bottom: 12px;">Unlocking act.AI Scale: Turnkey ISO/IEC 42001 Pre-Action Governance Mesh for Enterprise Transformations</h2>

  <p>Dear Roland Berger AI Practice Leaders,</p>

  <p>Roland Berger’s 2026 research highlights the core bottleneck in enterprise AI scaling: <strong>74% of corporate AI transformations stall in the "Pilot Trap"</strong> due to governance, risk mitigation, and compliance friction.</p>

  <p>While Roland Berger provides world-class AI-First operating models and zero-based workflow architecture via the <strong>act.AI Suite</strong>, Fortune 500 Risk Committees and CIOs need a <strong>deterministic software runtime</strong> to guarantee that autonomous agents cannot execute unauthorized financial transactions, leak credentials, or cause destructive outages.</p>

  <p><strong><a href="https://thumbgate.app" style="color: #2563eb; text-decoration: underline;">ThumbGate.app</a></strong> provides that pre-action governance layer:</p>

  <ul style="padding-left: 20px;">
    <li style="margin-bottom: 8px;"><strong>Sub-second financial spending caps</strong> ($0–$1,000/action) stopping unapproved mutations before execution.</li>
    <li style="margin-bottom: 8px;"><strong>ISO/IEC 42001 &amp; AIMS compliant pre-action gates</strong> with cryptographic audit provenance.</li>
    <li style="margin-bottom: 8px;"><strong>Isolated 24/7 cloud sandboxes</strong> allowing zero-based agent execution without laptop dependencies.</li>
    <li style="margin-bottom: 8px;"><strong>Recurring software revenue attachment</strong> ($2,500–$10,000/mo/client node with 30% advisory rev-share).</li>
  </ul>

  <p>We would welcome a 15-minute conversation with your practice leads to demonstrate how ThumbGate integrates into act.AI client engagements to de-risk enterprise deployments.</p>

  <p>Are you open to a brief discussion next week?</p>

  <p style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
    <strong>Igor Ganapolsky</strong><br>
    Founder, ThumbGate.app &bull; Mac-YOLO Safeguards<br>
    <a href="mailto:iganapolsky@gmail.com" style="color: #64748b;">iganapolsky@gmail.com</a> &bull; <a href="https://linkedin.com/in/igorganapolsky" style="color: #2563eb;">LinkedIn</a>
  </p>
</div>
  `;

  console.log(`📤 Sending partnership proposal email via Resend API to: ${recipient}...`);

  let sendPayload = {
    from: "Igor Ganapolsky <onboarding@resend.dev>",
    to: [recipient],
    reply_to: "iganapolsky@gmail.com",
    subject: subject,
    text: textBody,
    html: htmlBody,
  };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sendPayload),
    });

    const result = await response.json();
    console.log('📬 Resend API Response:', result);

    const receipt = {
      timestamp: new Date().toISOString(),
      recipient,
      subject,
      deliveryResult: result,
      status: result.id ? 'SENT_SUCCESSFULLY' : (result.statusCode ? `FAILED_STATUS_${result.statusCode}` : 'FLAGGED'),
    };

    const outDir = path.resolve(__dirname, '..', 'coordination', 'outreach');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const receiptPath = path.join(outDir, 'roland-berger-pitch-receipt.json');
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), 'utf8');
    console.log(`✅ Outreach receipt persisted to: ${receiptPath}`);

    return receipt;
  } catch (err) {
    console.error('❌ Failed to dispatch email:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
