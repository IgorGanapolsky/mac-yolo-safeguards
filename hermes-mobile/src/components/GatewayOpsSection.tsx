import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useGateway } from '../context/GatewayContext';
import GlassCard from './GlassCard';
import HealthPill from './HealthPill';
import { colors } from '../theme/colors';
import { isDemoModeAllowed } from '../utils/demoModePolicy';
import { haptics } from '../services/haptics';
import {
  getCapabilities,
  listJobs,
  listSkills,
  listToolsets,
  pauseJob,
  resumeJob,
  runJobNow,
  setToolsetEnabled,
  deleteJob,
} from '../services/hermesGatewayClient';
import type { HermesCronJob, HermesSkill, HermesToolset } from '../types/gatewayApi';
import { formatCronSchedule } from '../utils/sessionDisplay';
import { formatToolsetLabel, toolsetStatusLine } from '../utils/opsToolsets';
import ConnectionHealthHub from './ConnectionHealthHub';
import AgentDashboardStrip from './AgentDashboardStrip';
import { buildAgentDashboardStats } from '../utils/agentDashboardStats';
import { formatGatewayModelPickerLabel, primaryGatewayModelLabel } from '../utils/gatewayCapabilitiesDisplay';
import { isMacGatewayHttpOk } from '../utils/gatewayConnection';

const DEMO_SKILLS: HermesSkill[] = [
  { name: 'mac-freeze-rescue', description: 'Rescue frozen / sluggish computer (macOS)', category: 'ops' },
  { name: 'verify-answerguard-fix', description: 'Full AnswerGuard verification contract', category: 'qa' },
];

const DEMO_JOBS: HermesCronJob[] = [
  { id: 'demo-1', name: 'yolo-health', schedule: '0 */6 * * *', paused: false },
  { id: 'demo-2', name: 'hermes-audit', schedule: '0 9 * * 1', paused: true },
];

