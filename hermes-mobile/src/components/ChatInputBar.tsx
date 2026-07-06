import React, { memo, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  type ChatComposerAttachment,
  createComposerAttachmentId,
  attachmentChipTestId,
  truncateDocumentTextForGateway,
} from '../utils/chatAttachments';
import { extractDocumentText } from '../utils/documentContentExtractor';

/** Android multiline fields clip typed glyphs without vertical alignment + font padding fix. */
const androidComposerInputStyle = Platform.select({
  android: {
    textAlignVertical: 'center' as const,
    includeFontPadding: false,
    paddingTop: 8,
    paddingBottom: 8,
  },
  default: {},
});

type ChatInputBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSubmit: (latestText?: string) => void;
  placeholder: string;
  /** Muted styling when empty — button stays tappable so Android does not swallow the first tap. */
  sendMuted: boolean;
  sendLabel?: string;
  onSend: (latestText?: string) => void;
  /** Codex-style: square Stop replaces Send while Mac run is active and composer is empty. */
  showStop?: boolean;
  onStop?: () => void;
  stopLabel?: string;
  /** Increment to request keyboard focus (e.g. New chat +). */
  focusNonce?: number;
  attachments?: ChatComposerAttachment[];
  onAddAttachment?: (attachment: ChatComposerAttachment) => void;
  onRemoveAttachment?: (id: string) => void;
};

