import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';
import type { HermesAgentToolName } from '../services/hermesAgentTools';
import { parseSetupDeepLink, type SetupDeepLinkParams } from '../utils/setupDeepLink';

type RootTabParamList = {
  Leash: undefined;
  Chat: undefined;
  Settings: undefined;
};

function actionFromUrl(url: string): HermesAgentToolName | 'refresh_health' | null {
  const lower = url.toLowerCase();
  if (lower.includes('leash/approve')) return 'approve_top_pending';
  if (lower.includes('leash/reject')) return 'reject_top_pending';
  if (lower.includes('leash/health')) return 'refresh_health';
  if (lower.includes('leash')) return null;
  return null;
}

function sessionIdFromUrl(url: string): string | undefined {
  const match = url.match(/[?&]session=([^&]+)/i);
  if (!match?.[1]) {
    return undefined;
  }
  try {
    return decodeURIComponent(match[1]).trim() || undefined;
  } catch {
    return match[1].trim() || undefined;
  }
}

function isChatDeepLink(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('/chat') || lower.endsWith('chat');
}

export function useHermesDeepLinks(
  navigationRef: React.RefObject<NavigationContainerRef<RootTabParamList> | null>,
  runAgentTool: (name: HermesAgentToolName) => Promise<unknown>,
  refreshHealth: () => Promise<void>,
  applySetupDeepLink?: (params: SetupDeepLinkParams) => Promise<void>,
  focusChatSession?: (sessionId: string) => void,
) {
  const handled = useRef(new Set<string>());

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;

      const setup = parseSetupDeepLink(url);
      if (setup && applySetupDeepLink) {
        await applySetupDeepLink(setup);
        navigationRef.current?.navigate('Chat');
        return;
      }

      const lower = url.toLowerCase();
      if (lower.includes('/ops') || lower.endsWith('ops')) {
        navigationRef.current?.navigate('Settings');
        return;
      }

      if (isChatDeepLink(url)) {
        navigationRef.current?.navigate('Chat');
        const sessionId = sessionIdFromUrl(url);
        if (sessionId && focusChatSession) {
          focusChatSession(sessionId);
        }
        return;
      }

      if (handled.current.has(url)) return;
      handled.current.add(url);

      navigationRef.current?.navigate('Leash');

      const action = actionFromUrl(url);
      if (action === 'refresh_health') {
        await refreshHealth();
        return;
      }
      if (action === 'approve_top_pending' || action === 'reject_top_pending') {
        await runAgentTool(action);
      }
    };

    Linking.getInitialURL().then((url) => handleUrl(url));
    const sub = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });
    return () => sub.remove();
  }, [applySetupDeepLink, focusChatSession, navigationRef, refreshHealth, runAgentTool]);
}
