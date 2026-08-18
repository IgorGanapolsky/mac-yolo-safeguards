/**
 * tools/executive_partner_outreach.js
 *
 * Standardized Executive Partner Outreach Engine.
 * Enforces mandatory 'igor@igorganapolsky.com' sender identity,
 * dispatches via macOS Mail.app / Resend API, and writes receipts.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MANDATORY_SENDER = 'igor@igorganapolsky.com';

class ExecutiveOutreachEngine {
  constructor(options = {}) {
    this.sender = MANDATORY_SENDER;
    this.receiptsDir = options.receiptsDir || path.resolve(__dirname, '..', 'coordination', 'outreach');
    if (!fs.existsSync(this.receiptsDir)) {
      fs.mkdirSync(this.receiptsDir, { recursive: true });
    }
  }

  /**
   * Formats and validates an executive outreach message payload.
   */
  composeMessage(recipient, subject, bodyContent) {
    if (!recipient || !subject || !bodyContent) {
      throw new Error('Recipient, subject, and bodyContent are mandatory.');
    }

    return {
      sender: this.sender,
      recipient,
      subject,
      content: bodyContent
    };
  }

  /**
   * Dispatches the message via macOS Mail.app AppleScript bridge.
   */
  dispatchViaMailApp(message) {
    const appleScript = `
tell application "Mail"
  set newMsg to make new outgoing message with properties {subject:"${message.subject.replace(/"/g, '\\"')}", content:"${message.content.replace(/"/g, '\\"').replace(/\n/g, '\\n')}", visible:false}
  tell newMsg
    set sender to "${this.sender}"
    make new to recipient at end of to recipients with properties {address:"${message.recipient}"}
    send
  end tell
end tell
`;

    try {
      execFileSync('osascript', ['-e', appleScript], { encoding: 'utf8' });
      
      const receipt = {
        timestamp: new Date().toISOString(),
        channel: 'macOS Mail.app',
        sender: this.sender,
        recipient: message.recipient,
        subject: message.subject,
        status: 'SENT_SUCCESSFULLY'
      };

      const filename = `receipt-${Date.now()}-${message.recipient.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      fs.writeFileSync(path.join(this.receiptsDir, filename), JSON.stringify(receipt, null, 2), 'utf8');

      return receipt;
    } catch (err) {
      throw new Error(`Failed to dispatch via macOS Mail.app: ${err.message}`);
    }
  }
}

module.exports = { ExecutiveOutreachEngine, MANDATORY_SENDER };

if (require.main === module) {
  const engine = new ExecutiveOutreachEngine();
  console.log(`Executive Outreach Engine initialized. Mandatory Sender: ${engine.sender}`);
}