export default function GatewayOpsSection() {
  const {
    settings,
    apiKey,
    health,
    connectionState,
    refreshHealth,
    autoConnectGateway,
    effectiveGatewayUrl,
  } = useGateway();
  const isDemo =
    isDemoModeAllowed() && (settings.demoMode || connectionState === 'demo');
  const gatewayUrl = effectiveGatewayUrl || settings.gatewayUrl;

  const [skills, setSkills] = useState<HermesSkill[]>([]);
  const [toolsets, setToolsets] = useState<HermesToolset[]>([]);
  const [jobs, setJobs] = useState<HermesCronJob[]>([]);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean | string>>({});
  const [gatewayModel, setGatewayModel] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [expandedToolsets, setExpandedToolsets] = useState<Set<string>>(new Set());
  const [togglingToolset, setTogglingToolset] = useState<string | null>(null);
  const togglingToolsetRef = useRef<string | null>(null);

  const applyToolsetsFromServer = useCallback((serverList: HermesToolset[]) => {
    setToolsets((prev) => {
      const pendingName = togglingToolsetRef.current;
      if (!pendingName) {
        return serverList;
      }
      const pending = prev.find((ts) => ts.name === pendingName);
      if (!pending) {
        return serverList;
      }
      return serverList.map((ts) =>
        ts.name === pendingName ? { ...ts, enabled: pending.enabled } : ts,
      );
    });
  }, []);

  const loadOps = useCallback(async (options?: { refresh?: boolean }) => {
    if (isDemo) {
      setSkills(DEMO_SKILLS);
      setGatewayModel('qwen3:8b-64k');
      setToolsets([
        { name: 'terminal', label: 'Terminal', enabled: true, configured: true, tools: ['run_command'] },
        { name: 'files', label: 'Files', enabled: true, configured: true, tools: ['read_file', 'write_file'] },
      ]);
      setJobs(DEMO_JOBS);
      setFeatureFlags({
        session_chat_streaming: true,
        run_approval_response: true,
        skills_api: true,
        toolsets_write: true,
      });
      return;
    }

    if (options?.refresh) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    setError(undefined);
    try {
      const [caps, skillList, toolsetList, jobList] = await Promise.all([
        getCapabilities(gatewayUrl, apiKey),
        listSkills(gatewayUrl, apiKey),
        listToolsets(gatewayUrl, apiKey),
        listJobs(gatewayUrl, apiKey),
      ]);
      setFeatureFlags(caps.features ?? {});
      setGatewayModel(primaryGatewayModelLabel(caps));
      setSkills(skillList);
      applyToolsetsFromServer(toolsetList);
      setJobs(jobList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gateway ops');
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [apiKey, applyToolsetsFromServer, isDemo, gatewayUrl]);

  useFocusEffect(
    useCallback(() => {
      void loadOps();
      void refreshHealth();
    }, [loadOps, refreshHealth]),
  );

  const handleRefresh = () => {
    haptics.selection();
    void loadOps({ refresh: true });
    void refreshHealth();
  };

  const handleToolsetToggle = async (toolset: HermesToolset, nextEnabled: boolean) => {
    haptics.selection();
    if (isDemo) {
      setToolsets((prev) =>
        prev.map((ts) => (ts.name === toolset.name ? { ...ts, enabled: nextEnabled } : ts)),
      );
      haptics.success();
      return;
    }

    const previousEnabled = toolset.enabled ?? false;
    if (nextEnabled === previousEnabled) {
      return;
    }

    togglingToolsetRef.current = toolset.name;
    setTogglingToolset(toolset.name);
    setToolsets((prev) =>
      prev.map((ts) => (ts.name === toolset.name ? { ...ts, enabled: nextEnabled } : ts)),
    );

    try {
      const result = await setToolsetEnabled(gatewayUrl, toolset.name, nextEnabled, apiKey);
      setToolsets((prev) =>
        prev.map((ts) => (ts.name === toolset.name ? { ...ts, enabled: result.enabled } : ts)),
      );
      haptics.success();
    } catch (err) {
      setToolsets((prev) =>
        prev.map((ts) => (ts.name === toolset.name ? { ...ts, enabled: previousEnabled } : ts)),
      );
      const message = err instanceof Error ? err.message : 'Toolset update failed';
      if (message.includes('404') || message.includes('Not Found')) {
        Alert.alert(
          'Gateway update required',
          'Your direct Hermes machine needs the latest api_server (PUT /v1/toolsets). Restart Hermes after updating.',
        );
      } else {
        Alert.alert('Could not update toolset', message);
      }
      haptics.warning();
    } finally {
      togglingToolsetRef.current = null;
      setTogglingToolset(null);
    }
  };

  const toggleToolsetExpanded = (name: string) => {
    setExpandedToolsets((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleJobAction = async (job: HermesCronJob, action: 'pause' | 'resume' | 'run' | 'delete') => {
    haptics.selection();
    if (action === 'delete') {
      Alert.alert(
        'Delete Cron Job',
        `Are you sure you want to delete the cron job "${job.name ?? job.id}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                if (isDemo) {
                  setJobs((prev) => prev.filter((j) => j.id !== job.id));
                } else {
                  await deleteJob(gatewayUrl, job.id, apiKey);
                  await loadOps({ refresh: true });
                }
                haptics.success();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Job deletion failed');
                haptics.warning();
              }
            },
          },
        ],
      );
      return;
    }

    if (isDemo) {
      haptics.success();
      return;
    }
    try {
      if (action === 'pause') await pauseJob(gatewayUrl, job.id, apiKey);
      if (action === 'resume') await resumeJob(gatewayUrl, job.id, apiKey);
      if (action === 'run') await runJobNow(gatewayUrl, job.id, apiKey);
      haptics.success();
      await loadOps({ refresh: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Job action failed');
      haptics.warning();
    }
  };

  const enabledFeatures = Object.entries(featureFlags).filter(([, v]) => v === true);
  const toolsetsWritable = featureFlags.toolsets_write === true || isDemo;
  const macHttpReachable = isMacGatewayHttpOk(health);
  const dashboardStats = buildAgentDashboardStats({
    toolsets,
    skills,
    jobs,
    gatewayModel,
    connectionState,
    health,
    macHttpReachable,
  });
  const modelPickerLabel = gatewayModel
    ? formatGatewayModelPickerLabel({
        object: 'capabilities',
        default_model: gatewayModel,
        models: [gatewayModel],
      })
    : 'Model routed on your computer';

  const handleRepairConnection = useCallback(async () => {
    await refreshHealth();
    await autoConnectGateway();
    await loadOps({ refresh: true });
  }, [autoConnectGateway, loadOps, refreshHealth]);

  return (
    <View testID="gateway-ops-section" accessible={true}>
      <ConnectionHealthHub
        connectionState={connectionState}
        health={health}
        macHttpReachable={macHttpReachable}
        gatewayModelLabel={modelPickerLabel}
        onRepairConnection={handleRepairConnection}
      />

      <AgentDashboardStrip stats={dashboardStats} />

      <View style={styles.healthRow}>
        <HealthPill level={health?.level ?? 'unknown'} />
        {isDemo ? <Text style={styles.demoPill}>DEMO</Text> : null}
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={handleRefresh}
          disabled={refreshing}
          testID="gateway-ops-refresh"
        >
          <Text style={styles.refreshBtnText}>{refreshing ? 'Refreshing…' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {initialLoading && skills.length === 0 ? (
        <ActivityIndicator color={colors.secondary} style={styles.loader} />
      ) : null}

      <Text style={styles.sectionTitle}>Toolsets ({toolsets.length})</Text>
      <Text style={styles.sectionHint}>
        Switches update platform_toolsets on your computer — what mobile Chat can call.
        {toolsetsWritable ? '' : ' Update gateway to enable toggles from phone.'}
      </Text>
      <GlassCard>
        {toolsets.length === 0 ? (
          <Text style={styles.meta}>No toolsets from /v1/toolsets</Text>
        ) : (
          toolsets.map((ts) => {
            const expanded = expandedToolsets.has(ts.name);
            const label = formatToolsetLabel(ts.label, ts.name);
            const busy = togglingToolset === ts.name;
            return (
              <View key={ts.name} style={styles.toolsetRow}>
                <View style={styles.toolsetHeader}>
                  <TouchableOpacity
                    style={styles.toolsetMain}
                    onPress={() => toggleToolsetExpanded(ts.name)}
                    accessibilityLabel={`${label} tools`}
                    testID={`toolset-row-${ts.name}`}
                  >
                    <View style={styles.toolsetText}>
                      <Text style={styles.rowTitle}>{label}</Text>
                      <Text style={styles.rowDesc}>{toolsetStatusLine(ts)}</Text>
                      {ts.description ? (
                        <Text style={styles.rowDesc} numberOfLines={expanded ? undefined : 2}>
                          {ts.description}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.expandHint}>{expanded ? '▾' : '▸'}</Text>
                  </TouchableOpacity>
                  <Switch
                    value={ts.enabled ?? false}
                    onValueChange={(value) => handleToolsetToggle(ts, value)}
                    disabled={busy || (!toolsetsWritable && !isDemo)}
                    trackColor={{ false: '#374151', true: colors.primary }}
                    thumbColor={ts.enabled ? '#ffffff' : '#9CA3AF'}
                    testID={`toolset-switch-${ts.name}`}
                  />
                </View>
                {expanded && ts.tools && ts.tools.length > 0 ? (
                  <View style={styles.toolList}>
                    {ts.tools.map((tool) => (
                      <Text key={tool} style={styles.toolName}>{tool}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </GlassCard>

      <Text style={styles.sectionTitle}>Cron jobs ({jobs.length})</Text>
      <GlassCard>
        {jobs.length === 0 ? (
          <Text style={styles.meta}>No jobs — create via CLI or desktop Cron page</Text>
        ) : (
          jobs.map((job) => (
            <View key={job.id} style={styles.jobRow}>
              <View style={styles.jobInfo}>
                <Text style={styles.rowTitle} numberOfLines={2}>{job.name ?? job.id}</Text>
                <Text style={styles.rowDesc}>{formatCronSchedule(job.schedule)}</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.jobActions}
              >
                <TouchableOpacity
                  style={styles.jobBtn}
                  onPress={() => handleJobAction(job, 'run')}
                  testID={`job-run-${job.id}`}
                >
                  <Text style={styles.jobBtnText}>Run</Text>
                </TouchableOpacity>
                {job.paused ? (
                  <TouchableOpacity
                    style={styles.jobBtn}
                    onPress={() => handleJobAction(job, 'resume')}
                    testID={`job-resume-${job.id}`}
                  >
                    <Text style={styles.jobBtnText}>Resume</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.jobBtn}
                    onPress={() => handleJobAction(job, 'pause')}
                    testID={`job-pause-${job.id}`}
                  >
                    <Text style={styles.jobBtnText}>Pause</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.jobBtnDelete}
                  onPress={() => handleJobAction(job, 'delete')}
                  testID={`job-delete-${job.id}`}
                  accessibilityLabel={`Delete cron job ${job.name ?? job.id}`}
                >
                  <Text style={styles.jobBtnDeleteText}>Delete</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          ))
        )}
      </GlassCard>

      <Text style={styles.sectionTitle}>Skills ({skills.length})</Text>
      <Text style={styles.sectionHint}>Read-only catalog from /v1/skills. Invoke via Chat.</Text>
      <GlassCard>
        {skills.length === 0 ? (
          <Text style={styles.meta}>No skills returned from /v1/skills</Text>
        ) : (
          skills.slice(0, 20).map((skill) => (
            <View key={skill.name} style={styles.listRow}>
              <Text style={styles.rowTitle}>{skill.name}</Text>
              {skill.description ? (
                <Text style={styles.rowDesc} numberOfLines={2}>{skill.description}</Text>
              ) : null}
            </View>
          ))
        )}
      </GlassCard>

      <Text style={styles.sectionTitle}>Gateway features</Text>
      <GlassCard>
        <Text style={styles.meta}>
          {enabledFeatures.length > 0
            ? `${enabledFeatures.length} capabilities active on this gateway`
            : 'Connect your computer above to discover features'}
        </Text>
        {enabledFeatures.slice(0, 8).map(([key]) => (
          <Text key={key} style={styles.featureLine}>✓ {key.replace(/_/g, ' ')}</Text>
        ))}
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  demoPill: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  refreshBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
  },
  refreshBtnText: { fontSize: 12, fontWeight: '700', color: colors.secondary },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 16,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  sectionHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 8,
    lineHeight: 16,
  },
  meta: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  featureLine: { fontSize: 12, color: colors.secondary, marginTop: 4 },
  listRow: { marginBottom: 12 },
  toolsetRow: {
    marginBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: 10,
  },
  toolsetHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolsetMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  toolsetText: { flex: 1 },
  expandHint: { fontSize: 14, color: colors.textMuted, paddingTop: 2 },
  toolList: { marginTop: 8, paddingLeft: 4 },
  toolName: { fontSize: 11, color: colors.secondary, marginBottom: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  jobRow: {
    marginBottom: 14,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: 12,
  },
  jobInfo: { flex: 1 },
  jobActions: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 4,
  },
  jobBtn: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  jobBtnText: { fontSize: 11, fontWeight: '700', color: colors.secondary },
  jobBtnDelete: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  jobBtnDeleteText: { fontSize: 11, fontWeight: '700', color: colors.error },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  errorText: { color: '#fca5a5', fontSize: 13 },
  loader: { marginVertical: 24 },
});
