import fs from 'fs';
import path from 'path';

/**
 * 2026-08-04 user report: "I cleared all threads, but it's still delivering
 * previous message?"
 *
 * executeClearAllChats reset the session, transcript and pending outbound but
 * left runProgress / toolStatus alive. The cleared screen therefore kept
 * rendering the PREVIOUS run — ChatScreenHeader prefers runProgress tokens over
 * session tokens while a run is active, so a brand-new chat still showed
 * "Hermes (active)", the old In/Out totals, and "Delivering your message…".
 *
 * Pins the invariant: clearing threads drops the in-flight run exactly like
 * starting a new chat does.
 */

const chatScreen = fs.readFileSync(
  path.join(__dirname, '..', 'screens', 'ChatScreen.tsx'),
  'utf8',
);

function bodyOf(startMarker: string): string {
  const start = chatScreen.indexOf(startMarker);
  if (start < 0) throw new Error(`missing ${startMarker}`);
  const end = chatScreen.indexOf('\n  }, [', start);
  return chatScreen.slice(start, end > start ? end : start + 6000);
}

describe('clearing all threads drops the in-flight run', () => {
  const clearAll = bodyOf('const executeClearAllChats');

  it('resets run progress so the header stops showing the old run', () => {
    expect(clearAll).toContain('setRunProgress(null)');
  });

  it('resets tool status', () => {
    expect(clearAll).toContain('setToolStatus(null)');
  });

  it('drops the pinned outbound so "Delivering your message…" cannot persist', () => {
    expect(clearAll).toContain('setPinnedOutboundText(null)');
  });

  it('still clears the transcript and pending outbound it always did', () => {
    expect(clearAll).toContain('setMessages([])');
    expect(clearAll).toContain('clearPendingOutbound');
  });

  it('matches what New chat already resets — the two paths must not diverge', () => {
    const newChat = chatScreen.slice(
      chatScreen.indexOf('const handleNewChat'),
      chatScreen.indexOf('const handleStartFreshChat'),
    );
    for (const reset of [
      'setRunProgress(null)',
      'setToolStatus(null)',
      'setPinnedOutboundText(null)',
    ]) {
      expect(newChat).toContain(reset);
      expect(clearAll).toContain(reset);
    }
  });
});
