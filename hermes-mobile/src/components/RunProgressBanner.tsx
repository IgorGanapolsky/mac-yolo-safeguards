import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { RunProgressState } from '../types/chatDisplay';
import { formatRunProgressLabel } from '../utils/chatStreamEvents';

type RunProgressBannerProps = {
  progress: RunProgressState;
};

export default function RunProgressBanner({ progress }: RunProgressBannerProps) {
  const [label, setLabel] = useState(() => formatRunProgressLabel(progress));

  useEffect(() => {
    setLabel(formatRunProgressLabel(progress));
    const timer = setInterval(() => {
      setLabel(formatRunProgressLabel(progress));
    }, 1000);
    return () => clearInterval(timer);
  }, [progress.startedAtMs, progress.detail, progress.phase]);

  return (
    <View style={styles.banner} testID="run-progress-banner">
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.warning,
    lineHeight: 18,
  },
});
