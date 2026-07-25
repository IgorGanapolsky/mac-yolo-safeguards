import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { memoryService } from '../services/memoryService';

interface QuickNoteModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function QuickNoteModal({ visible, onClose, onSaved }: QuickNoteModalProps) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await memoryService.saveNote(text.trim());
      setSaved(true);
      setText('');
      onSaved?.();
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  }, [text, onClose, onSaved]);

  const handleClose = useCallback(() => {
    setText('');
    setError(null);
    setSaved(false);
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.card}>
          {saved ? (
            <View style={styles.savedContainer}>
              <Text style={styles.savedText}>Saved to memory</Text>
            </View>
          ) : (
            <>
              <Text style={styles.title}>Quick Note</Text>
              <Text style={styles.subtitle}>Tap the mic icon on your keyboard to dictate</Text>
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={setText}
                placeholder="What should Hermes remember?"
                placeholderTextColor="#666"
                multiline
                autoFocus
                editable={!saving}
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleClose} disabled={saving}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, !text.trim() && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  disabled={!text.trim() || saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.saveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: '#2a2a4e',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#888',
    fontSize: 13,
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#0d0d1a',
    color: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#2a2a4e',
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 13,
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  cancelText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#6c5ce7',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  savedContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  savedText: {
    color: '#00d2a0',
    fontSize: 18,
    fontWeight: '700',
  },
});