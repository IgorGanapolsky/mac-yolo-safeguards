import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import BottomSheetModal from './BottomSheetModal';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import {
  getToolsetConfig,
  HermesGatewayApiError,
  saveToolsetEnv,
  setToolsetEnabled,
  setToolsetProvider,
} from '../services/hermesGatewayClient';
import type {
  HermesToolset,
  HermesToolsetConfig,
  HermesToolsetEnvVar,
  HermesToolsetProvider,
} from '../types/gatewayApi';
import {
  fallbackEnvFieldsForToolset,
  formatToolsetLabel,
} from '../utils/opsToolsets';

type IntegrationsSheetProps = {
  visible: boolean;
  toolset: HermesToolset | null;
  gatewayUrl: string;
  apiKey?: string | null;
  integrationsConfigAvailable: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function pickDefaultProvider(config: HermesToolsetConfig | null): HermesToolsetProvider | null {
  if (!config?.providers?.length) {
    return null;
  }
  return (
    config.providers.find((provider) => provider.is_active) ??
    config.providers.find((provider) => (provider.env_vars?.length ?? 0) > 0) ??
    config.providers[0]
  );
}

export default function IntegrationsSheet({
  visible,
  toolset,
  gatewayUrl,
  apiKey,
  integrationsConfigAvailable,
  onClose,
  onSaved,
}: IntegrationsSheetProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [config, setConfig] = useState<HermesToolsetConfig | null>(null);
  const [selectedProviderName, setSelectedProviderName] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [usedFallback, setUsedFallback] = useState(false);

  const label = formatToolsetLabel(toolset?.label, toolset?.name ?? 'Tool');

  const load = useCallback(async () => {
    if (!toolset || !visible) {
      return;
    }
    setLoading(true);
    setError(undefined);
    setConfig(null);
    setValues({});
    setUsedFallback(false);

    const applyFallback = () => {
      const fields = fallbackEnvFieldsForToolset(toolset.name);
      setUsedFallback(true);
      setConfig({
        name: toolset.name,
        has_category: fields.length > 0,
        providers: [
          {
            name: 'API key',
            tag: fields.length
              ? 'Saved on your Mac when your computer supports mobile key entry'
              : 'Configure on your Mac with hermes tools',
            env_vars: fields,
            is_active: true,
          },
        ],
      });
      setSelectedProviderName('API key');
    };

    if (!integrationsConfigAvailable) {
      applyFallback();
      setLoading(false);
      return;
    }

    try {
      const next = await getToolsetConfig(gatewayUrl, toolset.name, apiKey);
      setConfig(next);
      const provider = pickDefaultProvider(next);
      setSelectedProviderName(provider?.name ?? null);
    } catch (err) {
      if (err instanceof HermesGatewayApiError && (err.status === 404 || err.status === 501)) {
        applyFallback();
      } else {
        setError(err instanceof Error ? err.message : 'Could not load key settings');
        applyFallback();
      }
    } finally {
      setLoading(false);
    }
  }, [apiKey, gatewayUrl, integrationsConfigAvailable, toolset, visible]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedProvider = useMemo(() => {
    if (!config?.providers?.length) {
      return null;
    }
    return (
      config.providers.find((provider) => provider.name === selectedProviderName) ??
      pickDefaultProvider(config)
    );
  }, [config, selectedProviderName]);

  const envFields: HermesToolsetEnvVar[] = selectedProvider?.env_vars ?? [];
  const needsMacBrowser = Boolean(selectedProvider?.post_setup) && envFields.length === 0;
  const noKeyProvider = Boolean(selectedProvider) && envFields.length === 0 && !needsMacBrowser;

  const handleSave = async () => {
    if (!toolset) {
      return;
    }
    haptics.selection();
    setSaving(true);
    setError(undefined);
    try {
      if (noKeyProvider && selectedProvider?.name) {
        try {
          await setToolsetProvider(gatewayUrl, toolset.name, selectedProvider.name, apiKey);
        } catch (err) {
          if (!(err instanceof HermesGatewayApiError && err.status === 404)) {
            throw err;
          }
        }
      } else {
        const env: Record<string, string> = {};
        for (const field of envFields) {
          const value = values[field.key]?.trim();
          if (value) {
            env[field.key] = value;
          }
        }
        if (Object.keys(env).length === 0) {
          setError('Enter at least one key to save');
          haptics.warning();
          return;
        }
        await saveToolsetEnv(gatewayUrl, toolset.name, env, apiKey);
      }

      try {
        await setToolsetEnabled(gatewayUrl, toolset.name, true, apiKey);
      } catch {
        // Toggle may be unavailable on older Macs; key save still succeeded.
      }

      haptics.success();
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof HermesGatewayApiError && (err.status === 404 || err.status === 501)) {
        setError(
          'Your Mac needs a Hermes update to accept keys from the phone. On your Mac run: hermes tools',
        );
      } else {
        setError(err instanceof Error ? err.message : 'Could not save key');
      }
      haptics.warning();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose} testID="integrations-sheet">
      <Text style={styles.title} testID="integrations-sheet-title">
        {label}
      </Text>
      <Text style={styles.subtitle}>
        Keys are stored on your Mac. The phone only sends them over your paired link.
      </Text>

      {loading ? <ActivityIndicator color={colors.secondary} style={styles.loader} /> : null}

      {!loading && config?.providers && config.providers.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.providerRow}>
          {config.providers.map((provider) => {
            const active = provider.name === selectedProvider?.name;
            return (
              <TouchableOpacity
                key={provider.name}
                style={[styles.providerChip, active && styles.providerChipActive]}
                onPress={() => {
                  haptics.selection();
                  setSelectedProviderName(provider.name);
                }}
                testID={`integrations-provider-${provider.name}`}
              >
                <Text style={[styles.providerChipText, active && styles.providerChipTextActive]}>
                  {provider.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {!loading && selectedProvider?.tag ? (
        <Text style={styles.tag}>{selectedProvider.tag}</Text>
      ) : null}

      {!loading && needsMacBrowser ? (
        <View style={styles.macBox} testID="integrations-mac-browser">
          <Text style={styles.macTitle}>Finish on your Mac</Text>
          <Text style={styles.macBody}>
            This option opens a browser login on your computer. On your Mac run: hermes tools →{' '}
            {label}
          </Text>
        </View>
      ) : null}

      {!loading && noKeyProvider && !needsMacBrowser ? (
        <View style={styles.macBox} testID="integrations-no-key">
          <Text style={styles.macTitle}>No API key needed</Text>
          <Text style={styles.macBody}>
            Tap Save to use this free option on your Mac and turn the tool on for Chat.
          </Text>
        </View>
      ) : null}

      {!loading &&
        envFields.map((field) => (
          <View key={field.key} style={styles.field}>
            <Text style={styles.fieldLabel}>
              {field.prompt ?? field.key}
              {field.is_set ? ' · saved on Mac' : ''}
            </Text>
            <TextInput
              style={styles.input}
              value={values[field.key] ?? ''}
              onChangeText={(text) => setValues((prev) => ({ ...prev, [field.key]: text }))}
              placeholder={field.is_set ? '••••••••  (enter to replace)' : `Paste ${field.key}`}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              testID={`integrations-env-${field.key}`}
            />
            {field.url ? (
              <TouchableOpacity
                onPress={() => {
                  void Linking.openURL(field.url!);
                }}
                testID={`integrations-env-url-${field.key}`}
              >
                <Text style={styles.link}>Get key</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

      {usedFallback && !integrationsConfigAvailable ? (
        <Text style={styles.hint}>
          If Save fails, update Hermes on your Mac, or run hermes tools and paste the key there.
        </Text>
      ) : null}

      {error ? (
        <Text style={styles.error} testID="integrations-error">
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose} testID="integrations-cancel">
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={() => {
            void handleSave();
          }}
          disabled={saving || loading || needsMacBrowser}
          testID="integrations-save"
        >
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save & enable'}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 6 },
  subtitle: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 12 },
  loader: { marginVertical: 16 },
  providerRow: { marginBottom: 10, maxHeight: 40 },
  providerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    marginRight: 8,
  },
  providerChipActive: { backgroundColor: 'rgba(99, 102, 241, 0.35)' },
  providerChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  providerChipTextActive: { color: colors.text },
  tag: { fontSize: 12, color: colors.secondary, marginBottom: 10, lineHeight: 16 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  link: { marginTop: 6, fontSize: 12, fontWeight: '700', color: colors.secondary },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 16, marginBottom: 8 },
  error: { color: '#fca5a5', fontSize: 13, marginBottom: 8 },
  macBox: {
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  macTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 4 },
  macBody: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    alignItems: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  saveBtn: {
    flex: 1.2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
