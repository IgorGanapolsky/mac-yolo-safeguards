import { AccessibilityInfo, Platform } from 'react-native';
import { emitSignOfLife } from '../services/signOfLife';
import { haptics } from '../services/haptics';

jest.mock('../services/haptics', () => ({
  haptics: { light: jest.fn(), connection: jest.fn() },
}));

describe('emitSignOfLife', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fires optional connection haptic when requested', async () => {
    await emitSignOfLife('Hermes Mobile connected', { haptic: true });
    expect(haptics.connection).toHaveBeenCalled();
    expect(haptics.light).not.toHaveBeenCalled();
  });

  it('announces for accessibility when screen reader is on', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => Promise.resolve());
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });

    await emitSignOfLife('Gateway healthy');

    expect(announce).toHaveBeenCalledWith('Gateway healthy');
  });

  it('skips announce on web', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => Promise.resolve());
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });

    await emitSignOfLife('skip');

    expect(announce).not.toHaveBeenCalled();
  });
});
