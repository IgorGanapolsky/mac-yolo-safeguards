import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, LogBox } from 'react-native';

LogBox.ignoreAllLogs(true);

import { NavigationContainer, type NavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAiSdkDevTools } from '@react-native-ai/dev-tools/react-native';
import { colors } from './src/theme/colors';
import { GatewayProvider, useGateway } from './src/context/GatewayContext';
import { resolveInitialTab } from './src/utils/leashUx';
import ApprovalsScreen from './src/screens/ApprovalsScreen';
import ChatScreen from './src/screens/ChatScreen';
import OpsScreen from './src/screens/OpsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import ConnectMacGate from './src/components/ConnectMacGate';
import { useHermesDeepLinks } from './src/hooks/useHermesDeepLinks';
import { useKeyboardInset } from './src/hooks/useKeyboardInset';
import { trackAppOpen, trackScreenView } from './src/services/productAnalytics';
import { LEASH_TAB_LABEL } from './src/constants/monetization';

type RootTabParamList = {
  Leash: undefined;
  Chat: undefined;
  Ops: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

function HermesTabNavigator() {
  const { settings } = useGateway();
  const glance = settings.glanceMode;

  return (
    <Tab.Navigator
      initialRouteName={resolveInitialTab(settings)}
      tabBar={(props) => <GlassmorphicTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      {glance ? (
        <>
          <Tab.Screen name="Leash" component={ApprovalsScreen} />
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </>
      ) : (
        <>
          <Tab.Screen name="Chat" component={ChatScreen} />
          <Tab.Screen name="Leash" component={ApprovalsScreen} />
          <Tab.Screen name="Ops" component={OpsScreen} />
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </>
      )}
    </Tab.Navigator>
  );
}

// Glassmorphic bottom tab bar
function GlassmorphicTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { pendingApprovals } = useGateway();
  const pendingCount = pendingApprovals.length;
  const insets = useSafeAreaInsets();
  const { inset: keyboardInset } = useKeyboardInset();

  if (keyboardInset > 0) {
    return null;
  }

  return (
    <View style={[styles.navBar, { paddingBottom: Math.max(insets.bottom, 8), height: 56 + Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
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

        let emoji = '⚡';
        let label = LEASH_TAB_LABEL;

        if (route.name === 'Leash') {
          emoji = '⚡';
          label = LEASH_TAB_LABEL;
        } else if (route.name === 'Chat') {
          emoji = '💬';
          label = 'Chat';
        } else if (route.name === 'Ops') {
          emoji = '💻';
          label = 'Ops';
        } else if (route.name === 'Settings') {
          emoji = '⚙️';
          label = 'Settings';
        }

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.navItem}
            activeOpacity={0.8}
            onPress={onPress}
            onLongPress={onLongPress}
            testID={label}
            accessibilityLabel={label}
          >
            <Text style={[styles.navIcon, isFocused && styles.navIconActive]}>
              {emoji}
            </Text>
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
      Ops: 'ops',
      Settings: 'settings',
    },
  },
};

function HermesNavigationRoot() {
  const navigationRef = useRef<NavigationContainerRef<RootTabParamList>>(null);
  const { runAgentTool, refreshHealth, applySetupDeepLink } = useGateway();
  useHermesDeepLinks(navigationRef, runAgentTool, refreshHealth, applySetupDeepLink);

  return (
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
  );
}

export default function App() {
  useAiSdkDevTools();
  useEffect(() => {
    void trackAppOpen();
  }, []);
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <GatewayProvider>
          <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Decorative Shifting Background Glows (Glassmorphic Ambient Light) */}
            <View style={styles.ambientGlowPrimary} />
            <View style={styles.ambientGlowSecondary} />

            <HermesNavigationRoot />
            <ConnectMacGate />
          </View>
        </GatewayProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

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
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  navIcon: {
    fontSize: 20,
    opacity: 0.5,
    marginBottom: 4,
  },
  navIconActive: {
    opacity: 1,
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
});
