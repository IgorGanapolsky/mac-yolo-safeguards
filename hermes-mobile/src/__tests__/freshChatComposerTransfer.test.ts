import {
  captureComposerTextForFreshChat,
  resolveComposerTextAfterFreshChat,
  shouldRestoreComposerAfterFreshChat,
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
});
