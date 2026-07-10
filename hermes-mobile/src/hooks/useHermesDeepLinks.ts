import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';
import type { HermesAgentToolName } from '../services/hermesAgentTools';
import { parseSetupDeepLink, parseRelayDeepLink, type SetupDeepLinkParams } from '../utils/setupDeepLink';
import { syncExtraProfileApiKeys } from '../utils/gatewayProfileCredentialSync';
import { isDevLeashUnlockDeepLink } from '../utils/developerLeashUnlock';
import { isDemoModeAllowed } from '../utils/demoModePolicy';
import { recordAttributionFromUrl } from '../services/marketingAttribution';
import { requestSettingsPairQrOnFocus } from '../utils/storeCaptureDeepLink';

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


function queryParam(url: string, key: string): string | undefined {
  const idx = url.indexOf('?');
  if (idx < 0) {
    return undefined;
  }
  const params = new URLSearchParams(url.slice(idx + 1));
  const value = params.get(key);
  return value?.trim() || undefined;
}

function isTruthyQueryFlag(url: string, key: string, ...accepted: string[]): boolean {
  const raw = queryParam(url, key);
  if (!raw) {
    return false;
  }
  const lower = raw.toLowerCase();
  if (accepted.length === 0) {
    return lower === '1' || lower === 'true' || lower === 'yes';
  }
  return accepted.some((value) => value.toLowerCase() === lower);
}

function isLeashSmokePreviewDeepLink(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    isTruthyQueryFlag(url, 'preview', 'smoke') ||
    isTruthyQueryFlag(url, 'smoke', '1', 'true') ||
    lower.includes('leash/preview/smoke') ||
    lower.includes('leash/preview')
  );
}

function isChatDeepLink(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('/chat') || lower.endsWith('chat');
}

function isSettingsDeepLink(url: string): boolean {
  const lower = url.toLowerCase();
  if (!lower.startsWith('hermes://')) {
    return false;
  }
  return /^hermes:\/\/settings([/?]|$)/i.test(url) || lower.endsWith('/settings');
}

function isLeashTabDeepLink(url: string): boolean {
  const lower = url.toLowerCase();
  if (!lower.startsWith('hermes://') || !lower.includes('leash')) {
    return false;
  }
  if (lower.includes('leash/approve') || lower.includes('leash/reject') || lower.includes('leash/health')) {
    return false;
  }
  return /^hermes:\/\/leash([/?]|$)/i.test(url) || lower.endsWith('/leash');
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
  forceE2eDemoMode?: () => Promise<void>,
  injectSmokeApproval?: () => void,
  activateStoreLeashPreview?: () => void,
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

      const setup = parseSetupDeepLink(url);
      const e2eDemoRebootstrap =
        setup?.demoMode && isDemoModeAllowed() && Boolean(forceE2eDemoMode);

      // Maestro ship-guard opens hermes://setup?demo=1 twice; dedupe would skip the heal recovery.
      if (!navigationOnly && !e2eDemoRebootstrap && handledUrls.has(url)) return;
      if (!navigationOnly && !e2eDemoRebootstrap) handledUrls.add(url);

      if (isDevLeashUnlockDeepLink(url) && activateDeveloperLeashUnlock) {
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

      if (setup?.demoMode && isDemoModeAllowed() && forceE2eDemoMode) {
        await forceE2eDemoMode();
        await syncExtraProfileApiKeys(setup.extraComputers);
        navigationRef.current?.navigate('Chat');
        return;
      }
      if (setup && applySetupDeepLink) {
        await applySetupDeepLink(setup);
        await syncExtraProfileApiKeys(setup.extraComputers);
        navigationRef.current?.navigate('Chat');
        return;
      }

      if (lower.includes('/ops') || lower.endsWith('ops') || isSettingsDeepLink(url)) {
        if (
          isTruthyQueryFlag(url, 'pair', 'qr', 'scan') ||
          isTruthyQueryFlag(url, 'qr', '1', 'true', 'scan') ||
          lower.includes('settings/pair/qr') ||
          lower.includes('settings/pair')
        ) {
          requestSettingsPairQrOnFocus();
        }
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
        if (isLeashSmokePreviewDeepLink(url)) {
          activateStoreLeashPreview?.();
          injectSmokeApproval?.();
        }
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
  }, [activateDeveloperLeashUnlock, activateStoreLeashPreview, applySetupDeepLink, focusChatSession, forceE2eDemoMode, injectSmokeApproval, navigationRef, refreshHealth, runAgentTool]);
}
