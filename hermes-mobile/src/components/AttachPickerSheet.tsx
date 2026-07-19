import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheetModal from './BottomSheetModal';
import { colors, Spacing } from '../theme/colors';

export type AttachPickerOption = 'photos' | 'camera' | 'file';

type AttachPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: AttachPickerOption) => void;
};

type OptionRow = {
  id: AttachPickerOption;
  testID: string;
  title: string;
  subtitle: string;
  glyph: string;
};

const OPTIONS: OptionRow[] = [
  {
    id: 'photos',
    testID: 'attach-picker-photos',
    title: 'Photos',
    subtitle: 'Images from your gallery',
    glyph: '🖼',
  },
  {
    id: 'camera',
    testID: 'attach-picker-camera',
    title: 'Camera',
    subtitle: 'Take a photo now',
    glyph: '📷',
  },
  {
    id: 'file',
    testID: 'attach-picker-file',
    title: 'Files',
    subtitle: 'Text, markdown, JSON, and code',
    glyph: '📄',
  },
];

export default function AttachPickerSheet({
  visible,
  onClose,
  onSelect,
}: AttachPickerSheetProps) {
  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      testID="attach-picker-sheet"
      contentStyle={styles.sheetContent}
    >
      <View style={styles.grabberWrap} accessibilityElementsHidden>
        <View style={styles.grabber} />
      </View>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Attach to message</Text>
          <Text style={styles.subtitle}>
            Images and text files are sent with your prompt.
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close attach picker"
          testID="attach-picker-close"
          hitSlop={12}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
        >
          <Text style={styles.closeLabel}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.list} testID="attach-picker-options">
        {OPTIONS.map((option) => (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            accessibilityRole="button"
            accessibilityLabel={option.title}
            testID={option.testID}
            style={({ pressed }) => [
              styles.optionRow,
              pressed && styles.optionRowPressed,
            ]}
          >
            <View style={styles.glyphWell}>
              <Text style={styles.glyph} allowFontScaling={false}>
                {option.glyph}
              </Text>
            </View>
            <View style={styles.labelBlock}>
              <Text style={styles.optionTitle}>{option.title}</Text>
              <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
            </View>
            <Text style={styles.chevron} allowFontScaling={false}>
              ›
            </Text>
          </Pressable>
        ))}
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  grabberWrap: {
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
    fontWeight: '500',
  },
  closeBtn: {
    minHeight: 36,
    minWidth: 52,
    paddingHorizontal: 10,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  closeBtnPressed: {
    backgroundColor: colors.cardBgHover,
  },
  closeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  list: {
    gap: 10,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 68,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
  },
  optionRowPressed: {
    backgroundColor: 'rgba(34, 211, 238, 0.09)',
    borderColor: 'rgba(34, 211, 238, 0.35)',
  },
  glyphWell: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  glyph: {
    fontSize: 22,
    lineHeight: 26,
  },
  labelBlock: {
    flex: 1,
    minWidth: 0,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  optionSubtitle: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
    fontWeight: '500',
  },
  chevron: {
    fontSize: 22,
    lineHeight: 24,
    color: colors.textMuted,
    fontWeight: '300',
    marginRight: 2,
  },
});
