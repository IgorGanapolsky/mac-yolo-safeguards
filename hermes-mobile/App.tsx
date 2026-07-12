import React, { Suspense, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, ActivityIndicator, Platform, Alert } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import TabBarIcon from './src/components/TabBarIcon';

// Hold native splash until React paints — prevents flash of empty black window.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// Initialize Sentry (JS + native crashes, unhandled rejections, performance)
// as early as possible, before any component renders. No-op when
// EXPO_PUBLIC_SENTRY_DSN is unset, so DSN-less builds run unchanged.
initCrashReporting();

// Install the global JS exception handler as early as possible, before any
// component renders. Fatal exceptions are persisted to the crash queue and
// flushed to PostHog on the next launch.
installGlobalCrashHandler();

import { NavigationContainer, type NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAiSdkDevTools } from '@react-native-ai/dev-tools/react-native';
import { GatewayProvider, useGateway } from './src/context/GatewayContext';
import { resolveInitialTab, resolveTabOrder, type HermesTabName } from './src/utils/leashUx';
import ErrorBoundary from './src/components/ErrorBoundary';
import ConnectMacGate from './src/components/ConnectMacGate';
import { useHermesDeepLinks } from './src/hooks/useHermesDeepLinks';
import type { SetupDeepLinkParams } from './src/utils/setupDeepLink';
import { trackAppOpen, trackScreenView } from './src/services/productAnalytics';
import {
  flushCrashQueue,
  installGlobalCrashHandler,
} from './src/services/crashReporting';
import {
  initCrashReporting,
  withCrashReporting,
} from './src/services/telemetry';
import { useKeyboardInset } from './src/hooks/useKeyboardInset';
import { isDemoModeAllowed } from './src/utils/demoModePolicy';
import { LEASH_TAB_LABEL } from './src/constants/monetization';
import { colors } from './src/theme/colors';

const ChatScreen = React.lazy(() => import('./src/screens/ChatScreen'));
const ApprovalsScreen = React.lazy(() => import('./src/screens/ApprovalsScreen'));
const SettingsScreen = React.lazy(() => import('./src/screens/SettingsScreen'));

function TabScreenFallback() {
  return (
    <View style={styles.tabFallback} testID="tab-screen-loading">
      <ActivityIndicator size="small" color={colors.accent} />
    </View>
  );
}

function LazyTabScreen({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<TabScreenFallback />}>{children}</Suspense>;
}

type RootTabParamList = {
  Leash: undefined;
  Chat: undefined;
  Settings: undefined;
};

function DevToolsBootstrap() {
  useAiSdkDevTools();
  return null;
}

const Tab = createBottomTabNavigator<RootTabParamList>();

function tabLabelFor(routeName: keyof RootTabParamList): string {
  if (routeName === 'Leash') {
    return LEASH_TAB_LABEL;
  }
  if (routeName === 'Chat') {
    return 'Hermes';
  }
  return 'Settings';
}

/** Maestro-stable tab selectors — avoid substring hits like chat-connection-settings. */
function tabTestIdFor(routeName: keyof RootTabParamList): string {
  if (routeName === 'Chat') {
    return 'tab-hermes';
  }
  if (routeName === 'Leash') {
    return 'tab-leash';
  }
  return 'tab-settings';
}

const renderTabBar = (props: BottomTabBarProps) => <GlassmorphicTabBar {...props} />;

const TAB_SCREENS: Record<HermesTabName, () => React.ReactNode> = {
  Chat: () => (
    <LazyTabScreen>
      <ChatScreen />
    </LazyTabScreen>
  ),
  Leash: () => (
    <LazyTabScreen>
      <ApprovalsScreen />
    </LazyTabScreen>
  ),
  Settings: () => (
    <LazyTabScreen>
      <SettingsScreen />
    </LazyTabScreen>
  ),
};

