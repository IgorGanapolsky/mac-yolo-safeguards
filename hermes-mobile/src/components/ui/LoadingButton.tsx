import React from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors } from '../../theme/colors';

type LoadingButtonProps = {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export default function LoadingButton({
  label,
  loadingLabel,
  loading = false,
  disabled = false,
  onPress,
  variant = 'primary',
  testID,
  style,
}: LoadingButtonProps) {
  const busy = loading || disabled;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        busy && styles.busy,
        style,
      ]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy: loading }}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.text : colors.accent}
          size="small"
          style={styles.spinner}
        />
      ) : null}
      <Text
        style={[
          styles.label,
          variant === 'primary' ? styles.primaryLabel : styles.secondaryLabel,
        ]}
      >
        {loading ? loadingLabel ?? label : label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  busy: {
    opacity: 0.85,
  },
  spinner: {
    marginRight: 2,
  },
  label: {
    fontWeight: '800',
    fontSize: 15,
  },
  primaryLabel: {
    color: colors.text,
  },
  secondaryLabel: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
});
