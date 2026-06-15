import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './src/theme/colors';
import { GatewayProvider } from './src/context/GatewayContext';
import ApprovalsScreen from './src/screens/ApprovalsScreen';
import WorkspaceScreen from './src/screens/WorkspaceScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ErrorBoundary from './src/components/ErrorBoundary';

type RootTabParamList = {
  Console: undefined;
  Workspace: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

// Custom premium Glassmorphic Tab Bar matching the LipoShield tab bar style
function GlassmorphicTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.navBar}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;

        const onPress = () => {
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
        let label = 'Console';

        if (route.name === 'Console') {
          emoji = '⚡';
          label = 'Console';
        } else if (route.name === 'Workspace') {
          emoji = '💻';
          label = 'Workspace';
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
          >
            <Text style={[styles.navIcon, isFocused && styles.navIconActive]}>
              {emoji}
            </Text>
            <Text style={[styles.navText, isFocused && styles.navTextActive]}>
              {label}
            </Text>
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

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <GatewayProvider>
          <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />

            {/* Decorative Shifting Background Glows (Glassmorphic Ambient Light) */}
            <View style={styles.ambientGlowPrimary} />
            <View style={styles.ambientGlowSecondary} />

            <NavigationContainer theme={NavigationTheme}>
              <Tab.Navigator
                tabBar={(props) => <GlassmorphicTabBar {...props} />}
                screenOptions={{
                  headerShown: false,
                  tabBarHideOnKeyboard: true,
                }}
              >
                <Tab.Screen name="Console" component={ApprovalsScreen} />
                <Tab.Screen name="Workspace" component={WorkspaceScreen} />
                <Tab.Screen name="Settings" component={SettingsScreen} />
              </Tab.Navigator>
            </NavigationContainer>
          </SafeAreaView>
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
    height: 72,
    backgroundColor: 'rgba(9, 11, 20, 0.94)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: 8,
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
});
