import {
  isReplyReadyDetail,
  normalizeReplySnippet,
  runCompletedNotificationBody,
  runProgressNotificationBody,
  runProgressNotificationTitleFromState,
  stripElapsedFromStatus,
} from '../utils/runNotificationCopy';

describe('runNotificationCopy', () => {
  it('strips elapsed prefixes like "3 min —"', () => {
    expect(stripElapsedFromStatus('3 min — Reply ready on your computer')).toBe(
      'Reply ready on your computer',
    );
    expect(stripElapsedFromStatus('⌛ Working — 2 min — thinking')).toBe('thinking');
    expect(stripElapsedFromStatus('45s — compiling')).toBe('compiling');
  });

  it('does not put elapsed time first in progress bodies', () => {
    const body = runProgressNotificationBody({
      phase: 'working',
      detail: '3 min — Reply ready on your computer',
    });
    expect(body.toLowerCase()).not.toMatch(/^\d+\s*min/);
    expect(body).not.toContain('3 min');
    expect(body.toLowerCase()).toContain('reply ready');
  });

  it('prefers reply snippet over status noise', () => {
    expect(
      runProgressNotificationBody({
        phase: 'completed',
        detail: 'Reply ready on your computer',
        replySnippet: 'Revenue loop loaded. Three prospects ready to send.',
      }),
    ).toBe('Revenue loop loaded. Three prospects ready to send.');
  });

  it('titles completion with snippet as Hermes replied', () => {
    expect(
      runProgressNotificationTitleFromState({
        phase: 'completed',
        detail: 'Reply ready on your computer',
        replySnippet: 'Here is what I found.',
      }),
    ).toBe('ThumbGate replied');
  });

  it('completed body uses reply snippet when provided', () => {
    expect(
      runCompletedNotificationBody('Reply ready on your computer', {
        success: true,
        replySnippet: 'PONG',
      }),
    ).toBe('PONG');
  });

  it('normalizes whitespace in snippets', () => {
    expect(normalizeReplySnippet('  Hello\n\n  world  ')).toBe('Hello world');
  });

  it('detects reply-ready status phrases', () => {
    expect(isReplyReadyDetail('Reply ready on your computer')).toBe(true);
    expect(isReplyReadyDetail('compiling project')).toBe(false);
  });
});
