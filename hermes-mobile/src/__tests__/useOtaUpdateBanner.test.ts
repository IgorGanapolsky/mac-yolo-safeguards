import { act, renderHook } from '@testing-library/react-native';
import * as Updates from 'expo-updates';

// Must mock before importing the hook
jest.mock('expo-updates', () => ({
  __esModule: true,
  isEnabled: false,
  checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: false }),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
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

    await result.current.applyNow();

    expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(Updates.reloadAsync).toHaveBeenCalled();
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
});
