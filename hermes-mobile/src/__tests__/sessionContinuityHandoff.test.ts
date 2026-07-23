import {
  buildContinuitySystemPromptSection,
  buildSessionContinuityHandoff,
  clipText,
  continuityTitleFromHandoff,
  extractLastAssistantSummary,
  extractLastUserGoal,
  extractOpenTodos,
  formatHandoffMarkdown,
  isPickUpWhereLeftOffPhrase,
  parseHandoffJson,
  redactSecrets,
  shouldInjectContinuityHandoff,
  shouldShowContinuityChip,
  shouldAutoDismissContinuityChip,
  shouldSkipAutoRetitleForContinuity,
  CONTINUITY_CHIP_AUTO_DISMISS_MS,
  CONTINUITY_VAULT_REL_PATH,
} from '../utils/sessionContinuityHandoff';

describe('sessionContinuityHandoff', () => {
  it('redacts API keys and setup deep links', () => {
    const raw =
      'use sk-abc123def4567890 and hermes://setup?pairCode=XYZ and Bearer tokensecretvalue12';
    const cleaned = redactSecrets(raw);
    expect(cleaned).not.toContain('sk-abc');
    expect(cleaned).not.toContain('hermes://setup');
    expect(cleaned).not.toContain('Bearer tokensecretvalue12');
    expect(cleaned).toContain('[redacted]');
  });

  it('detects pick-up phrases', () => {
    expect(isPickUpWhereLeftOffPhrase('pick up where you left off')).toBe(true);
    expect(isPickUpWhereLeftOffPhrase('Please continue from last session')).toBe(true);
    expect(isPickUpWhereLeftOffPhrase('make money today')).toBe(false);
  });

  it('skips auto-retitle for pick-up phrases when handoff pending', () => {
    expect(shouldSkipAutoRetitleForContinuity('pick up where we left off', true)).toBe(true);
    expect(shouldSkipAutoRetitleForContinuity('pick up where we left off', false)).toBe(false);
    expect(shouldSkipAutoRetitleForContinuity('ship the OTA', true)).toBe(false);
  });

  it('builds handoff from messages without secrets', () => {
    const handoff = buildSessionContinuityHandoff({
      messages: [
        { role: 'user', content: 'Ship session continuity for Hermes Mobile' },
        {
          role: 'assistant',
          content: 'Plan:\n- Write vault handoff\n- Inject on fresh chat\nDone with sk-secretkeyvalue999',
        },
      ],
      sessionId: 'sess-1',
      workspacePath: '/Users/example/mac-yolo-safeguards/hermes-mobile',
      vaultSlug: 'Hermes-Mobile',
      macName: 'Igors-MacBook-Pro',
      now: new Date('2026-07-16T12:00:00.000Z'),
    });
    expect(handoff).not.toBeNull();
    expect(handoff!.lastGoal).toContain('Ship session continuity');
    expect(handoff!.openTodos).toEqual(
      expect.arrayContaining(['Write vault handoff', 'Inject on fresh chat']),
    );
    expect(handoff!.lastAssistantSummary).not.toContain('sk-secret');
    expect(handoff!.vaultRelativePath).toBe(CONTINUITY_VAULT_REL_PATH);
    expect(handoff!.macName).toBe('Igors-MacBook-Pro');
  });

  it('returns null when transcript is empty', () => {
    expect(buildSessionContinuityHandoff({ messages: [] })).toBeNull();
  });

  it('extracts goal/todos/summary helpers', () => {
    const messages = [
      { role: 'user', content: 'pick up where you left off' },
      { role: 'user', content: 'Fix the composer keyboard' },
      {
        role: 'assistant',
        content: 'Next:\n1. Patch ChatScreen\n2. Add tests',
      },
    ];
    expect(extractLastUserGoal(messages)).toBe('Fix the composer keyboard');
    expect(extractOpenTodos(messages)).toEqual(['Patch ChatScreen', 'Add tests']);
    expect(extractLastAssistantSummary(messages)).toContain('Patch ChatScreen');
  });

  it('formats markdown and parses json round-trip', () => {
    const handoff = buildSessionContinuityHandoff({
      messages: [
        { role: 'user', content: 'Continue revenue path' },
        { role: 'assistant', content: 'Working on Stripe links.' },
      ],
      sessionId: 'abc',
      macName: 'Igors-Mac-mini',
      now: new Date('2026-07-16T12:00:00.000Z'),
    })!;
    const md = formatHandoffMarkdown(handoff);
    expect(md).toContain('type: hermes-mobile-session-continuity');
    expect(md).toContain('Continue revenue path');
    expect(md).toContain('Do not let MEMORY.md');
    const parsed = parseHandoffJson(handoff);
    expect(parsed?.lastGoal).toBe(handoff.lastGoal);
    expect(continuityTitleFromHandoff(handoff)).toContain('Continue revenue');
  });

  it('builds system prompt continue-from-handoff section', () => {
    const handoff = buildSessionContinuityHandoff({
      messages: [
        { role: 'user', content: 'Resume vault sync' },
        { role: 'assistant', content: 'Synced Projects/README.' },
      ],
      workspacePath: '/tmp/repo',
      vaultSlug: 'mac-yolo',
    })!;
    const section = buildContinuitySystemPromptSection(handoff);
    expect(section).toContain('Continue from handoff');
    expect(section).toContain(CONTINUITY_VAULT_REL_PATH);
    expect(section).toContain('Resume vault sync');
    expect(section).toContain('Do not let MEMORY.md');
  });

  it('clipText truncates with ellipsis', () => {
    expect(clipText('abcdefghij', 6)).toBe('abcde…');
  });

  it('injects handoff only on empty transcript or pick-up phrases', () => {
    const handoff = buildSessionContinuityHandoff({
      messages: [
        { role: 'user', content: 'Ship continuity' },
        { role: 'assistant', content: 'Done.' },
      ],
    })!;
    expect(
      shouldInjectContinuityHandoff({ handoff, transcriptEmpty: true }),
    ).toBe(true);
    expect(
      shouldInjectContinuityHandoff({ handoff, transcriptEmpty: false }),
    ).toBe(false);
    expect(
      shouldInjectContinuityHandoff({
        handoff,
        transcriptEmpty: false,
        userText: 'pick up where you left off',
      }),
    ).toBe(true);
  });

  it('never shows continuity chip by default — resume is seamless', () => {
    const handoff = buildSessionContinuityHandoff({
      messages: [
        { role: 'user', content: 'Ship continuity' },
        { role: 'assistant', content: 'Done.' },
      ],
    })!;
    expect(
      shouldShowContinuityChip({
        handoff,
        chipDismissed: false,
        transcriptEmpty: true,
      }),
    ).toBe(false);
    expect(
      shouldShowContinuityChip({
        handoff,
        chipDismissed: false,
        transcriptEmpty: false,
      }),
    ).toBe(false);
  });

  it('auto-dismisses continuity chip after the ephemeral window', () => {
    const shownAt = 1_000_000;
    expect(shouldAutoDismissContinuityChip(shownAt, shownAt + CONTINUITY_CHIP_AUTO_DISMISS_MS - 1)).toBe(
      false,
    );
    expect(shouldAutoDismissContinuityChip(shownAt, shownAt + CONTINUITY_CHIP_AUTO_DISMISS_MS)).toBe(
      true,
    );
    expect(shouldAutoDismissContinuityChip(null, shownAt + 10_000)).toBe(false);
    expect(CONTINUITY_CHIP_AUTO_DISMISS_MS).toBeLessThanOrEqual(3000);
  });
});
