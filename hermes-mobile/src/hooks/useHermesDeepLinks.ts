import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';
import type { HermesAgentToolName } from '../services/hermesAgentTools';
import { parseSetupDeepLink, parseRelayDeepLink, type SetupDeepLinkParams } from '../utils/setupDeepLink';
import { isDevLeashUnlockDeepLink, canUseDeveloperLeashBackdoor } from '../utils/developerLeashUnlock';
import { recordAttributionFromUrl } from '../services/marketingAttribution';

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

function isSettingsDeepLink(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('/settings') || lower.endsWith('settings');
}

function isLeashTabDeepLink(url: string): boolean {
  const lower = url.toLowerCase();
  return lower === 'hermes://leash' || lower.endsWith('/leash');
}

const handledUrls = new Set<string>();

export function resetHandledUrls() {
  handledUrls.clear();
}

export function useHermesDeepLinks(
  navigationRef: React.RefObject<NavigationContainerRef<RootTabParamList> | null>,
  runAgentTool: (name: HermesAgentToolName) => Promise<unknown>,
  refreshHealth: () => Promise<void>,
  applySetupDeepLink?: (params: SetupDeepLinkParams) => Promise<void>,
  focusChatSession?: (sessionId: string) => void,
  activateDeveloperLeashUnlock?: () => Promise<void>,
) {
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      await recordAttributionFromUrl(url);

      const lower = url.toLowerCase();
      const navigationOnly =
        isChatDeepLink(url) ||
        isSettingsDeepLink(url) ||
        isLeashTabDeepLink(url) ||
        lower.includes('/ops') ||
        lower.endsWith('ops') ||
        isDevLeashUnlockDeepLink(url);

      if (!navigationOnly && handledUrls.has(url)) return;
      if (!navigationOnly) handledUrls.add(url);

      if (isDevLeashUnlockDeepLink(url) && activateDeveloperLeashUnlock && canUseDeveloperLeashBackdoor()) {
        await activateDeveloperLeashUnlock();
        navigationRef.current?.navigate('Leash');
        return;
      }

      const relayOnly = parseRelayDeepLink(url);
      if (relayOnly && applySetupDeepLink) {
        await applySetupDeepLink(relayOnly);
        navigationRef.current?.navigate('Chat');
        return;
      }

      const setup = parseSetupDeepLink(url);
      if (setup && applySetupDeepLink) {
        await applySetupDeepLink(setup);
        navigationRef.current?.navigate('Chat');
        return;
      }

      if (lower.includes('/ops') || lower.endsWith('ops') || isSettingsDeepLink(url)) {
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

      if (isLeashTabDeepLink(url)) {
        navigationRef.current?.navigate('Leash');
        return;
      }

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
  }, [activateDeveloperLeashUnlock, applySetupDeepLink, focusChatSession, navigationRef, refreshHealth, runAgentTool]);
}
