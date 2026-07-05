import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

type ComposerErrorBannerProps = {
  message: string;
  onDismiss: () => void;
  actionLabel?: string;
  onAction?: () => void;
};

export default function ComposerErrorBanner({
  message,
  onDismiss,
  actionLabel,
  onAction,
}: ComposerErrorBannerProps) {
  return (
    <View style={styles.container} testID="chat-operational-error">
      <View style={styles.body}>
        <Text style={styles.text} testID="composer-error-banner-text">
          {message}
        </Text>
        {actionLabel && onAction ? (
          <TouchableOpacity onPress={onAction} testID="chat-stop-mac-run">
            <Text style={styles.action}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Dismiss error"
      >
        <Text style={styles.close}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 8,
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
  text: {
    color: colors.error,
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 1,
  },
  action: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  close: {
    color: colors.error,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
});
