import { Linking } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { useHermesDeepLinks, resetHandledUrls } from '../hooks/useHermesDeepLinks';
import {
  clearMarketingAttribution,
  getMarketingAttributionProperties,
} from '../services/marketingAttribution';
import Constants from 'expo-constants';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

describe('useHermesDeepLinks', () => {
  const navigationRef = { current: { navigate: jest.fn() } };
  const runAgentTool = jest.fn().mockResolvedValue({ ok: true });
  const refreshHealth = jest.fn().mockResolvedValue(undefined);
  const focusChatSession = jest.fn();

  beforeEach(async () => {
    await clearMarketingAttribution();
    resetHandledUrls();
    jest.clearAllMocks();
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
  });

  it('approves via hermes://leash/approve', async () => {
    renderHook(() =>
      useHermesDeepLinks(navigationRef as never, runAgentTool, refreshHealth),
    );
    const handler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
    await act(async () => {
      await handler({ url: 'hermes://leash/approve' });
    });
    expect(navigationRef.current.navigate).toHaveBeenCalledWith('Leash');
    expect(runAgentTool).toHaveBeenCalledWith('approve_top_pending');
  });

  it('opens Chat and focuses session from hermes://chat?session=', async () => {
    renderHook(() =>
      useHermesDeepLinks(
        navigationRef as never,
        runAgentTool,
        refreshHealth,
        undefined,
        focusChatSession,
      ),
    );
    const handler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
    await act(async () => {
      await handler({ url: 'hermes://chat?session=sess-42' });
    });
    expect(navigationRef.current.navigate).toHaveBeenCalledWith('Chat');
    expect(focusChatSession).toHaveBeenCalledWith('sess-42');
    expect(runAgentTool).not.toHaveBeenCalled();
  });

  it('applies hermes://setup and opens Chat', async () => {
    const applySetupDeepLink = jest.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useHermesDeepLinks(
        navigationRef as never,
        runAgentTool,
        refreshHealth,
        applySetupDeepLink,
      ),
    );
    const handler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
    await act(async () => {
      await handler({
        url: 'hermes://setup?url=http://192.168.12.208:8642&key=sk-test',
      });
    });
    expect(applySetupDeepLink).toHaveBeenCalledWith({
      gatewayUrl: 'http://192.168.12.208:8642',
      apiKey: 'sk-test',
    });
    expect(navigationRef.current.navigate).toHaveBeenCalledWith('Chat');
  });

  it('opens Settings from hermes://settings', async () => {
    renderHook(() =>
      useHermesDeepLinks(navigationRef as never, runAgentTool, refreshHealth),
    );
    const handler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
    await act(async () => {
      await handler({ url: 'hermes://settings' });
      await handler({ url: 'hermes://settings' });
    });
    expect(navigationRef.current.navigate).toHaveBeenCalledWith('Settings');
    expect(navigationRef.current.navigate).toHaveBeenCalledTimes(2);
  });

  it('forces demo mode on E2E builds for hermes://setup?demo=1', async () => {
    const forceE2eDemoMode = jest.fn().mockResolvedValue(undefined);
    const applySetupDeepLink = jest.fn().mockResolvedValue(undefined);
    (Constants.expoConfig as { extra?: Record<string, unknown> }).extra = {
      e2eAutomation: true,
    };
    renderHook(() =>
      useHermesDeepLinks(
        navigationRef as never,
        runAgentTool,
        refreshHealth,
        applySetupDeepLink,
        undefined,
        undefined,
        forceE2eDemoMode,
      ),
    );
    const handler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
    await act(async () => {
      await handler({ url: 'hermes://setup?demo=1' });
    });
    expect(forceE2eDemoMode).toHaveBeenCalled();
    expect(applySetupDeepLink).not.toHaveBeenCalled();
    expect(navigationRef.current.navigate).toHaveBeenCalledWith('Chat');
  });

  it('re-navigates to Chat when hermes://chat is opened again', async () => {
    renderHook(() =>
      useHermesDeepLinks(navigationRef as never, runAgentTool, refreshHealth),
    );
    const handler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
    await act(async () => {
      await handler({ url: 'hermes://chat' });
      await handler({ url: 'hermes://chat' });
    });
    expect(navigationRef.current.navigate).toHaveBeenCalledTimes(2);
    expect(navigationRef.current.navigate).toHaveBeenNthCalledWith(1, 'Chat');
    expect(navigationRef.current.navigate).toHaveBeenNthCalledWith(2, 'Chat');
  });

  it('records marketing attribution before routing deep links', async () => {
    renderHook(() =>
      useHermesDeepLinks(navigationRef as never, runAgentTool, refreshHealth),
    );
    const handler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
    await act(async () => {
      await handler({
        url: 'hermes://chat?utm_source=applovin&utm_medium=roas&utm_campaign=day7-leash&network=applovin',
      });
    });

    const props = await getMarketingAttributionProperties();
    expect(props.attribution_source).toBe('applovin');
    expect(props.attribution_medium).toBe('roas');
    expect(props.attribution_campaign).toBe('day7-leash');
    expect(props.attribution_window).toBe('day7');
  });
});
