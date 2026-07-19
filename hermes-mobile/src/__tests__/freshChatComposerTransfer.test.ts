import {
  COMPOSER_DRAFT_COMPOSE_FIRST_KEY,
  captureComposerTextForFreshChat,
  composerDraftSessionKey,
  resolveComposerTextAfterDraftLoad,
  resolveComposerTextAfterFreshChat,
  shouldRestoreComposerAfterFreshChat,
  shouldRestoreComposerAttachmentsAfterFreshChat,
  shouldSkipStoredDraftLoad,
} from '../utils/freshChatComposerTransfer';

describe('freshChatComposerTransfer', () => {
  it('captures typed composer text including whitespace-only drafts', () => {
    expect(captureComposerTextForFreshChat('typeable-probe-probe-2-1')).toBe(
      'typeable-probe-probe-2-1',
    );
    expect(captureComposerTextForFreshChat('  keep spaces  ')).toBe('  keep spaces  ');
    expect(captureComposerTextForFreshChat('')).toBe('');
    expect(captureComposerTextForFreshChat(null)).toBe('');
    expect(captureComposerTextForFreshChat(undefined)).toBe('');
  });

  it('restores only when the user had typed something', () => {
    expect(shouldRestoreComposerAfterFreshChat('typeable-probe-probe-2-1')).toBe(true);
    expect(shouldRestoreComposerAfterFreshChat(' ')).toBe(true);
    expect(shouldRestoreComposerAfterFreshChat('')).toBe(false);
  });

  it('restores attachment chips across mega Start fresh even with empty text', () => {
    expect(shouldRestoreComposerAttachmentsAfterFreshChat(1)).toBe(true);
    expect(shouldRestoreComposerAttachmentsAfterFreshChat(0)).toBe(false);
  });

  it('prefers preserved typed text over empty new-session draft', () => {
    expect(
      resolveComposerTextAfterFreshChat({
        preservedText: 'typeable-probe-probe-2-1',
        loadedDraftForNewSession: '',
      }),
    ).toBe('typeable-probe-probe-2-1');

    expect(
      resolveComposerTextAfterFreshChat({
        preservedText: '',
        loadedDraftForNewSession: 'older draft',
      }),
    ).toBe('older draft');

    expect(
      resolveComposerTextAfterFreshChat({
        preservedText: '',
      }),
    ).toBe('');
  });

  it('skips stored draft load while a transfer is pending', () => {
    expect(shouldSkipStoredDraftLoad('typeable-probe-probe-2-1')).toBe(true);
    expect(shouldSkipStoredDraftLoad('')).toBe(true);
    expect(shouldSkipStoredDraftLoad(null)).toBe(false);
  });

  it('same-session draft load never replaces typed text with empty storage', () => {
    expect(
      resolveComposerTextAfterDraftLoad({
        inMemoryText: 'make money today',
        loadedDraft: '',
        isSessionChange: false,
        textAtFetchStart: 'make money today',
      }),
    ).toBe('make money today');
  });

  it('keeps edits typed while the draft fetch is in flight', () => {
    expect(
      resolveComposerTextAfterDraftLoad({
        inMemoryText: 'make money today now',
        loadedDraft: 'stale',
        isSessionChange: false,
        textAtFetchStart: 'make money',
      }),
    ).toBe('make money today now');
  });

  it('applies empty destination draft on real session change', () => {
    expect(
      resolveComposerTextAfterDraftLoad({
        inMemoryText: 'from previous thread',
        loadedDraft: '',
        isSessionChange: true,
        textAtFetchStart: 'from previous thread',
      }),
    ).toBe('');
  });

  it('keeps compose-first text when a real session attaches before storage flushes', () => {
    expect(
      resolveComposerTextAfterDraftLoad({
        inMemoryText: 'make money today',
        loadedDraft: '',
        isSessionChange: true,
        isComposeFirstSessionAttach: true,
        textAtFetchStart: 'make money today',
      }),
    ).toBe('make money today');
  });

  it('applies non-empty stored draft on session change', () => {
    expect(
      resolveComposerTextAfterDraftLoad({
        inMemoryText: 'from previous thread',
        loadedDraft: 'saved on destination',
        isSessionChange: true,
        textAtFetchStart: 'from previous thread',
      }),
    ).toBe('saved on destination');
  });

  it('keys compose-first drafts to a stable sentinel', () => {
    expect(composerDraftSessionKey(null)).toBe(COMPOSER_DRAFT_COMPOSE_FIRST_KEY);
    expect(composerDraftSessionKey(undefined)).toBe(COMPOSER_DRAFT_COMPOSE_FIRST_KEY);
    expect(composerDraftSessionKey('')).toBe(COMPOSER_DRAFT_COMPOSE_FIRST_KEY);
    expect(composerDraftSessionKey('  sess-1  ')).toBe('sess-1');
  });
});
