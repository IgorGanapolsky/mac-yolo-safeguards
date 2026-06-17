import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGateway } from '../context/GatewayContext';
import GlassCard from '../components/GlassCard';
import HealthPill from '../components/HealthPill';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import {
  getCapabilities,
  listJobs,
  listSkills,
  listToolsets,
  pauseJob,
  resumeJob,
  runJobNow,
} from '../services/hermesGatewayClient';
import type { HermesCronJob, HermesSkill, HermesToolset } from '../types/gatewayApi';

const DEMO_SKILLS: HermesSkill[] = [
  { name: 'mac-freeze-rescue', description: 'Rescue frozen / sluggish Mac', category: 'ops' },
  { name: 'verify-answerguard-fix', description: 'Full AnswerGuard verification contract', category: 'qa' },
];

const DEMO_JOBS: HermesCronJob[] = [
  { id: 'demo-1', name: 'yolo-health', schedule: '0 */6 * * *', paused: false },
  { id: 'demo-2', name: 'hermes-audit', schedule: '0 9 * * 1', paused: true },
];

export default function OpsScreen() {
  const { settings, apiKey, health, connectionState, refreshHealth } = useGateway();
  const isDemo = settings.demoMode || connectionState === 'demo';

  const [skills, setSkills] = useState<HermesSkill[]>([]);
  const [toolsets, setToolsets] = useState<HermesToolset[]>([]);
  const [jobs, setJobs] = useState<HermesCronJob[]>([]);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean | string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const loadOps = useCallback(async () => {
    if (isDemo) {
      setSkills(DEMO_SKILLS);
      setToolsets([
        { name: 'terminal', label: 'Terminal', enabled: true, configured: true, tools: ['run_command'] },
        { name: 'files', label: 'Files', enabled: true, configured: true, tools: ['read_file', 'write_file'] },
      ]);
      setJobs(DEMO_JOBS);
      setFeatureFlags({ session_chat_streaming: true, run_approval_response: true, skills_api: true });
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const [caps, skillList, toolsetList, jobList] = await Promise.all([
        getCapabilities(settings.gatewayUrl, apiKey),
        listSkills(settings.gatewayUrl, apiKey),
        listToolsets(settings.gatewayUrl, apiKey),
        listJobs(settings.gatewayUrl, apiKey),
      ]);
      setFeatureFlags(caps.features ?? {});
      setSkills(skillList);
      setToolsets(toolsetList);
      setJobs(jobList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load gateway ops');
    } finally {
      setLoading(false);
    }
  }, [apiKey, isDemo, settings.gatewayUrl]);

  useEffect(() => {
    loadOps();
    refreshHealth();
  }, [loadOps, refreshHealth]);

  const handleJobAction = async (job: HermesCronJob, action: 'pause' | 'resume' | 'run') => {
    haptics.selection();
    if (isDemo) {
      haptics.success();
      return;
    }
    try {
      if (action === 'pause') await pauseJob(settings.gatewayUrl, job.id, apiKey);
      if (action === 'resume') await resumeJob(settings.gatewayUrl, job.id, apiKey);
      if (action === 'run') await runJobNow(settings.gatewayUrl, job.id, apiKey);
      haptics.success();
      await loadOps();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Job action failed');
      haptics.warning();
    }
  };

  const enabledFeatures = Object.entries(featureFlags).filter(([, v]) => v === true);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title} testID="OPS">OPS</Text>
        <Text style={styles.subtitle}>Skills, cron jobs, toolsets — same gateway as desktop</Text>
        <View style={styles.healthRow}>
          <HealthPill level={health?.level ?? 'unknown'} />
          {isDemo ? <Text style={styles.demoPill}>DEMO</Text> : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => {
              loadOps();
              refreshHealth();
            }}
            tintColor={colors.secondary}
          />
        }
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {loading && skills.length === 0 ? (
          <ActivityIndicator color={colors.secondary} style={styles.loader} />
        ) : null}

        <Text style={styles.sectionTitle}>Gateway features</Text>
        <GlassCard>
          <Text style={styles.meta}>
            {enabledFeatures.length > 0
              ? `${enabledFeatures.length} capabilities active on this gateway`
              : 'Connect gateway in Settings to discover features'}
          </Text>
          {enabledFeatures.slice(0, 8).map(([key]) => (
            <Text key={key} style={styles.featureLine}>✓ {key.replace(/_/g, ' ')}</Text>
          ))}
        </GlassCard>

        <Text style={styles.sectionTitle}>Skills ({skills.length})</Text>
        <GlassCard>
          {skills.length === 0 ? (
            <Text style={styles.meta}>No skills returned from /v1/skills</Text>
          ) : (
            skills.slice(0, 12).map((skill) => (
              <View key={skill.name} style={styles.listRow}>
                <Text style={styles.rowTitle}>{skill.name}</Text>
                {skill.description ? (
                  <Text style={styles.rowDesc} numberOfLines={2}>{skill.description}</Text>
                ) : null}
              </View>
            ))
          )}
        </GlassCard>

        <Text style={styles.sectionTitle}>Toolsets ({toolsets.length})</Text>
        <GlassCard>
          {toolsets.map((ts) => (
            <View key={ts.name} style={styles.listRow}>
              <Text style={styles.rowTitle}>
                {ts.label ?? ts.name}
                {ts.enabled ? ' · on' : ' · off'}
              </Text>
              <Text style={styles.rowDesc}>
                {ts.tools?.length ?? 0} tools{ts.configured ? ' · configured' : ''}
              </Text>
            </View>
          ))}
        </GlassCard>

        <Text style={styles.sectionTitle}>Cron jobs ({jobs.length})</Text>
        <GlassCard>
          {jobs.length === 0 ? (
            <Text style={styles.meta}>No jobs — create via CLI or desktop Cron page</Text>
          ) : (
            jobs.map((job) => (
              <View key={job.id} style={styles.jobRow}>
                <View style={styles.jobInfo}>
                  <Text style={styles.rowTitle}>{job.name ?? job.id}</Text>
                  <Text style={styles.rowDesc}>{job.schedule ?? 'no schedule'}</Text>
                </View>
                <View style={styles.jobActions}>
                  <TouchableOpacity
                    style={styles.jobBtn}
                    onPress={() => handleJobAction(job, 'run')}
                  >
                    <Text style={styles.jobBtnText}>Run</Text>
                  </TouchableOpacity>
                  {job.paused ? (
                    <TouchableOpacity
                      style={styles.jobBtn}
                      onPress={() => handleJobAction(job, 'resume')}
                    >
                      <Text style={styles.jobBtnText}>Resume</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.jobBtn}
                      onPress={() => handleJobAction(job, 'pause')}
                    >
                      <Text style={styles.jobBtnText}>Pause</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </GlassCard>

        <Text style={styles.sectionTitle}>Desktop parity (dashboard port)</Text>
        <GlassCard>
          <Text style={styles.meta}>
            Config, env vars, profiles, files, logs, analytics, MCP, and channels live on the
            Hermes web dashboard (separate from :8642). Mobile covers everything exposed on the
            gateway API server — chat, runs, skills, jobs, approvals.
          </Text>
        </GlassCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 1,
  },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  demoPill: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 16,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  meta: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  featureLine: { fontSize: 12, color: colors.secondary, marginTop: 4 },
  listRow: { marginBottom: 12 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  jobInfo: { flex: 1 },
  jobActions: { flexDirection: 'row', gap: 6 },
  jobBtn: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  jobBtnText: { fontSize: 11, fontWeight: '700', color: colors.secondary },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  errorText: { color: '#fca5a5', fontSize: 13 },
  loader: { marginVertical: 24 },
});
