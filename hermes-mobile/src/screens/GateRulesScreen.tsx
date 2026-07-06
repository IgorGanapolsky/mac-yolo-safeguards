import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GlassCard from '../components/GlassCard';
import LeashProUpsellBanner from '../components/LeashProUpsellBanner';
import { colors } from '../theme/colors';
import { useGateway } from '../context/GatewayContext';
import {
  deleteGateRule,
  listGateRules,
  updateGateRuleDecision,
} from '../services/gateRulesClient';
import type { GateRule } from '../types/gateRule';
import { isLeashProEnabled } from '../utils/leashPro';

type GateRulesScreenProps = {
  visible: boolean;
  onClose: () => void;
};

export default function GateRulesScreen({ visible, onClose }: GateRulesScreenProps) {
  const { settings, apiKey, effectiveGatewayUrl, patchSettings } = useGateway();
  const proEnabled = isLeashProEnabled(settings);
  const gatewayUrl = effectiveGatewayUrl || settings.gatewayUrl;

  const [rules, setRules] = useState<GateRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | undefined>();

  const unlockLeashPro = useCallback(async () => {
    await patchSettings({ thumbgateProActive: true });
  }, [patchSettings]);

  const loadRules = useCallback(async () => {
    if (!proEnabled) {
      return;
    }
    setLoading(true);
    try {
      const result = await listGateRules(gatewayUrl, apiKey, { demoMode: settings.demoMode });
      setRules(result.rules);
      setUnavailableReason(result.unavailableReason);
    } finally {
      setLoading(false);
    }
  }, [apiKey, gatewayUrl, proEnabled, settings.demoMode]);

  useEffect(() => {
    if (visible && proEnabled) {
      void loadRules();
    }
  }, [visible, proEnabled, loadRules]);

  const handleToggleDecision = async (rule: GateRule) => {
    if (settings.demoMode) {
      setRules((prev) =>
        prev.map((item) =>
          item.id === rule.id
            ? { ...item, decision: item.decision === 'allow' ? 'block' : 'allow' }
            : item,
        ),
      );
      return;
    }
    const nextDecision = rule.decision === 'allow' ? 'block' : 'allow';
    setBusyRuleId(rule.id);
    try {
      await updateGateRuleDecision(gatewayUrl, rule.id, nextDecision, apiKey);
      setRules((prev) =>
        prev.map((item) => (item.id === rule.id ? { ...item, decision: nextDecision } : item)),
      );
    } catch (error) {
      Alert.alert(
        'Could not update rule',
        error instanceof Error ? error.message : 'Gateway rejected the change.',
      );
    } finally {
      setBusyRuleId(null);
    }
  };

  const handleDeleteRule = (rule: GateRule) => {
    Alert.alert('Delete gate rule?', rule.pattern, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (settings.demoMode) {
              setRules((prev) => prev.filter((item) => item.id !== rule.id));
              return;
            }
            setBusyRuleId(rule.id);
            try {
              await deleteGateRule(gatewayUrl, rule.id, apiKey);
              setRules((prev) => prev.filter((item) => item.id !== rule.id));
            } catch (error) {
              Alert.alert(
                'Could not delete rule',
                error instanceof Error ? error.message : 'Gateway rejected the delete.',
              );
            } finally {
              setBusyRuleId(null);
            }
          })();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title} testID="gate-rules-screen-title">
            Gate rules
          </Text>
          <TouchableOpacity onPress={onClose} testID="gate-rules-close">
            <Text style={styles.close}>Done</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {!proEnabled ? (
            <GlassCard>
              <LeashProUpsellBanner
                onUnlocked={unlockLeashPro}
              />
            </GlassCard>
          ) : loading ? (
            <ActivityIndicator color={colors.primary} testID="gate-rules-loading" />
          ) : rules.length === 0 ? (
            <GlassCard testID="gate-rules-empty">
              <Text style={styles.emptyTitle}>No standing gate rules yet</Text>
              <Text style={styles.emptyBody}>
                {unavailableReason ??
                  'Approve “always allow” or deny with memory from chat — rules appear here when the gateway syncs them.'}
              </Text>
              <TouchableOpacity style={styles.refreshButton} onPress={() => void loadRules()}>
                <Text style={styles.refreshText}>Refresh</Text>
              </TouchableOpacity>
            </GlassCard>
          ) : (
            rules.map((rule) => (
              <GlassCard key={rule.id} style={styles.ruleCard} testID={`gate-rule-${rule.id}`}>
                <Text style={styles.rulePattern}>{rule.pattern}</Text>
                {rule.toolName ? (
                  <Text style={styles.ruleMeta}>Tool: {rule.toolName}</Text>
                ) : null}
                {rule.scope ? (
                  <Text style={styles.ruleMeta}>Scope: {rule.scope}</Text>
                ) : null}
                <View style={styles.ruleActions}>
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>
                      {rule.decision === 'allow' ? 'Allowed' : 'Blocked'}
                    </Text>
                    <Switch
                      value={rule.decision === 'allow'}
                      onValueChange={() => void handleToggleDecision(rule)}
                      disabled={busyRuleId === rule.id}
                      testID={`gate-rule-toggle-${rule.id}`}
                      trackColor={{ false: '#1F2937', true: colors.primary }}
                      thumbColor={rule.decision === 'allow' ? '#ffffff' : '#9CA3AF'}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteRule(rule)}
                    disabled={busyRuleId === rule.id}
                    testID={`gate-rule-delete-${rule.id}`}
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.backgroundStart,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  close: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.secondary,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  refreshButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  refreshText: {
    color: colors.secondary,
    fontWeight: '700',
  },
  ruleCard: {
    gap: 6,
  },
  rulePattern: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  ruleMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  ruleActions: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  deleteText: {
    color: colors.error,
    fontWeight: '700',
    fontSize: 13,
  },
});
