import { Linking } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { useHermesDeepLinks } from '../hooks/useHermesDeepLinks';

describe('useHermesDeepLinks', () => {
  const navigationRef = { current: { navigate: jest.fn() } };
  const runAgentTool = jest.fn().mockResolvedValue({ ok: true });
  const refreshHealth = jest.fn().mockResolvedValue(undefined);
  const focusChatSession = jest.fn();

  beforeEach(() => {
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
});
