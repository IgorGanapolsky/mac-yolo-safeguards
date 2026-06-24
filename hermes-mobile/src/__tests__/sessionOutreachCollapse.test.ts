import fs from 'fs';
import path from 'path';
import { prepareMessagesForDisplay } from '../utils/chatMessageDisplay';
import type { HermesMessage } from '../types/chat';
import { prepareMessageForChatDisplay } from '../utils/chatMessageDisplay';
import { coerceMessageId } from '../utils/messageIds';

describe('session 20260623_004925 outreach collapse', () => {
  it('collapses 13 skool warm drafts from gateway transcript', () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'session-20260623-004925-messages.json');
    if (!fs.existsSync(fixturePath)) {
      // Generated during device investigation — skip in CI if absent.
      return;
    }
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as { data: HermesMessage[] };
    const history = raw.data.map((message, index) => {
      const rawText = String(message.content ?? '');
      const display = prepareMessageForChatDisplay(rawText);
      return {
        ...message,
        id: coerceMessageId(message.id, index),
        gatewayContent: rawText,
        content: display.content,
        rawContent: display.rawContent,
        truncated: display.truncated,
      };
    });
    const visible = prepareMessagesForDisplay(history, { includeToolActivity: true });
    const outreach = visible.filter((m) => String(m.content).includes('outreach drafts'));
    expect(outreach.length).toBe(1);
    expect(outreach[0]?.content).toContain('13 Skool Warm outreach drafts');
  });
});
