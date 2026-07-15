import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BottomSheetModal from './BottomSheetModal';
import { colors } from '../theme/colors';

export type AttachPickerOption = 'photos' | 'file';

type AttachPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (option: AttachPickerOption) => void;
};

export default function AttachPickerSheet({
  visible,
  onClose,
  onSelect,
}: AttachPickerSheetProps) {
  return (
    <BottomSheetModal visible={visible} onClose={onClose} testID="attach-picker-sheet">
      <View style={styles.header}>
        <Text style={styles.title}>Attach</Text>
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close attach picker"
          testID="attach-picker-close"
        >
          <Text style={styles.close}>Close</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Add an image or text file to your message.</Text>
      <TouchableOpacity
        style={styles.option}
        onPress={() => onSelect('photos')}
        accessibilityRole="button"
        testID="attach-picker-photos"
      >
        <Text style={styles.optionTitle}>Photo library</Text>
        <Text style={styles.optionSubtitle}>Images from your gallery</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.option}
        onPress={() => onSelect('file')}
        accessibilityRole="button"
        testID="attach-picker-file"
      >
        <Text style={styles.optionTitle}>File</Text>
        <Text style={styles.optionSubtitle}>Text files, markdown, JSON, and code</Text>
      </TouchableOpacity>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  close: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.secondary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 16,
    lineHeight: 18,
  },
  option: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
});
