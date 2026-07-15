import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import {
  checkAndApplyAppUpdate,
  getInstalledOtaInfo,
  isOtaUpdatesEnabled,
  type InstalledOtaInfo,
} from '../services/appOtaUpdate';

function shortId(id: string | null): string {
  if (!id) {
    return 'none (embedded or unknown)';
  }
  return id.length > 16 ? `${id.slice(0, 12)}…` : id;
}

export default function AppUpdatesCard() {
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [info, setInfo] = useState<InstalledOtaInfo>(() => getInstalledOtaInfo());

  const appVersion =
    Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? 'unknown';

  const meta = useMemo(() => {
    const source = info.isEmbeddedLaunch ? 'embedded' : 'OTA';
    return [
      `Channel: ${info.channel}`,
      `Runtime: ${info.runtimeVersion}`,
      `Bundle: ${shortId(info.updateId)} (${source})`,
      `App version: ${appVersion}`,
    ].join('\n');
  }, [appVersion, info]);

  const handleCheck = useCallback(async () => {
    haptics.selection();
    setBusy(true);
    setStatusLine('Checking Expo production updates…');
    try {
      setInfo(getInstalledOtaInfo());
      if (!isOtaUpdatesEnabled()) {
        setStatusLine(
          'OTA is off in this build (dev/E2E). Release/store builds check channel "production" on each cold start.',
        );
        return;
      }
      setStatusLine('Checking for a newer JS bundle…');
      const result = await checkAndApplyAppUpdate();
      setInfo(getInstalledOtaInfo());
      setStatusLine(result.message);
      if (result.status === 'current' || result.status === 'available') {
        haptics.success();
      } else if (result.status === 'error' || result.status === 'disabled') {
        haptics.warning();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update check failed';
      setStatusLine(message);
      haptics.warning();
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <View style={styles.wrap} testID="app-updates-card">
      <Text style={styles.title}>App updates</Text>
      <Text style={styles.subtitle}>
        JS fixes ship over the air (EAS Update). Auto-check runs on cold start; apply usually needs
        a full app restart. Tap below to check now and restart if a newer bundle exists.
      </Text>
      <Text style={styles.meta} testID="app-updates-meta">
        {meta}
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => void handleCheck()}
        disabled={busy}
        testID="app-updates-check"
        accessibilityLabel="Check for app update"
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.secondary} />
        ) : (
          <Text style={styles.buttonText}>Check for update</Text>
        )}
      </TouchableOpacity>
      {statusLine ? (
        <Text style={styles.status} testID="app-updates-status">
          {statusLine}
        </Text>
      ) : (
        <Text style={styles.hint} testID="app-updates-hint">
          “No newer update” means Expo has nothing newer on this channel/runtime — not that you
          opened a buried Tools menu.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 16,
  },
  meta: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: 'monospace',
    lineHeight: 15,
  },
  button: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.45)',
    backgroundColor: 'rgba(34, 197, 94, 0.16)',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.success,
  },
  status: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  hint: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 14,
  },
});
