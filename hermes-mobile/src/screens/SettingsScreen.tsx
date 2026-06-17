import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGateway } from '../context/GatewayContext';
import GlassCard from '../components/GlassCard';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';

export default function SettingsScreen() {
  const {
    settings,
    apiKey,
    isPaired,
    saveSettings,
    connectionState,
    injectDemoApproval,
    completePair,
    disconnectPair,
    requestTestIntercept,
  } = useGateway();

  const [cloudUrl, setCloudUrl] = useState(settings.cloudUrl);
  const [connectionMode, setConnectionMode] = useState(settings.connectionMode);
  const [pairCode, setPairCode] = useState('');
  const [gatewayUrl, setGatewayUrl] = useState(settings.gatewayUrl);
  const [usePortal, setUsePortal] = useState(settings.usePortal);
  const [redactPii, setRedactPii] = useState(settings.redactPii);
  const [notificationsEnabled, setNotificationsEnabled] = useState(settings.notificationsEnabled);
  const [demoMode, setDemoMode] = useState(settings.demoMode);
  const [inputApiKey, setInputApiKey] = useState(apiKey);
  const [isSaving, setIsSaving] = useState(false);

  // Sync state if context changes externally
  useEffect(() => {
    setCloudUrl(settings.cloudUrl);
    setConnectionMode(settings.connectionMode);
    setGatewayUrl(settings.gatewayUrl);
    setUsePortal(settings.usePortal);
    setRedactPii(settings.redactPii);
    setNotificationsEnabled(settings.notificationsEnabled);
    setDemoMode(settings.demoMode);
  }, [settings]);

  useEffect(() => {
    setInputApiKey(apiKey);
  }, [apiKey]);

  const handleSave = async () => {
    haptics.selection();
    setIsSaving(true);
    try {
      await saveSettings(
        {
          connectionMode,
          cloudUrl,
          gatewayUrl,
          usePortal,
          redactPii,
          notificationsEnabled,
          demoMode,
        },
        inputApiKey,
      );
      haptics.success();
      Alert.alert('Success', 'Gateway settings updated successfully.');
    } catch (err) {
      haptics.warning();
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDemo = (value: boolean) => {
    haptics.light();
    setDemoMode(value);
  };

  const handlePair = async () => {
    if (!pairCode.trim()) {
      Alert.alert('Pairing code required', 'Run Hermes Mobile Agent pairing on your Mac and enter the code shown in Terminal.');
      return;
    }
    try {
      await saveSettings(
        {
          connectionMode: 'relay',
          cloudUrl,
          gatewayUrl,
          usePortal,
          redactPii,
          notificationsEnabled,
          demoMode: false,
        },
        inputApiKey,
      );
      await completePair(pairCode);
      setPairCode('');
      Alert.alert('Paired', 'Hermes Mobile Leash tab is linked to your Mac approval relay.');
    } catch (err) {
      Alert.alert('Pairing failed', err instanceof Error ? err.message : 'Could not complete pairing');
    }
  };

  const handleTestIntercept = async () => {
    try {
      await requestTestIntercept();
      Alert.alert('Test sent', 'Check the Leash tab for a fake agent tool approval.');
    } catch (err) {
      Alert.alert('Test failed', err instanceof Error ? err.message : 'Could not inject test event');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title} testID="SETTINGS">SETTINGS</Text>
        <Text style={styles.subtitle}>Gateway tunnel for Chat + optional approval relay for Leash</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>💬 Hermes Chat (replaces Telegram)</Text>
        <GlassCard>
          <Text style={styles.description}>
            Your phone cannot reach Mac localhost. Paste your ngrok / Cloudflare tunnel URL or LAN IP
            (same gateway Hermes uses for Telegram — port 8642). API key is API_SERVER_KEY from ~/.hermes/.env.
          </Text>
          <View style={styles.spacer} />
          <Text style={styles.label}>Gateway URL / Tunnel</Text>
          <TextInput
            style={styles.input}
            value={gatewayUrl}
            onChangeText={setGatewayUrl}
            placeholder="https://xxxx.ngrok-free.app"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.spacer} />
          <Text style={styles.label}>Gateway API Key</Text>
          <TextInput
            style={styles.input}
            value={inputApiKey}
            onChangeText={setInputApiKey}
            placeholder="sk-..."
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.description}>
            Stored in the device keychain. Required for Chat tab session APIs.
          </Text>
        </GlassCard>

        <Text style={styles.sectionTitle}>🪢 Approval relay (Leash tab)</Text>
        <GlassCard>
          <Text style={styles.description}>
            Optional: pair with your Mac for tool approvals on LTE. On your Mac, run Hermes Mobile Agent
            pairing from the approval bridge — then enter the code below.
            This is not required for Chat; Chat uses the Hermes gateway tunnel above.
          </Text>
          <View style={styles.spacer} />
          <Text style={styles.label}>Cloud relay URL</Text>
          <TextInput
            style={styles.input}
            value={cloudUrl}
            onChangeText={setCloudUrl}
            placeholder="https://agentleash-cloud.fly.dev"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.spacer} />
          <Text style={styles.label}>Pairing code</Text>
          <TextInput
            style={styles.input}
            value={pairCode}
            onChangeText={setPairCode}
            placeholder="MOON-DUST"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.pairButton} onPress={handlePair}>
            <Text style={styles.pairButtonText}>
              {isPaired ? 'RE-LINK WITH NEW CODE' : 'PAIR WITH MAC'}
            </Text>
          </TouchableOpacity>
          {isPaired ? (
            <>
              <Text style={styles.pairedText}>Paired — mobile token stored in secure storage.</Text>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleTestIntercept}>
                <Text style={styles.secondaryButtonText}>⚡ Send test approval to Leash</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.unlinkButton} onPress={() => disconnectPair()}>
                <Text style={styles.unlinkButtonText}>Disconnect pairing</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </GlassCard>

        <Text style={styles.sectionTitle}>🔌 Leash connection mode</Text>
        <GlassCard>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Use approval relay (LTE)</Text>
              <Text style={styles.switchDesc}>Poll cloud queue (works on LTE)</Text>
            </View>
            <Switch
              value={connectionMode === 'relay'}
              onValueChange={(val) => {
                haptics.light();
                setConnectionMode(val ? 'relay' : 'gateway');
              }}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={connectionMode === 'relay' ? '#ffffff' : '#9CA3AF'}
            />
          </View>
        </GlassCard>

        {connectionMode === 'gateway' ? (
          <Text style={styles.sectionTitle}>🔗 Direct gateway events (Leash tab)</Text>
        ) : null}
        {connectionMode === 'gateway' ? (
        <GlassCard>
          <Text style={styles.description}>
            Leash tab listens on WebSocket /v1/events at the gateway URL above (tunnel required on LTE).
          </Text>
        </GlassCard>
        ) : null}

        {/* Safeguard Options */}
        <Text style={styles.sectionTitle}>🛡 Safeguard Rules</Text>
        <GlassCard>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Use Portal Tunnel</Text>
              <Text style={styles.switchDesc}>Route actions through Gateway Portal</Text>
            </View>
            <Switch
              value={usePortal}
              onValueChange={(val) => {
                haptics.light();
                setUsePortal(val);
              }}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={usePortal ? '#ffffff' : '#9CA3AF'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Redact PII & Secrets</Text>
              <Text style={styles.switchDesc}>Mask API keys and credentials in diffs</Text>
            </View>
            <Switch
              value={redactPii}
              onValueChange={(val) => {
                haptics.light();
                setRedactPii(val);
              }}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={redactPii ? '#ffffff' : '#9CA3AF'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Push Approvals</Text>
              <Text style={styles.switchDesc}>Notify when a high-risk tool is gated</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={(val) => {
                haptics.light();
                setNotificationsEnabled(val);
              }}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={notificationsEnabled ? '#ffffff' : '#9CA3AF'}
            />
          </View>
        </GlassCard>

        {/* Demo Mode */}
        <Text style={styles.sectionTitle}>🧪 Developer Tools</Text>
        <GlassCard>
          <View style={styles.switchRow}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>Demo & Sandbox Mode</Text>
              <Text style={styles.switchDesc}>Simulate approvals without a running server</Text>
            </View>
            <Switch
              value={demoMode}
              onValueChange={handleToggleDemo}
              testID="demo-mode-switch"
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={demoMode ? '#ffffff' : '#9CA3AF'}
            />
          </View>

          {demoMode && (
            <TouchableOpacity
              style={styles.demoButton}
              onPress={() => {
                haptics.light();
                injectDemoApproval();
              }}
              testID="inject-mock-approval"
            >
              <Text style={styles.demoButtonText}>⚡ Inject Mock Approval Request</Text>
            </TouchableOpacity>
          )}
        </GlassCard>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          testID="save-settings-button"
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? 'SAVING CONFIG...' : 'SAVE CONFIGURATION'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>
          Hermes Mobile v0.1.0 • {connectionMode === 'relay' ? 'Relay' : 'WS'}: {connectionState}
          {isPaired ? ' • paired' : ''}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundStart,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  scrollContent: {
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 14,
  },
  description: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
  },
  spacer: {
    height: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabelCol: {
    flex: 1,
    paddingRight: 16,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  switchDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 12,
  },
  demoButton: {
    marginTop: 16,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  demoButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
  },
  pairButton: {
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pairButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 0.5,
  },
  pairedText: {
    marginTop: 12,
    fontSize: 11,
    color: colors.success,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 12,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.accent,
  },
  unlinkButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  unlinkButtonText: {
    fontSize: 11,
    color: colors.error,
    fontWeight: '700',
  },
  saveButton: {
    marginTop: 24,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 1,
  },
  footerText: {
    textAlign: 'center',
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 24,
  },
});
