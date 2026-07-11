import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import type { GatewayHealthSnapshot } from '../types/gateway';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';
import { resolveConnectionHealthLabel } from '../utils/agentDashboardStats';
import {
  checkAndApplyAppUpdate,
  checkForAppUpdate,
  isOtaUpdatesEnabled,
} from '../services/appOtaUpdate';

type ConnectionHealthHubProps = {
  connectionState: LeashConnectionState;
  health?: GatewayHealthSnapshot | null;
  macHttpReachable?: boolean;
  gatewayModelLabel?: string | null;
  onRepairConnection: () => Promise<void>;
};

function healthDotColor(
  connectionState: LeashConnectionState,
  health?: GatewayHealthSnapshot | null,
  macHttpReachable = false,
): string {
  if (connectionState === 'demo') {
    return colors.accent;
  }
  if (health?.authMismatch) {
    return colors.error;
  }
  if (macHttpReachable || health?.level === 'green') {
    return colors.success;
  }
  if (connectionState === 'connecting' || health?.level === 'amber') {
    return colors.warning;
  }
  return colors.error;
}

export default function ConnectionHealthHub({
  connectionState,
  health,
  macHttpReachable = false,
  gatewayModelLabel,
  onRepairConnection,
}: ConnectionHealthHubProps) {
  const [repairBusy, setRepairBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const appVersion =
    Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? 'unknown';
  const connectionLabel = resolveConnectionHealthLabel(
    connectionState,
    health,
    macHttpReachable,
  );
  const dotColor = healthDotColor(connectionState, health, macHttpReachable);

  const handleRepair = useCallback(async () => {
    haptics.selection();
    setRepairBusy(true);
    try {
      await onRepairConnection();
      haptics.success();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Repair failed';
      Alert.alert('Could not repair link', message);
      haptics.warning();
    } finally {
      setRepairBusy(false);
    }
  }, [onRepairConnection]);

  const handleCheckUpdate = useCallback(async () => {
    haptics.selection();
    setUpdateBusy(true);
    setUpdateMessage(null);
    try {
      if (!isOtaUpdatesEnabled()) {
        setUpdateMessage('OTA ships with store builds — you are on the latest native build.');
        return;
      }
      const check = await checkForAppUpdate();
      if (check.status === 'available') {
        const apply = await checkAndApplyAppUpdate();
        setUpdateMessage(apply.message);
        if (apply.status !== 'error') {
          haptics.success();
        }
        return;
      }
      setUpdateMessage(check.message);
      if (check.status === 'current') {
        haptics.success();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update check failed';
      setUpdateMessage(message);
      haptics.warning();
    } finally {
      setUpdateBusy(false);
    }
  }, []);

  return (
    <View style={styles.wrap} testID="connection-health-hub">
      <View style={styles.headerRow}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Connection health</Text>
          <Text style={styles.subtitle} testID="connection-health-label">
            {connectionLabel}
          </Text>
        </View>
        <Text style={styles.version} testID="connection-health-version">
          v{appVersion}
        </Text>
      </View>

      {gatewayModelLabel ? (
        <Text style={styles.modelLine} testID="connection-health-model" numberOfLines={2}>
          Routed model: {gatewayModelLabel}
        </Text>
      ) : null}

      {health?.hostname ? (
        <Text style={styles.hostLine} numberOfLines={1}>
          {health.hostname}
          {health.localIp ? ` · ${health.localIp}` : ''}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => void handleCheckUpdate()}
          disabled={updateBusy}
          testID="connection-health-check-update"
        >
          {updateBusy ? (
            <ActivityIndicator size="small" color={colors.secondary} />
          ) : (
            <Text style={styles.actionBtnText}>Check for update</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.repairBtn]}
          onPress={() => void handleRepair()}
          disabled={repairBusy}
          testID="connection-health-repair"
        >
          {repairBusy ? (
            <ActivityIndicator size="small" color={colors.warning} />
          ) : (
            <Text style={[styles.actionBtnText, styles.repairBtnText]}>Repair link</Text>
          )}
        </TouchableOpacity>
      </View>

      {updateMessage ? (
        <Text style={styles.updateMessage} testID="connection-health-update-message">
          {updateMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  version: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    fontFamily: 'monospace',
  },
  modelLine: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    fontFamily: 'monospace',
  },
  hostLine: {
    fontSize: 10,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  repairBtn: {
    borderColor: 'rgba(245, 158, 11, 0.45)',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.secondary,
  },
  repairBtnText: {
    color: colors.warning,
  },
  updateMessage: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
