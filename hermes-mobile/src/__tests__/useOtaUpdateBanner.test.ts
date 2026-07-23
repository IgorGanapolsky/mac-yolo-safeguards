import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
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
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('returns available when useUpdates reports isUpdateAvailable', () => {
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
    expect(Alert.alert).toHaveBeenCalledWith(
      'Update available',
      'A new version of ThumbGate is available.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Later', style: 'cancel' }),
        expect.objectContaining({ text: 'Download & restart' }),
      ]),
    );
  });

  it('shows Alert once per session when update becomes available', () => {
    (Updates as any).isEnabled = true;
    mockUseUpdates.mockReturnValue({
      ...baseReturn,
      isUpdateAvailable: true,
    });

    const { rerender } = renderHook(() => {
      const { useOtaUpdateBanner } = require('../hooks/useOtaUpdateBanner');
      return useOtaUpdateBanner();
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    rerender({});
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it('returns pending when useUpdates reports isUpdatePending', () => {
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
    expect(Alert.alert).toHaveBeenCalledWith(
      'Update available',
      'A new version of ThumbGate is downloaded and ready.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Later', style: 'cancel' }),
        expect.objectContaining({ text: 'Restart' }),
      ]),
    );
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

  it('Later button on Alert calls dismiss', () => {
    (Updates as any).isEnabled = true;
    mockUseUpdates.mockReturnValue({
      ...baseReturn,
      isUpdateAvailable: true,
    });

    const { result } = renderHook(() => {
      const { useOtaUpdateBanner } = require('../hooks/useOtaUpdateBanner');
      return useOtaUpdateBanner();
    });

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    const later = buttons.find((b) => b.text === 'Later');
    act(() => {
      later?.onPress?.();
    });
    expect(result.current.state).toBe('idle');
  });
});
