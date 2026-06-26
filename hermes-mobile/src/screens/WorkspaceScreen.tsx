import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGateway } from '../context/GatewayContext';
import GlassCard from '../components/GlassCard';
import HealthPill from '../components/HealthPill';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';

interface LogLine {
  id: string;
  timestamp: string;
  source: 'YOLO' | 'GATEWAY' | 'AGENT' | 'SYSTEM';
  level: 'info' | 'warn' | 'error';
  message: string;
}

const INITIAL_LOGS: LogLine[] = [
  {
    id: '1',
    timestamp: '15:42:01',
    source: 'SYSTEM',
    level: 'info',
    message: 'Booting Hermes safeguard engine...',
  },
  {
    id: '2',
    timestamp: '15:42:02',
    source: 'YOLO',
    level: 'info',
    message: 'Daemon com.igor.shutdown-simulators active (run interval = 60s).',
  },
  {
    id: '3',
    timestamp: '15:42:05',
    source: 'GATEWAY',
    level: 'info',
    message: 'Successfully listening for pre-action gate hooks.',
  },
  {
    id: '4',
    timestamp: '15:42:10',
    source: 'YOLO',
    level: 'info',
    message: 'Memory free percentage: 18% (Threshold: 15%). OK.',
  },
  {
    id: '5',
    timestamp: '15:43:00',
    source: 'AGENT',
    level: 'info',
    message: 'Agent session d2bef5de initialized.',
  },
];

const MOCK_DIFFS = [
  {
    file: 'sim-runaway-guard.sh',
    type: 'modified',
    additions: 12,
    deletions: 4,
    diffText: '@@ -124,7 +124,15 @@\n-  if [ "$mem_pct" -lt 10 ]\n+  local min_pct=${YOLO_MEM_FREE_PCT_THRESHOLD:-15}\n+  if [ "$mem_pct" -lt "$min_pct" ]; then\n+    echo "[WARN] runaway simulators detected"\n+    osascript -e \'quit app "Simulator"\'\n+  fi',
  },
  {
    file: 'tools/revenue-control-checks.js',
    type: 'modified',
    additions: 2,
    deletions: 1,
    diffText: '@@ -50,4 +50,5 @@\n-  const limit = 5000;\n+  const limit = 10000;\n+  // double check entitlement state',
  },
];

