import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

// Must mock before importing the hook
jest.mock('expo-updates', () => ({
  __esModule: true,
  isEnabled: false,
  checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: false }),
  fetchUpdateAsync: jest.fn().mockResolvedValue({ isNew: true }),
  reloadAsync: jest.fn().mockResolvedValue(undefined),
  useUpdates: jest.fn(),
  updateId: null,
}));

const mockUseUpdates = Updates.useUpdates as jest.MockedFunction<typeof Updates.useUpdates>;

const baseReturn = {
  currentlyRunning: { isEmbeddedLaunch: true, emergencyLaunchReason: null } as any,
  isStartupProcedureRunning: false,
  isUpdateAvailable: false,
  isUpdatePending: false,
  isChecking: false,
  isDownloading: false,
  isRestarting: false,
  restartCount: 0,
};

describe('useOtaUpdateBanner', () => {
  const prevThaw = process.env.EXPO_PUBLIC_OTA_BILLING_THAW;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    // Existing prompt tests assume prompts are allowed (billing thawed).
    process.env.EXPO_PUBLIC_OTA_BILLING_THAW = '1';
  });

  afterEach(() => {
    if (prevThaw === undefined) delete process.env.EXPO_PUBLIC_OTA_BILLING_THAW;
    else process.env.EXPO_PUBLIC_OTA_BILLING_THAW = prevThaw;
  });

  it('returns idle when OTA is disabled (dev builds)', () => {
    (Updates as any).isEnabled = false;
    mockUseUpdates.mockReturnValue({ ...baseReturn });

    const { result } = renderHook(() => {
      const { useOtaUpdateBanner } = require('../hooks/useOtaUpdateBanner');
      return useOtaUpdateBanner();
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.message).toBe('');
    expect(typeof result.current.dismiss).toBe('function');
    expect(typeof result.current.applyNow).toBe('function');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('returns available without Alert — banner-only UI', () => {
    (Updates as any).isEnabled = true;
    mockUseUpdates.mockReturnValue({
      ...baseReturn,
      currentlyRunning: { isEmbeddedLaunch: false, emergencyLaunchReason: null } as any,
      isUpdateAvailable: true,
    });

    const { result } = renderHook(() => {
      const { useOtaUpdateBanner } = require('../hooks/useOtaUpdateBanner');
      return useOtaUpdateBanner();
    });

    expect(result.current.state).toBe('available');
    expect(result.current.message).toContain('new version');
    // Dual UI kill: never Alert.alert alongside OtaUpdateBanner
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('never fires Alert.alert even when update becomes available', () => {
    (Updates as any).isEnabled = true;
    mockUseUpdates.mockReturnValue({
      ...baseReturn,
      isUpdateAvailable: true,
    });

    const { rerender } = renderHook(() => {
      const { useOtaUpdateBanner } = require('../hooks/useOtaUpdateBanner');
      return useOtaUpdateBanner();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    rerender({});
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('returns pending without Alert — banner-only UI', () => {
    (Updates as any).isEnabled = true;
    mockUseUpdates.mockReturnValue({
      ...baseReturn,
      isUpdatePending: true,
    });

    const { result } = renderHook(() => {
      const { useOtaUpdateBanner } = require('../hooks/useOtaUpdateBanner');
      return useOtaUpdateBanner();
    });

    expect(result.current.state).toBe('pending');
    expect(result.current.message).toContain('ready');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('calls reloadAsync on applyNow when update already pending', async () => {
    (Updates as any).isEnabled = true;
    mockUseUpdates.mockReturnValue({
      ...baseReturn,
      isUpdatePending: true,
    });

    const { result } = renderHook(() => {
      const { useOtaUpdateBanner } = require('../hooks/useOtaUpdateBanner');
      return useOtaUpdateBanner();
    });

    await act(async () => {
      await result.current.applyNow();
    });

    expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(Updates.reloadAsync).toHaveBeenCalled();
  });

  it('silently applies a pending update for a first-session user', async () => {
    (Updates as any).isEnabled = true;
    mockUseUpdates.mockReturnValue({
      ...baseReturn,
      isUpdatePending: true,
    });

    const { result, unmount } = renderHook(() => {
      const { useOtaUpdateBanner } = require('../hooks/useOtaUpdateBanner');
      return useOtaUpdateBanner({ isFirstSession: true });
    });

    await act(async () => {});

    expect(result.current.state).toBe('idle');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Updates.reloadAsync).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('silently applies an available update for a first-session user', async () => {
    (Updates as any).isEnabled = true;
    mockUseUpdates.mockReturnValue({
      ...baseReturn,
      isUpdateAvailable: true,
    });

    const { result } = renderHook(() => {
      const { useOtaUpdateBanner } = require('../hooks/useOtaUpdateBanner');
      return useOtaUpdateBanner({ isFirstSession: true });
    });

    await act(async () => {});

    expect(result.current.state).toBe('idle');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(Updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('dismiss sets state to idle', () => {
    (Updates as any).isEnabled = true;
    mockUseUpdates.mockReturnValue({
      ...baseReturn,
      isUpdateAvailable: true,
    });

    const { result } = renderHook(() => {
      const { useOtaUpdateBanner } = require('../hooks/useOtaUpdateBanner');
      return useOtaUpdateBanner();
    });

    expect(result.current.state).toBe('available');
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.state).toBe('idle');
  });

  it('stays idle and skips Alert/check during Expo billing freeze', () => {
    delete process.env.EXPO_PUBLIC_OTA_BILLING_THAW;
    delete process.env.EXPO_PUBLIC_OTA_CLIENT_PROMPTS;
    delete process.env.HERMES_OTA_BILLING_THAW;
    (Updates as any).isEnabled = true;
    mockUseUpdates.mockReturnValue({
      ...baseReturn,
      isUpdatePending: true,
    });

    const { result } = renderHook(() => {
      const { useOtaUpdateBanner } = require('../hooks/useOtaUpdateBanner');
      return useOtaUpdateBanner();
    });

    expect(result.current.state).toBe('idle');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('never calls reloadAsync during billing freeze even if applyNow is invoked', async () => {
    delete process.env.EXPO_PUBLIC_OTA_BILLING_THAW;
    delete process.env.EXPO_PUBLIC_OTA_CLIENT_PROMPTS;
    delete process.env.HERMES_OTA_BILLING_THAW;
    (Updates as any).isEnabled = true;
    mockUseUpdates.mockReturnValue({
      ...baseReturn,
      isUpdatePending: true,
    });

    const { result } = renderHook(() => {
      const { useOtaUpdateBanner } = require('../hooks/useOtaUpdateBanner');
      return useOtaUpdateBanner();
    });

    await act(async () => {
      await result.current.applyNow();
    });

    expect(Updates.reloadAsync).not.toHaveBeenCalled();
    expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });
});
