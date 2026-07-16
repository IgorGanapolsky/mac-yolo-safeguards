import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  COMPOSER_DRAFT_STORAGE_KEY,
  clearComposerDraft,
  loadComposerDraft,
  restoreComposerDraftAfterRejectedSend,
  saveComposerDraft,
  transferComposerDraft,
} from '../utils/composerDraftStorage';

describe('composerDraftStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns empty draft for unknown session', async () => {
    await expect(loadComposerDraft('session-a')).resolves.toBe('');
  });

  it('saves and restores draft text for a session', async () => {
    await saveComposerDraft('session-a', 'Hello Hermes');
    await expect(loadComposerDraft('session-a')).resolves.toBe('Hello Hermes');
  });

  it('keeps drafts isolated per session id', async () => {
    await saveComposerDraft('session-a', 'Draft A');
    await saveComposerDraft('session-b', 'Draft B');
    await expect(loadComposerDraft('session-a')).resolves.toBe('Draft A');
    await expect(loadComposerDraft('session-b')).resolves.toBe('Draft B');
  });

  it('clears draft when text is empty', async () => {
    await saveComposerDraft('session-a', 'Typed text');
    await saveComposerDraft('session-a', '   ');
    await expect(loadComposerDraft('session-a')).resolves.toBe('');
    expect(await AsyncStorage.getItem(COMPOSER_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('clearComposerDraft removes stored text', async () => {
    await saveComposerDraft('session-a', 'Remove me');
    await clearComposerDraft('session-a');
    await expect(loadComposerDraft('session-a')).resolves.toBe('');
  });

  it('restoreComposerDraftAfterRejectedSend re-persists cleared typed text', async () => {
    await saveComposerDraft('session-a', 'make money today');
    await clearComposerDraft('session-a');
    await restoreComposerDraftAfterRejectedSend('session-a', 'make money today');
    await expect(loadComposerDraft('session-a')).resolves.toBe('make money today');
  });

  it('restoreComposerDraftAfterRejectedSend ignores blank text', async () => {
    await saveComposerDraft('session-a', 'keep');
    await restoreComposerDraftAfterRejectedSend('session-a', '   ');
    await expect(loadComposerDraft('session-a')).resolves.toBe('keep');
  });

  it('transferComposerDraft moves draft to the new session and clears source', async () => {
    await saveComposerDraft('mega-old', 'Keep this prompt');
    const moved = await transferComposerDraft('mega-old', 'fresh-new');
    expect(moved).toBe('Keep this prompt');
    await expect(loadComposerDraft('fresh-new')).resolves.toBe('Keep this prompt');
    await expect(loadComposerDraft('mega-old')).resolves.toBe('');
  });

  it('transferComposerDraft is a no-op when ids match', async () => {
    await saveComposerDraft('same', 'Stay');
    await expect(transferComposerDraft('same', 'same')).resolves.toBe('Stay');
    await expect(loadComposerDraft('same')).resolves.toBe('Stay');
  });

  it('ignores blank session ids', async () => {
    await saveComposerDraft('  ', 'Should not persist');
    expect(await AsyncStorage.getItem(COMPOSER_DRAFT_STORAGE_KEY)).toBeNull();
    await expect(loadComposerDraft('')).resolves.toBe('');
  });
});
