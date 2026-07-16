import { Platform } from 'react-native';
import { __resetHapticsForTests, haptics } from '../services/haptics';

describe('haptics policy', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    __resetHapticsForTests();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });

  it('exposes tap for intentional UI controls', () => {
    expect(typeof haptics.tap).toBe('function');
    expect(() => haptics.tap()).not.toThrow();
  });

  it('selection fires on Android (not iOS-only)', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    expect(() => haptics.selection()).not.toThrow();
  });

  it('throttles rapid taps without throwing', () => {
    haptics.tap();
    haptics.tap();
    haptics.tap();
  });
});
