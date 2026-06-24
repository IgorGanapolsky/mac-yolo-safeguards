import {
  buildTelegramInboxSession,
  fetchTelegramInboxMessages,
  resolveTelegramInboxReplySessionId,
  TELEGRAM_INBOX_SESSION_ID,
} from '../services/telegramInbox';
import * as hermesChatClient from '../services/hermesChatClient';

jest.mock('../services/hermesChatClient');

describe('telegramInbox', () => {
  it('builds virtual inbox session', () => {
    const session = buildTelegramInboxSession();
    expect(session.id).toBe(TELEGRAM_INBOX_SESSION_ID);
    expect(session.source).toBe('telegram');
  });

  it('merges messages across telegram sessions chronologically', async () => {
    (hermesChatClient.listMessages as jest.Mock)
      .mockResolvedValueOnce([
        { role: 'user', content: 'older', created_at: '2026-06-17T10:00:00Z' },
      ])
      .mockResolvedValueOnce([
        { role: 'assistant', content: 'newer', created_at: '2026-06-18T09:00:00Z' },
      ]);

    const result = await fetchTelegramInboxMessages(
      'http://127.0.0.1:8642',
      [
        { id: 'tg-old', source: 'telegram', last_active: 1781700000 },
        { id: 'tg-new', source: 'telegram', last_active: 1781789000 },
      ],
      'test-key',
      2,
    );

    expect(result.replySessionId).toBe('tg-new');
    expect(result.messages.map((m) => m.content)).toEqual(['older', 'newer']);
    expect(result.messages[1]?.sourceSessionId).toBe('tg-old');
  });

  it('filters tool steps so mobile matches Telegram conversation view', async () => {
    (hermesChatClient.listMessages as jest.Mock).mockResolvedValueOnce([
      { role: 'user', content: 'check tasneem', created_at: '2026-06-20T15:00:00Z' },
      { role: 'tool', content: 'read_file: /tmp/foo', created_at: '2026-06-20T15:01:00Z' },
      { role: 'assistant', content: 'Found Tasneem thread.', created_at: '2026-06-20T15:02:00Z' },
    ]);

    const result = await fetchTelegramInboxMessages(
      'http://127.0.0.1:8642',
      [{ id: 'tg-1', source: 'telegram', last_active: 1781789000 }],
      'test-key',
    );

    expect(result.messages.map((m) => m.content)).toEqual(['check tasneem', 'Found Tasneem thread.']);
    expect(result.threadCount).toBe(1);
  });

  it('infers reply session from latest message in merged inbox', async () => {
    (hermesChatClient.listMessages as jest.Mock)
      .mockResolvedValueOnce([
        { role: 'user', content: 'older thread', created_at: '2026-06-20T14:00:00Z' },
      ])
      .mockResolvedValueOnce([
        { role: 'assistant', content: 'newer thread reply', created_at: '2026-06-20T15:00:00Z' },
      ]);

    const result = await fetchTelegramInboxMessages(
      'http://127.0.0.1:8642',
      [
        { id: 'tg-old', source: 'telegram', title: 'Old', last_active: 1781700000 },
        { id: 'tg-new', source: 'telegram', title: 'New', last_active: 1781789000 },
      ],
      'test-key',
      2,
    );

    expect(result.replySessionId).toBe('tg-new');
    expect(result.messages[0]?.threadLabel).toBe('New');
  });

  it('resiliently ignores individual session fetch failures', async () => {
    (hermesChatClient.listMessages as jest.Mock)
      .mockRejectedValueOnce(new Error('session_not_found'))
      .mockResolvedValueOnce([
        { role: 'assistant', content: 'valid message', created_at: '2026-06-18T09:00:00Z' },
      ]);

    const result = await fetchTelegramInboxMessages(
      'http://127.0.0.1:8642',
      [
        { id: 'tg-fail', source: 'telegram', last_active: 1781700000 },
        { id: 'tg-success', source: 'telegram', last_active: 1781789000 },
      ],
      'test-key',
      2,
    );

    expect(result.replySessionId).toBe('tg-success');
    expect(result.messages.map((m) => m.content)).toEqual(['valid message']);
  });

  it('resolveTelegramInboxReplySessionId picks most recent telegram session', () => {
    expect(
      resolveTelegramInboxReplySessionId([
        { id: 'cli-1', source: 'cli', last_active: 999 },
        { id: 'tg-old', source: 'telegram', last_active: 100 },
        { id: 'tg-new', source: 'telegram', last_active: 200 },
      ]),
    ).toBe('tg-new');
  });
});
