/** Safe App Store Connect reviewer notes — never embed real gateway URLs or API keys. */
const HERMES_IOS_SUPPORT_EMAIL = 'igor.ganapolsky@icloud.com';

const ASC_SAFE_REVIEW_NOTES = `Hermes Mobile requires a user-operated Hermes gateway on a Mac. For App Review:

Demo mode (no Mac credentials needed):
1. On the review device, open: hermes://setup?demo=1
   (Paste in Notes or Safari if the link does not open directly.)
2. Return to Hermes Mobile — demo mode enables sample chat and approval flows.
3. In Chat, send any message and tap Approve or Deny on approval prompts.
4. Open the Leash tab to preview subscription gate rules UI.

Camera: QR pairing only during setup; no photo storage.

IAP: Leash Pro (thumbgate_leash_monthly) unlocks always-on remote access. Free tier includes chat, approvals, and guardrails.

Live gateway testing: Contact ${HERMES_IOS_SUPPORT_EMAIL} for time-limited review credentials.`;

module.exports = { ASC_SAFE_REVIEW_NOTES, HERMES_IOS_SUPPORT_EMAIL };
