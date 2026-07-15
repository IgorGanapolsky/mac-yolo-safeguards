import React, { useEffect } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { COMPOSER_KEYBOARD_GAP } from '../utils/composerKeyboard';
import { colors } from '../theme/colors';

type BottomSheetModalProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  dismissOnBackdropPress?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  animationType?: 'none' | 'slide' | 'fade';
  testID?: string;
};

export default function BottomSheetModal({
  visible,
  onClose,
  children,
  dismissOnBackdropPress = true,
  contentStyle,
  animationType = 'slide',
  testID,
}: BottomSheetModalProps) {
  const { inset: keyboardInset } = useKeyboardInset({ focused: visible });
  const keyboardLift =
    visible && keyboardInset > 0 ? keyboardInset + COMPOSER_KEYBOARD_GAP : 0;

  const contentLiftStyle =
    keyboardLift > 0 ? { marginBottom: keyboardLift } : undefined;

  useEffect(() => {
    if (!visible) {
      return;
    }
    // Sheets open over Chat — dismiss any composer IME so CTAs stay tappable.
    Keyboard.dismiss();
  }, [visible]);

  const handleBackdropPress = () => {
    Keyboard.dismiss();
    if (dismissOnBackdropPress) {
      onClose();
    }
  };

  const overlay = (
    <>
      <Pressable
        style={styles.backdrop}
        onPress={handleBackdropPress}
        accessibilityRole="button"
        accessibilityLabel="Close"
        testID={testID ? `${testID}-backdrop` : 'bottom-sheet-backdrop'}
      />
      <View
        style={[styles.content, contentStyle, contentLiftStyle]}
        testID={testID ? `${testID}-content` : 'bottom-sheet-content'}
      >
        {children}
      </View>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType={animationType}
      transparent
      onRequestClose={() => {
        Keyboard.dismiss();
        onClose();
      }}
      statusBarTranslucent
    >
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.overlay} behavior="padding" testID={testID}>
          {overlay}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.overlay} testID={testID}>
          {overlay}
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  content: {
    backgroundColor: '#0F1321',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
