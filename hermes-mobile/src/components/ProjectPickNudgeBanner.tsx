import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

type ProjectPickNudgeBannerProps = {
  onPickProject: () => void;
  onDismiss?: () => void;
};

export default function ProjectPickNudgeBanner({
  onPickProject,
  onDismiss,
}: ProjectPickNudgeBannerProps) {
  return (
    <View style={styles.container} testID="project-pick-nudge-banner">
      <View style={styles.body}>
        <Text style={styles.title}>Pick a project</Text>
        <Text style={styles.text}>
          Send this prompt to the right workspace on your computer.
        </Text>
        <Pressable
          onPress={onPickProject}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          testID="project-pick-nudge-action"
          accessibilityRole="button"
          accessibilityLabel="Choose project"
        >
          <Text style={styles.actionText}>Choose project</Text>
        </Pressable>
      </View>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Dismiss project reminder"
          testID="project-pick-nudge-dismiss"
        >
          <Text style={styles.close}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
    gap: 8,
  },
  body: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  text: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  actionBtn: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  actionBtnPressed: {
    opacity: 0.8,
  },
  actionText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  close: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
});
