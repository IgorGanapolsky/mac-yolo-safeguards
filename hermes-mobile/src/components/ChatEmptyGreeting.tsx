import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function greetingForTime(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

type ChatEmptyGreetingProps = {
  /** Only for routes not already shown in the chat header (e.g. unpaired relay). */
  routeLabel?: string;
  isConnected?: boolean;
  testID?: string;
};

export function greetingSubtitle(routeLabel?: string, isConnected = false): string {
  const route = routeLabel?.trim();
  const isGeneric = route
    ? /^(mac|computer|your mac|my mac|mac via usb|mac via network)$/i.test(route)
    : false;

  if (route === 'Hermes account relay') {
    return 'Ask anything — pair Hermes relay for Wi‑Fi, cellular, or USB when you are away from your Mac.';
  }

  if (isConnected) {
    if (route && !isGeneric) {
      return `Ask anything — connected via ${route}.`;
    }
    return 'Ask anything.';
  }

  if (route && !isGeneric) {
    return `Can't reach ${route} yet — tap header to retry.`;
  }

  return 'Ask anything. Plug in USB or pick a computer above to connect.';
}

export default function ChatEmptyGreeting({
  routeLabel,
  isConnected = false,
  testID = 'chat-empty-greeting',
}: ChatEmptyGreetingProps) {
  const greeting = greetingForTime();
  const subtitle = greetingSubtitle(routeLabel, isConnected);

  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.greeting} testID="chat-empty-greeting-title">
        {greeting}
      </Text>
      <Text style={styles.subtitle} testID="chat-empty-greeting-subtitle">
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    gap: 8,
  },
  greeting: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    color: colors.textMuted,
    textAlign: 'center',
  },
});