function ChatInputBar({
  value,
  onChangeText,
  onFocus,
  onBlur,
  onSubmit,
  placeholder,
  sendMuted,
  onSend,
  showStop = false,
  onStop,
  focusNonce = 0,
  attachments = [],
  onAddAttachment = () => {},
  onRemoveAttachment = () => {},
}: ChatInputBarProps) {
  const inputRef = useRef<TextInput>(null);
  const latestTextRef = useRef(value);
  const stopMode = showStop && !value.trim() && attachments.length === 0;
  const canSend =
    value.trim().length > 0 ||
    latestTextRef.current.trim().length > 0 ||
    attachments.length > 0;

  useEffect(() => {
    if (value.trim() || !latestTextRef.current.trim()) {
      latestTextRef.current = value;
    }
  }, [value]);

  useEffect(() => {
    if (focusNonce <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [focusNonce]);

  useEffect(() => {
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const sub = Keyboard.addListener(hideEvent, () => {
      if (inputRef.current?.isFocused()) {
        inputRef.current.blur();
      }
    });
    return () => {
      sub.remove();
    };
  }, []);

  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [linkText, setLinkText] = useState('');

  type AttachMenuOption = {
    id: string;
    label: string;
    onPress: () => void;
  };

  const closeAttachMenu = () => setAttachMenuVisible(false);

  const addImageAttachment = (asset: ImagePicker.ImagePickerAsset, fallbackName: string) => {
    onAddAttachment({
      id: createComposerAttachmentId('image'),
      kind: 'image',
      name: asset.fileName || fallbackName,
      uri: asset.uri,
      base64: asset.base64 ?? undefined,
      mimeType: asset.mimeType ?? 'image/jpeg',
      sizeBytes: asset.fileSize ?? undefined,
      width: asset.width,
      height: asset.height,
    });
  };

  const handleTakePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission denied', 'Camera permission is required to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets?.length) {
      addImageAttachment(result.assets[0], 'Photo.jpg');
    }
  };

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission denied', 'Photo library permission is required to pick images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets?.length) {
      addImageAttachment(result.assets[0], 'Image.jpg');
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/*',
          'application/json',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) {
        return;
      }
      const asset = result.assets[0];
      const extracted = await extractDocumentText(asset.uri, asset.name, asset.mimeType ?? undefined);
      if (!extracted.ok) {
        Alert.alert('Could not attach document', extracted.userMessage);
        return;
      }
      const { text, truncated } = truncateDocumentTextForGateway(extracted.text);
      onAddAttachment({
        id: createComposerAttachmentId('doc'),
        kind: 'document',
        name: truncated ? `${asset.name} (truncated)` : asset.name,
        uri: asset.uri,
        mimeType: asset.mimeType ?? undefined,
        sizeBytes: asset.size ?? undefined,
        textContent: text,
      });
    } catch {
      Alert.alert('Error', 'Failed to pick document.');
    }
  };

  const attachMenuOptions: AttachMenuOption[] = [
    {
      id: 'document',
      label: 'Document (PDF, Word, text)',
      onPress: () => {
        closeAttachMenu();
        void handlePickDocument();
      },
    },
    {
      id: 'photo-library',
      label: 'Photo library',
      onPress: () => {
        closeAttachMenu();
        void handlePickImage();
      },
    },
    {
      id: 'take-photo',
      label: 'Take photo',
      onPress: () => {
        closeAttachMenu();
        void handleTakePhoto();
      },
    },
    {
      id: 'paste-link',
      label: 'Paste link',
      onPress: () => {
        closeAttachMenu();
        setLinkModalVisible(true);
      },
    },
  ];

  return (
    <View style={styles.shell}>
      {attachments.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.attachmentsContainer}
          contentContainerStyle={styles.attachmentsContent}
          testID="composer-attachment-strip"
        >
          {attachments.map((attachment) => (
            <View
              key={attachment.id}
              style={styles.attachmentBadge}
              testID={attachmentChipTestId(attachment)}
            >
              <Text numberOfLines={1} style={styles.attachmentText}>
                {attachment.kind === 'image' ? '🖼️ ' : attachment.kind === 'document' ? '📄 ' : '🔗 '}
                {attachment.name}
              </Text>
              <TouchableOpacity
                onPress={() => onRemoveAttachment(attachment.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.removeAttachmentButton}
                accessibilityLabel={`Remove ${attachment.name}`}
                testID={`composer-attachment-remove-${attachment.id}`}
              >
                <Text style={styles.removeAttachmentText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.inputBar}>
        <TouchableOpacity
          onPress={() => setAttachMenuVisible(true)}
          style={styles.attachButton}
          accessibilityLabel="Attach media or link"
          accessibilityRole="button"
          testID="composer-attach-button"
        >
          <Text style={styles.attachIcon}>+</Text>
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={[styles.input, androidComposerInputStyle]}
          value={value}
          onChangeText={(text) => {
            latestTextRef.current = text;
            onChangeText(text);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          cursorColor={colors.accent}
          underlineColorAndroid="transparent"
          editable
          multiline
          returnKeyType="send"
          blurOnSubmit={false}
          onFocus={onFocus}
          onBlur={() => {
            onBlur();
          }}
          onEndEditing={(event) => {
            const endedText = event.nativeEvent.text;
            if (endedText.trim() || !latestTextRef.current.trim()) {
              latestTextRef.current = endedText;
            }
          }}
          onSubmitEditing={(event) => {
            latestTextRef.current = event.nativeEvent.text;
            onSubmit(event.nativeEvent.text);
          }}
          testID="chat-input"
        />
        {stopMode ? (
          <TouchableOpacity
            style={styles.stopButton}
            onPress={onStop}
            testID="chat-stop-button"
            accessibilityLabel="Stop run"
          >
            <View style={styles.stopSquare} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendButton, !canSend && sendMuted && styles.sendButtonMuted]}
            onPress={() => {
              const latest = latestTextRef.current;
              latestTextRef.current = '';
              onSend(latest);
            }}
            testID="chat-send-button"
            accessibilityLabel="Send"
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={attachMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAttachMenu}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Attach to chat</Text>
            <Text style={styles.attachMenuSubtitle}>Choose what you would like to attach:</Text>
            {attachMenuOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                onPress={option.onPress}
                style={styles.attachMenuOption}
                testID={`composer-attach-option-${option.id}`}
              >
                <Text style={styles.attachMenuOptionText}>{option.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={closeAttachMenu}
              style={styles.attachMenuCancel}
              testID="composer-attach-cancel"
            >
              <Text style={styles.modalButtonTextCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={linkModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLinkModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Attach link</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="https://example.com"
              placeholderTextColor={colors.textMuted}
              value={linkText}
              onChangeText={setLinkText}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
              testID="composer-link-input"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setLinkModalVisible(false);
                  setLinkText('');
                }}
                style={styles.modalButton}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const trimmed = linkText.trim();
                  if (trimmed) {
                    onAddAttachment({
                      id: createComposerAttachmentId('link'),
                      kind: 'link',
                      name: trimmed,
                      url: trimmed,
                    });
                  }
                  setLinkModalVisible(false);
                  setLinkText('');
                }}
                style={styles.modalButton}
                testID="composer-link-attach-button"
              >
                <Text style={styles.modalButtonTextConfirm}>Attach</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default memo(ChatInputBar);

const styles = StyleSheet.create({
  shell: {
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
  },
  inputBar: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingBottom: 2,
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: colors.composerSurface,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 6,
    minHeight: 52,
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 0 : 8,
    color: colors.text,
    fontSize: 16,
    lineHeight: Platform.OS === 'android' ? undefined : 22,
    maxHeight: 120,
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonMuted: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  sendIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.backgroundStart,
    lineHeight: 20,
    marginTop: -1,
  },
  stopButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: colors.error,
  },
  attachmentsContainer: {
    maxHeight: 44,
    marginBottom: 8,
  },
  attachmentsContent: {
    paddingHorizontal: 8,
    gap: 8,
    alignItems: 'center',
  },
  attachmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  attachmentText: {
    fontSize: 12,
    color: colors.text,
    marginRight: 6,
    maxWidth: 120,
  },
  removeAttachmentButton: {
    padding: 2,
  },
  removeAttachmentText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: 'bold',
  },
  attachButton: {
    width: 32,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachIcon: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textMuted,
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.composerSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  attachMenuSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 12,
  },
  attachMenuOption: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  attachMenuOptionText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  attachMenuCancel: {
    paddingTop: 16,
    alignItems: 'center',
  },
  modalInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    padding: 10,
    color: colors.text,
    fontSize: 14,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalButtonTextCancel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  modalButtonTextConfirm: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
});
