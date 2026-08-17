import React, { useState, useEffect } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';

const VPS_HOST_KEY = '@hermes_cloud_vps_host_v1';
const VPS_API_KEY_KEY = '@hermes_cloud_vps_api_key_v1';
const CONTINUITY_ENABLED_KEY = '@hermes_cloud_continuity_enabled_v1';

interface CloudContinuitySheetProps {
  visible: boolean;
  onClose: () => void;
}

export const CloudContinuitySheet: React.FC<CloudContinuitySheetProps> = ({
  visible,
  onClose,
}) => {
  const [vpsHost, setVpsHost] = useState('');
  const [vpsApiKey, setVpsApiKey] = useState('');
  const [continuityEnabled, setContinuityEnabled] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (visible) {
      void AsyncStorage.getItem(VPS_HOST_KEY).then((val) => {
        if (val) setVpsHost(val);
      });
      void AsyncStorage.getItem(VPS_API_KEY_KEY).then((val) => {
        if (val) setVpsApiKey(val);
      });
      void AsyncStorage.getItem(CONTINUITY_ENABLED_KEY).then((val) => {
        if (val !== null) setContinuityEnabled(val === '1');
      });
    }
  }, [visible]);

  const handleSave = async () => {
    try {
      await AsyncStorage.setItem(VPS_HOST_KEY, vpsHost.trim());
      await AsyncStorage.setItem(VPS_API_KEY_KEY, vpsApiKey.trim());
      await AsyncStorage.setItem(
        CONTINUITY_ENABLED_KEY,
        continuityEnabled ? '1' : '0'
      );
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 800);
    } catch {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.sheetContainer}>
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.dragHandle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>☁️ Cloud Continuity & VPS Hub</Text>
              <Text style={styles.subtitle}>
                Keep sessions, memory, and bots live 24/7 in your cloud sandbox
              </Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Live Continuity Toggle */}
            <View style={styles.toggleCard}>
              <View style={styles.toggleTextGroup}>
                <Text style={styles.toggleTitle}>Session Continuity</Text>
                <Text style={styles.toggleSubtitle}>
                  Persist threads, memory context, and active runs across mobile and desktop
                </Text>
              </View>
              <Switch
                value={continuityEnabled}
                onValueChange={setContinuityEnabled}
                trackColor={{ false: 'rgba(255, 255, 255, 0.1)', true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* VPS Connection Settings */}
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionHeader}>VPS SANDBOX ENDPOINT</Text>

              <Text style={styles.inputLabel}>VPS Host Address / Tailnet Node</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. vps.local:8799 or 100.x.y.z"
                placeholderTextColor={colors.textMuted}
                value={vpsHost}
                onChangeText={setVpsHost}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.inputLabel}>VPS Access Key (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Paste cloud pairing key"
                placeholderTextColor={colors.textMuted}
                value={vpsApiKey}
                onChangeText={setVpsApiKey}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* In-App Status & Architecture */}
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>🔒 Zero-External-Link Architecture</Text>
              <Text style={styles.infoBody}>
                Hermes Mobile connects directly to your own self-hosted VPS, Docker sandbox, or Mac mini. No external signups, no web redirects, and no shared third-party proxies.
              </Text>
            </View>

            {/* Save Button */}
            <Pressable
              style={[
                styles.saveButton,
                savedSuccess && styles.saveButtonSuccess,
              ]}
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>
                {savedSuccess ? '✓ Saved' : 'Save & Connect Cloud Sandbox'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#131722',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '82%',
    paddingBottom: 28,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingVertical: 14,
    gap: 14,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  toggleTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  toggleSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  sectionBlock: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.text,
    fontSize: 13,
  },
  infoCard: {
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.25)',
    padding: 12,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A5B4FC',
    marginBottom: 4,
  },
  infoBody: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveButtonSuccess: {
    backgroundColor: colors.success,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default CloudContinuitySheet;
