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
  /** Bootstrap / silent heal — avoid flashing unreachable copy on cold start. */
  connectionPending?: boolean;
  testID?: string;
};

export function greetingSubtitle(
  routeLabel?: string,
  isConnected = false,
  connectionPending = false,
): string {
  const route = routeLabel?.trim();
  const isGeneric = route
    ? /^(mac|computer|your mac|your computer|my mac|mac via usb|computer via usb|mac via network|http|https)$/i.test(route)
    : false;

  if (route === 'Hermes Relay' || route === 'Hermes Mobile account' || route === 'Hermes account relay') {
    return 'Ask anything — Chat needs a computer link (Tailscale / USB / Home Wi‑Fi). Hermes Relay is for cloud approvals only.';
  }

  if (route === 'Computer not configured') {
    return 'Computer URL is incomplete — open Settings to pick or add a computer.';
  }

  // Connected must win over silent-heal "Trying to reach…" — header + empty state
  // share truth (dual-state crisis: green Connected + heal flag still true).
  if (isConnected) {
    if (route && !isGeneric) {
      return `Ask anything — connected via ${route}.`;
    }
    return 'Ask anything.';
  }

  if (connectionPending) {
    if (route && !isGeneric) {
      return `Trying to reach ${route} automatically…`;
    }
    return 'Trying to reach your computer automatically…';
  }

  if (route && !isGeneric) {
    return `Can't reach ${route} yet — tap header to retry.`;
  }

  // Never market USB as the only path — Tailscale / Find computers / picker are primary off-cable.
  return 'Ask anything. Find computers or pick one above to connect — USB is optional.';
}

export default function ChatEmptyGreeting({
  routeLabel,
  isConnected = false,
  connectionPending = false,
  testID = 'chat-empty-greeting',
}: ChatEmptyGreetingProps) {
  const greeting = greetingForTime();
  const subtitle = greetingSubtitle(routeLabel, isConnected, connectionPending);

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
