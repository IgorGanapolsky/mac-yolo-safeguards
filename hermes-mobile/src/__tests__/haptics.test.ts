import { Vibration } from 'react-native';
import { haptics, resetHapticsForTests } from '../services/haptics';

jest.mock('expo-haptics', () => ({
  __esModule: true,
  impactAsync: jest.fn(() => Promise.reject(new Error('use Vibration fallback'))),
  notificationAsync: jest.fn(() => Promise.reject(new Error('use Vibration fallback'))),
  ImpactFeedbackStyle: { Light: 'Light', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning' },
}));

describe('haptics spam guards', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-22T12:00:00.000Z'));
    resetHapticsForTests();
    jest.spyOn(Vibration, 'vibrate').mockImplementation(() => true);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('does not re-fire warning on a ~1s poll / Waiting tick cadence', async () => {
    haptics.warning();
    await Promise.resolve();
    await Promise.resolve();
    expect(Vibration.vibrate).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 8; i += 1) {
      jest.advanceTimersByTime(1_000);
      haptics.warning();
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(Vibration.vibrate).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(30_000);
    haptics.warning();
    await Promise.resolve();
    await Promise.resolve();
    expect(Vibration.vibrate).toHaveBeenCalledTimes(2);
  });

  it('throttles connection sign-of-life across reconnect flaps', async () => {
    haptics.connection();
    await Promise.resolve();
    await Promise.resolve();
    expect(Vibration.vibrate).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 20; i += 1) {
      jest.advanceTimersByTime(1_200);
      haptics.connection();
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(Vibration.vibrate).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(30_000);
    haptics.connection();
    await Promise.resolve();
    await Promise.resolve();
    expect(Vibration.vibrate).toHaveBeenCalledTimes(2);
  });

  it('enforces a global floor so mixed kinds cannot buzz every second', async () => {
    haptics.light();
    await Promise.resolve();
    await Promise.resolve();
    haptics.success();
    await Promise.resolve();
    await Promise.resolve();
    haptics.warning();
    await Promise.resolve();
    await Promise.resolve();
    expect(Vibration.vibrate).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1_000);
    haptics.success();
    await Promise.resolve();
    await Promise.resolve();
    expect(Vibration.vibrate).toHaveBeenCalledTimes(1);
  });
});
