import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RUN_PROGRESS_DETAILS_EXPANDED_KEY,
  loadRunProgressDetailsExpanded,
  saveRunProgressDetailsExpanded,
} from '../utils/runProgressDetailsPreference';

describe('runProgressDetailsPreference', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns null when nothing is stored (keyboard-aware default)', async () => {
    await expect(loadRunProgressDetailsExpanded()).resolves.toBeNull();
  });

  it('persists expanded preference', async () => {
    await saveRunProgressDetailsExpanded(true);
    expect(await AsyncStorage.getItem(RUN_PROGRESS_DETAILS_EXPANDED_KEY)).toBe('1');
    await expect(loadRunProgressDetailsExpanded()).resolves.toBe(true);
  });

  it('persists collapsed preference', async () => {
    await saveRunProgressDetailsExpanded(true);
    await saveRunProgressDetailsExpanded(false);
    expect(await AsyncStorage.getItem(RUN_PROGRESS_DETAILS_EXPANDED_KEY)).toBe('0');
    await expect(loadRunProgressDetailsExpanded()).resolves.toBe(false);
  });
});