export default function WorkspaceScreen() {
  const { health, refreshHealth, recentReclaims } = useGateway();
  const [logs, setLogs] = useState<LogLine[]>(INITIAL_LOGS);
  const [selectedDiff, setSelectedDiff] = useState<typeof MOCK_DIFFS[0] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const flatListRef = useRef<FlashListRef<LogLine>>(null);

  // Auto-scroll to end when logs append
  useEffect(() => {
    if (flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [logs]);

  // Simulate incoming real-time logs
  useEffect(() => {
    const logSources: LogLine['source'][] = ['YOLO', 'GATEWAY', 'AGENT', 'SYSTEM'];
    const messages = [
      'Heartbeat check: all systems operational.',
      'Active workspace telemetry polled.',
      'Simulators monitored. CPU usage is stable (2.4%).',
      'Pre-action rules successfully synced with RAG.',
      'Memory reclaim daemon completed evaluation.',
    ];

    const interval = setInterval(() => {
      const source = logSources[Math.floor(Math.random() * logSources.length)];
      const message = messages[Math.floor(Math.random() * messages.length)];
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes(),
      ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const newLog: LogLine = {
        id: String(Date.now()),
        timestamp: timeStr,
        source,
        level: Math.random() > 0.85 ? 'warn' : 'info',
        message,
      };

      setLogs((prev) => [...prev, newLog].slice(-50)); // Limit to last 50
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  const handleRefreshWorkspace = async () => {
    haptics.selection();
    setIsRefreshing(true);
    await refreshHealth();
    haptics.success();
    setIsRefreshing(false);
  };

  const selectDiffFile = (diff: typeof MOCK_DIFFS[0] | null) => {
    haptics.light();
    setSelectedDiff(diff);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title} testID="OPS">OPS</Text>
        <Text style={styles.subtitle}>Safeguard telemetry, git changes & logs</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Telemetry Status Overview */}
        <Text style={styles.sectionTitle}>📈 System Telemetry</Text>
        <GlassCard>
          <View style={styles.telemetryGrid}>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryLabel}>SIM RUNAWAY DAEMON</Text>
              <Text style={styles.telemetryValue}>state=running</Text>
              <Text style={styles.telemetrySub}>run interval: 60s</Text>
            </View>

            <View style={styles.telemetryDivider} />

            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryLabel}>YOLO RECLAIM</Text>
              <Text style={styles.telemetryValue}>
                {recentReclaims.length > 0 ? `${recentReclaims.length} fired` : '0 fires'}
              </Text>
              <Text style={styles.telemetrySub}>threshold: 15% free</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.gatewayRow}>
            <View>
              <Text style={styles.gatewayLabel}>GATEWAY AGENT HOST</Text>
              <Text style={styles.gatewayValue}>PID: {health?.pid ?? 'N/A'}</Text>
            </View>
            <TouchableOpacity onPress={handleRefreshWorkspace} style={styles.refreshBtn}>
              {isRefreshing ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.refreshBtnText}>REFRESH</Text>
              )}
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* Real-time Logs Console */}
        <Text style={styles.sectionTitle}>📺 Real-time Telemetry Logs</Text>
        <GlassCard style={styles.logsCard}>
          <FlashList
            ref={flatListRef}
            data={logs}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.logRow}>
                <Text style={styles.logTime}>{item.timestamp}</Text>
                <Text
                  style={[
                    styles.logSource,
                    item.source === 'YOLO' && styles.sourceYolo,
                    item.source === 'GATEWAY' && styles.sourceGateway,
                  ]}
                >
                  [{item.source}]
                </Text>
                <Text
                  style={[
                    styles.logMessage,
                    item.level === 'warn' && styles.logWarn,
                    item.level === 'error' && styles.logError,
                  ]}
                >
                  {item.message}
                </Text>
              </View>
            )}
          />
        </GlassCard>

        {/* Active Workspace Git Diff */}
        <Text style={styles.sectionTitle}>📂 Uncommitted Changes</Text>
        <GlassCard>
          {MOCK_DIFFS.map((diff) => (
            <TouchableOpacity
              key={diff.file}
              style={[styles.diffItem, selectedDiff?.file === diff.file && styles.diffItemActive]}
              onPress={() => selectDiffFile(selectedDiff?.file === diff.file ? null : diff)}
            >
              <View style={styles.diffHeader}>
                <Text style={styles.diffFile}>{diff.file}</Text>
                <View style={styles.diffStat}>
                  <Text style={styles.diffAdd}>+{diff.additions}</Text>
                  <Text style={styles.diffDel}>-{diff.deletions}</Text>
                </View>
              </View>
              <Text style={styles.diffType}>{diff.type}</Text>
            </TouchableOpacity>
          ))}

          {selectedDiff && (
            <View style={styles.diffDetails}>
              <Text style={styles.diffDetailsTitle}>Lines modified in {selectedDiff.file}:</Text>
              <ScrollView horizontal style={styles.diffScroll}>
                <Text style={styles.diffCode}>{selectedDiff.diffText}</Text>
              </ScrollView>
            </View>
          )}
        </GlassCard>
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
  telemetryGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  telemetryItem: {
    flex: 1,
  },
  telemetryLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  telemetryValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.accent,
    marginVertical: 4,
  },
  telemetrySub: {
    fontSize: 10,
    color: colors.textMuted,
  },
  telemetryDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.borderLight,
    marginHorizontal: 16,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 14,
  },
  gatewayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gatewayLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  gatewayValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
  },
  refreshBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  refreshBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.accent,
  },
  logsCard: {
    padding: 12,
    backgroundColor: '#05070B',
    borderColor: 'rgba(79, 70, 229, 0.1)',
  },
  logRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  logTime: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: colors.textMuted,
    marginRight: 6,
  },
  logSource: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: colors.primary,
    fontWeight: '700',
    marginRight: 6,
  },
  sourceYolo: {
    color: colors.accent,
  },
  sourceGateway: {
    color: colors.success,
  },
  logMessage: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: colors.textSecondary,
    flex: 1,
    flexWrap: 'wrap',
  },
  logWarn: {
    color: colors.warning,
  },
  logError: {
    color: colors.error,
  },
  diffItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  diffItemActive: {
    borderBottomColor: colors.primary,
  },
  diffHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  diffFile: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  diffStat: {
    flexDirection: 'row',
    gap: 8,
  },
  diffAdd: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.success,
  },
  diffDel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
  },
  diffType: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  diffDetails: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#05070B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  diffDetailsTitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 6,
    fontWeight: '700',
  },
  diffScroll: {
    width: '100%',
  },
  diffCode: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
