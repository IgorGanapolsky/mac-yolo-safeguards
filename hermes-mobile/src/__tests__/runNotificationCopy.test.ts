import {
  isReplyReadyDetail,
  normalizeReplySnippet,
  runCompletedNotificationBody,
  runProgressNotificationBody,
  runProgressNotificationTitleFromState,
  stripElapsedFromStatus,
  uberStyleRunNotificationFormatter,
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
    ).toBe('Hermes replied');
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

  describe('uberStyleRunNotificationFormatter', () => {
    it('formats connecting state', () => {
      const result = uberStyleRunNotificationFormatter({
        phase: 'connecting',
        computerName: 'Igor Mac Pro',
      });
      expect(result.title).toBe('🏎️ Dispatching to computer…');
      expect(result.subtitle).toBe('📍 Igor Mac Pro • Establishing link');
    });

    it('formats streaming/responding state with step counter', () => {
      const result = uberStyleRunNotificationFormatter({
        phase: 'streaming',
        stepIndex: 2,
        totalSteps: 4,
        replySnippet: 'Fixing AST parser module...',
        computerName: 'Mac Pro',
      });
      expect(result.title).toBe('⚡ Hermes Responding (2/4)');
      expect(result.subtitle).toBe('📍 Mac Pro • Live stream');
      expect(result.body).toBe('Fixing AST parser module...');
    });

    it('formats approval security gate state', () => {
      const result = uberStyleRunNotificationFormatter({
        phase: 'approval',
        computerName: 'Mac Mini',
      });
      expect(result.title).toBe('🛡️ Action Requires Approval');
      expect(result.subtitle).toBe('📍 Mac Mini • Security Gate');
    });

    it('formats completion state', () => {
      const result = uberStyleRunNotificationFormatter({
        phase: 'completed',
        replySnippet: 'PR merged successfully',
      });
      expect(result.title).toBe('✅ Hermes Replied');
      expect(result.subtitle).toBe('📍 Your computer • Ready to view');
      expect(result.body).toBe('PR merged successfully');
    });
  });
});