function HermesTabNavigator() {
  const { settings } = useGateway();

  // Chat is ALWAYS in this list — resolveInitialTab always lands on Hermes (Chat).
  // Never drop the Chat tab, or the operator is stranded on Leash/Settings.
  const tabOrder = resolveTabOrder(settings);

  return (
    <Tab.Navigator
      initialRouteName={resolveInitialTab(settings)}
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
        // Android: hide tab bar so adjustResize can lift the composer; manual lift still runs as backup.
        tabBarHideOnKeyboard: Platform.OS === 'android',
      }}
    >
      {tabOrder.map((name) => (
        <Tab.Screen key={name} name={name} children={TAB_SCREENS[name]} />
      ))}
    </Tab.Navigator>
  );
}

// Glassmorphic bottom tab bar
function GlassmorphicTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { pendingApprovals, activateDeveloperLeashUnlock } = useGateway();
  const pendingCount = pendingApprovals.length;
  const insets = useSafeAreaInsets();
  const { inset: keyboardInset } = useKeyboardInset();
  const keyboardOpen = keyboardInset > 0;
  const leashDevTapCountRef = useRef(0);
  const leashDevTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const registerLeashDeveloperTap = () => {
    leashDevTapCountRef.current += 1;
    if (leashDevTapTimerRef.current) {
      clearTimeout(leashDevTapTimerRef.current);
    }
    leashDevTapTimerRef.current = setTimeout(() => {
      leashDevTapCountRef.current = 0;
    }, 2500);
    if (leashDevTapCountRef.current >= 7) {
      leashDevTapCountRef.current = 0;
      void activateDeveloperLeashUnlock().then(() => {
        Alert.alert('Leash unlocked', 'Developer backdoor active on this phone.');
      });
    }
  };

  useEffect(() => {
    return () => {
      if (leashDevTapTimerRef.current) {
        clearTimeout(leashDevTapTimerRef.current);
      }
    };
  }, []);

  return (
    <View
      style={[
        styles.navBar,
        keyboardOpen ? styles.navBarKeyboardHidden : null,
        {
          paddingBottom: keyboardOpen ? 0 : Math.max(insets.bottom, 8),
          opacity: keyboardOpen ? 0 : 1,
        },
      ]}
      pointerEvents={keyboardOpen ? 'none' : 'auto'}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
          if (route.name === 'Leash') {
            registerLeashDeveloperTap();
          }
          console.log('[hermes-mobile] Tab pressed:', route.name, 'isFocused:', isFocused);
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        let label = tabLabelFor(route.name as keyof RootTabParamList);

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.navItem}
            activeOpacity={0.8}
            onPress={onPress}
            onLongPress={onLongPress}
            testID={tabTestIdFor(route.name as keyof RootTabParamList)}
            accessibilityLabel={label}
          >
            <View style={styles.navIcon}>
              <TabBarIcon
                routeName={route.name as keyof RootTabParamList}
                focused={isFocused}
                color={isFocused ? colors.secondary : colors.textMuted}
                size={22}
              />
            </View>
            <Text style={[styles.navText, isFocused && styles.navTextActive]}>
              {label}
            </Text>
            {route.name === 'Leash' && pendingCount > 0 ? (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
              </View>
            ) : null}
            {isFocused && <View style={styles.activeDot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const NavigationTheme = {
  dark: true,
  colors: {
    primary: colors.primary,
    background: colors.backgroundStart,
    card: 'rgba(9, 11, 20, 0.94)',
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

const linking = {
  prefixes: ['hermes://'],
  config: {
    screens: {
      Leash: 'leash',
      Chat: 'chat',
      Settings: 'settings',
    },
  },
};

function HermesNavigationRoot() {
  const navigationRef = useRef<NavigationContainerRef<RootTabParamList>>(null);
  const {
    runAgentTool,
    refreshHealth,
    applySetupDeepLink,
    saveSettings,
    settings,
    apiKey,
    focusChatSession,
    activateDeveloperLeashUnlock,
    injectSmokeApproval,
    activateStoreLeashPreview,
    retryGatewayBootstrap,
  } = useGateway();
  const applySetupDeepLinkWithThumbgate = useCallback(
    async (params: SetupDeepLinkParams) => {
      await applySetupDeepLink(params);
      const thumbgateKey = params.thumbgateApiKey?.trim();
      if (!thumbgateKey) {
        return;
      }
      const nextKey = params.apiKey?.trim() || apiKey;
      const nextSettings = params.gatewayUrl?.trim()
        ? {
            ...settings,
            gatewayUrl: params.gatewayUrl.trim(),
            connectionMode: 'relay' as const,
            demoMode: false,
          }
        : settings;
      await saveSettings(nextSettings, nextKey, thumbgateKey);
    },
    [applySetupDeepLink, apiKey, saveSettings, settings],
  );
  const forceE2eDemoMode = useCallback(async () => {
    if (!isDemoModeAllowed()) {
      return;
    }
    await saveSettings(
      {
        ...settings,
        demoMode: true,
        glanceMode: false,
        developerLeashUnlock: true,
        thumbgateProActive: true,
      },
      apiKey,
    );
    await retryGatewayBootstrap();
  }, [apiKey, retryGatewayBootstrap, saveSettings, settings]);
  useHermesDeepLinks(
    navigationRef,
    runAgentTool,
    refreshHealth,
    applySetupDeepLinkWithThumbgate,
    focusChatSession,
    activateDeveloperLeashUnlock,
    forceE2eDemoMode,
    injectSmokeApproval,
    activateStoreLeashPreview,
  );

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer
        ref={navigationRef}
        theme={NavigationTheme}
        linking={linking}
        onStateChange={(state) => {
          const route = state?.routes[state.index ?? 0];
          if (route?.name) {
            void trackScreenView(route.name);
          }
        }}
      >
        <HermesTabNavigator />
      </NavigationContainer>
    </View>
  );
}

function HermesAppShell() {
  const { isLoaded } = useGateway();

  useEffect(() => {
    if (isLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [isLoaded]);

  if (!isLoaded) {
    return (
      <View style={styles.bootstrap} testID="hermes-bootstrap">
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.bootstrapText}>Loading Hermes…</Text>
      </View>
    );
  }

  return (
    <>
      <View style={{ flex: 1 }}>
        <HermesNavigationRoot />
      </View>
      <ConnectMacGate />
    </>
  );
}

function App() {
  useEffect(() => {
    void trackAppOpen();
    // Flush any crashes persisted from a previous (crashed) launch now that the
    // process is healthy. Non-blocking; failures are retained for next launch.
    void flushCrashQueue();
    // Safety net: never leave the native splash covering a working UI.
    void SplashScreen.hideAsync();
    const splashFallback = setTimeout(() => {
      void SplashScreen.hideAsync();
    }, 2500);
    return () => clearTimeout(splashFallback);
  }, []);
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        {__DEV__ ? <DevToolsBootstrap /> : null}
        <GatewayProvider>
          <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Decorative Shifting Background Glows (Glassmorphic Ambient Light) */}
            <View style={styles.ambientGlowPrimary} />
            <View style={styles.ambientGlowSecondary} />

            <HermesAppShell />
          </View>
        </GatewayProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

// Wrap the root with Sentry's error boundary / touch / profiling integrations.
// Coexists with the user-facing <ErrorBoundary> above; harmless when Sentry is
// not initialized (no DSN).
export default withCrashReporting(App);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundStart,
    position: 'relative',
  },
  ambientGlowPrimary: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(79, 70, 229, 0.08)', // Indigo glow
    opacity: 0.8,
    pointerEvents: 'none',
  },
  ambientGlowSecondary: {
    position: 'absolute',
    bottom: 50,
    right: -100,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(34, 211, 238, 0.06)', // Cyan glow
    opacity: 0.8,
    pointerEvents: 'none',
  },
  navBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(9, 11, 20, 0.94)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  navBarKeyboardHidden: {
    height: 0,
    overflow: 'hidden',
    paddingTop: 0,
    borderTopWidth: 0,
    elevation: 0,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  navIcon: {
    marginBottom: 4,
  },
  navText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  navTextActive: {
    color: colors.secondary,
    textShadowColor: 'rgba(99, 102, 241, 0.4)',
    textShadowRadius: 6,
  },
  activeDot: {
    position: 'absolute',
    bottom: -2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
  },
  pendingBadge: {
    position: 'absolute',
    top: 2,
    right: 18,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  pendingBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.text,
  },
  bootstrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: colors.backgroundStart,
  },
  bootstrapText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundStart,
  },
});
