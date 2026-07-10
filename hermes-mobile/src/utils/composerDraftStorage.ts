import AsyncStorage from '@react-native-async-storage/async-storage';

export const COMPOSER_DRAFT_STORAGE_KEY = 'hermes-mobile:composer_drafts';
export const COMPOSER_DRAFT_SAVE_DEBOUNCE_MS = 400;

type ComposerDraftMap = Record<string, string>;

function normalizeSessionId(sessionId: string | null | undefined): string | null {
  const trimmed = sessionId?.trim();
  return trimmed ? trimmed : null;
}

async function loadComposerDraftMap(): Promise<ComposerDraftMap> {
  try {
    const raw = await AsyncStorage.getItem(COMPOSER_DRAFT_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as ComposerDraftMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('[hermes-mobile] loadComposerDraftMap failed:', error);
    return {};
  }
}

export async function loadComposerDraft(sessionId: string | null | undefined): Promise<string> {
  const id = normalizeSessionId(sessionId);
  if (!id) {
    return '';
  }
  const map = await loadComposerDraftMap();
  const draft = map[id];
  return typeof draft === 'string' ? draft : '';
}

export async function saveComposerDraft(
  sessionId: string | null | undefined,
  text: string,
): Promise<void> {
  const id = normalizeSessionId(sessionId);
  if (!id) {
    return;
  }
  try {
    const map = await loadComposerDraftMap();
    if (!text.trim()) {
      delete map[id];
    } else {
      map[id] = text;
    }
    if (Object.keys(map).length === 0) {
      await AsyncStorage.removeItem(COMPOSER_DRAFT_STORAGE_KEY);
    } else {
      await AsyncStorage.setItem(COMPOSER_DRAFT_STORAGE_KEY, JSON.stringify(map));
    }
  } catch (error) {
    console.warn('[hermes-mobile] saveComposerDraft failed:', error);
  }
}

export async function clearComposerDraft(sessionId: string | null | undefined): Promise<void> {
  await saveComposerDraft(sessionId, '');
}
