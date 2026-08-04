import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import { sectionToggleAccessibilityLabel } from '../utils/settingsSectionCollapse';

type Props = {
  /** Header text — keep the count in it so a collapsed header still informs. */
  title: string;
  /** Optional explainer rendered under the header while expanded. */
  hint?: string;
  expanded: boolean;
  onToggle: () => void;
  testID?: string;
  /** testID for the title Text node, for suites that assert header copy. */
  titleTestID?: string;
  titleStyle?: StyleProp<TextStyle>;
  hintStyle?: StyleProp<TextStyle>;
  children?: React.ReactNode;
};

/**
 * A Settings card header that expands/collapses its body.
 *
 * The whole header is a real accessibility button carrying
 * `accessibilityState.expanded` — the chevron is decoration, never the only
 * signal that something is hidden.
 */
export default function CollapsibleSection({
  title,
  hint,
  expanded,
  onToggle,
  testID,
  titleTestID,
  titleStyle,
  hintStyle,
  children,
}: Props) {
  return (
    <View>
      <TouchableOpacity
        onPress={() => {
          haptics.selection();
          onToggle();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={sectionToggleAccessibilityLabel(title, expanded)}
        testID={testID}
        style={styles.header}
      >
        <Text style={[styles.title, titleStyle]} testID={titleTestID}>
          {title}
        </Text>
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {expanded ? (
        <>
          {hint ? <Text style={[styles.hint, hintStyle]}>{hint}</Text> : null}
          {children}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 40,
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 1,
  },
  chevron: {
    fontSize: 14,
    color: colors.textMuted,
  },
  hint: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 8,
    lineHeight: 16,
  },
});
