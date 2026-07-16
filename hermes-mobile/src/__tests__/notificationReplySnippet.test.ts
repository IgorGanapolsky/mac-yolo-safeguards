import {
  formatNotificationReplySnippet,
  isBoilerplateNotificationBody,
  NOTIFICATION_REPLY_SNIPPET_MAX,
  stripMarkdownForNotification,
} from '../utils/notificationReplySnippet';

describe('notificationReplySnippet', () => {
  it('strips markdown to plain text', () => {
    expect(
      stripMarkdownForNotification('**Bold** and _italic_ with [link](https://x.test)'),
    ).toBe('Bold and italic with link');
    expect(stripMarkdownForNotification('```ts\nconst x = 1;\n```')).toBe('const x = 1;');
    expect(stripMarkdownForNotification('![chart](https://x.test/a.png) done')).toBe('chart done');
  });

  it('treats reply-ready chrome as boilerplate', () => {
    expect(isBoilerplateNotificationBody('Reply ready on your computer')).toBe(true);
    expect(isBoilerplateNotificationBody('Task finished')).toBe(true);
    expect(isBoilerplateNotificationBody('Here is the plan for today')).toBe(false);
  });

  it('formats a ~120 char plain snippet and drops boilerplate', () => {
    expect(formatNotificationReplySnippet('Reply ready on your computer')).toBe('');
    expect(formatNotificationReplySnippet('**Ship** the OTA tonight.')).toBe('Ship the OTA tonight.');

    const long = 'Word '.repeat(80).trim();
    const snippet = formatNotificationReplySnippet(long);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(NOTIFICATION_REPLY_SNIPPET_MAX);
    expect(snippet).not.toMatch(/\*\*/);
  });

  it('prefers a word boundary near the truncate point', () => {
    const text = `${'alpha '.repeat(18)}beta-gamma-delta-epsilon`;
    const snippet = formatNotificationReplySnippet(text, 60);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.includes('alpha')).toBe(true);
  });
});
