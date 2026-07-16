import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors';
import { elapsedSecondsSince, formatElapsedDuration } from '../utils/formatElapsedDuration';

type ElapsedSinceProps = {
  sinceMs: number;
  prominent?: boolean;
  prefix?: string;
  testID?: string;
};

export default function ElapsedSince({
  sinceMs,
  prominent = false,
  prefix,
  testID = 'elapsed-since',
}: ElapsedSinceProps) {
  const [seconds, setSeconds] = useState(() => elapsedSecondsSince(sinceMs));

  useEffect(() => {
    const tick = () => setSeconds(elapsedSecondsSince(sinceMs));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [sinceMs]);

  const label = prefix ? `${prefix} ${formatElapsedDuration(seconds)}` : formatElapsedDuration(seconds);

  return (
    <Text
      style={[styles.base, prominent ? styles.prominent : styles.muted]}
      testID={testID}
      accessibilityLabel={label}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  prominent: {
    color: colors.warning,
  },
  muted: {
    color: colors.textMuted,
  },
});
