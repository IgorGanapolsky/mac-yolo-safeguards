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
  probeToolsetsWriteAccess,
} from '../services/hermesGatewayClient';
import type { HermesCronJob, HermesSkill, HermesToolset } from '../types/gatewayApi';
import { formatCronSchedule } from '../utils/sessionDisplay';
import { buildCronJobDetailLines, isCronJobPaused } from '../utils/cronJobDetails';
import {
  configuredToolsetsToAutoEnable,
  formatToolsetLabel,
  markToolsetsEnabled,
  partitionMobileToolsets,
  toolsetAddKeyCtaLabel,
  toolsetNeedsApiKey,
  toolsetShowsKeyButton,
  toolsetStatusLine,
  toolsetsSectionHint,
  toolsetsNeedingKeys,
  capabilitiesAdvertiseToolsetsWrite,
} from '../utils/opsToolsets';
import ConnectionHealthHub from './ConnectionHealthHub';
import AgentDashboardStrip from './AgentDashboardStrip';
import IntegrationsSheet from './IntegrationsSheet';
import { buildAgentDashboardStats } from '../utils/agentDashboardStats';
import { formatGatewayModelPickerLabel, primaryGatewayModelLabel } from '../utils/gatewayCapabilitiesDisplay';
import {
  buildGatewayFeatureRows,
  gatewayFeatureIsPhoneToggleable,
} from '../utils/gatewayFeatureCatalog';
import { isMacGatewayHttpOk } from '../utils/gatewayConnection';
import {
  REPAIR_CONNECTION_TIMEOUT_MS,
  assertRepairSucceeded,
  refreshCredentialsFromPairServer,
  repairTimeoutMessage,
  runRepairGatewayLink,
} from '../utils/repairGatewayLink';
import { fetchGatewayHealth } from '../services/gatewayClient';
import { secureCredentials } from '../services/secureCredentials';
import { profileDisplayName } from '../services/gatewayProfiles';

type CatalogSection = 'capabilities' | 'skills' | 'toolsets' | 'jobs';

const CATALOG_REQUEST_TIMEOUT_MS = 8_000;

function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs: number,
  timeoutMessage?: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            timeoutMessage ??
              `${label} timed out after ${Math.round(timeoutMs / 1000)}s`,
          ),
        ),
      timeoutMs,
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function catalogRequest<T>(request: Promise<T>, section: CatalogSection): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${section} request timed out`)),
      CATALOG_REQUEST_TIMEOUT_MS,
    );
    request.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

const DEMO_SKILLS: HermesSkill[] = [
  { name: 'mac-freeze-rescue', description: 'Rescue frozen / sluggish computer (macOS)', category: 'ops' },
  { name: 'verify-answerguard-fix', description: 'Full AnswerGuard verification contract', category: 'qa' },
];

const DEMO_JOBS: HermesCronJob[] = [
  {
    id: 'demo-1',
    name: 'yolo-health',
    schedule: '0 */6 * * *',
    paused: false,
    prompt: 'Health-check Hermes gateway and write a short status note.',
    created_at: '2026-07-01T12:00:00.000Z',
    last_run_at: '2026-07-23T06:00:00.000Z',
    next_run_at: '2026-07-23T12:00:00.000Z',
    last_status: 'ok',
  },
  {
    id: 'demo-2',
    name: 'hermes-audit',
    schedule: '0 9 * * 1',
    paused: true,
    prompt: 'Weekly audit of mobile pair health and open todos.',
    created_at: '2026-06-20T09:00:00.000Z',
    last_run_at: '2026-07-21T09:00:00.000Z',
  },
];

export default function GatewayOpsSection() {
  const {
    settings,
    apiKey,
    health,
    connectionState,
    refreshHealth,
    autoConnectGateway,
    connectEvents,
    retryGatewayBootstrap,
    effectiveGatewayUrl,
    saveSettings,
    activeGatewayProfile,
  } = useGateway();
  const isDemo =
    isDemoModeAllowed() && (settings.demoMode || connectionState === 'demo');
  const gatewayUrl = effectiveGatewayUrl || settings.gatewayUrl;
  const repairMachineLabel = activeGatewayProfile
    ? profileDisplayName(activeGatewayProfile)
    : health?.hostname?.replace(/\.local$/i, '') || null;

  const [skills, setSkills] = useState<HermesSkill[]>([]);
  const [toolsets, setToolsets] = useState<HermesToolset[]>([]);
  const [jobs, setJobs] = useState<HermesCronJob[]>([]);
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean | string>>({});
  const [phoneToggleAvailable, setPhoneToggleAvailable] = useState<boolean | null>(null);
  const [gatewayModel, setGatewayModel] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [catalogErrors, setCatalogErrors] = useState<Partial<Record<CatalogSection, boolean>>>({});
  const [expandedToolsets, setExpandedToolsets] = useState<Set<string>>(new Set());
  const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set());
  const [expandedFeatureKeys, setExpandedFeatureKeys] = useState<Set<string>>(new Set());
  const [expandedSkillNames, setExpandedSkillNames] = useState<Set<string>>(new Set());
  const [advancedToolsetsOpen, setAdvancedToolsetsOpen] = useState(false);
  const [togglingToolset, setTogglingToolset] = useState<string | null>(null);
  const [integrationsToolset, setIntegrationsToolset] = useState<HermesToolset | null>(null);
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
      setPhoneToggleAvailable(true);
      return;
    }

    if (options?.refresh) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    setError(undefined);
    const markCatalogLoaded = (section: CatalogSection) => {
      setCatalogErrors((previous) => ({ ...previous, [section]: false }));
    };
    const markCatalogFailed = (section: CatalogSection) => {
      setCatalogErrors((previous) => ({ ...previous, [section]: true }));
    };

    try {
      const [loadedCapabilities, , loadedToolsets] = await Promise.all([
        catalogRequest(getCapabilities(gatewayUrl, apiKey), 'capabilities').then(
          (caps) => {
            setFeatureFlags(caps.features ?? {});
            setGatewayModel(primaryGatewayModelLabel(caps));
            markCatalogLoaded('capabilities');
            return caps;
          },
          () => {
            markCatalogFailed('capabilities');
            return null;
          },
        ),
        catalogRequest(listSkills(gatewayUrl, apiKey), 'skills').then(
          (skillList) => {
            setSkills(skillList);
            markCatalogLoaded('skills');
            return skillList;
          },
          () => {
            markCatalogFailed('skills');
            return null;
          },
        ),
        catalogRequest(listToolsets(gatewayUrl, apiKey), 'toolsets').then(
          (toolsetList) => {
            markCatalogLoaded('toolsets');
            return toolsetList;
          },
          () => {
            markCatalogFailed('toolsets');
            return null;
          },
        ),
        catalogRequest(listJobs(gatewayUrl, apiKey), 'jobs').then(
          (jobList) => {
            setJobs(jobList);
            markCatalogLoaded('jobs');
            return jobList;
          },
          () => {
            markCatalogFailed('jobs');
            return null;
          },
        ),
      ]);

      if (!loadedCapabilities || !loadedToolsets) {
        return;
      }

      let resolvedToolsets = loadedToolsets;
      let canWriteToolsets = capabilitiesAdvertiseToolsetsWrite(
        loadedCapabilities.features,
        loadedCapabilities.endpoints,
      );
      if (!canWriteToolsets) {
        const probeTarget =
          loadedToolsets.find((toolset) => toolset.configured) ?? loadedToolsets[0];
        if (probeTarget) {
          canWriteToolsets = await probeToolsetsWriteAccess(gatewayUrl, probeTarget, apiKey);
        }
      }
      setPhoneToggleAvailable(canWriteToolsets);

      const autoEnableTargets = canWriteToolsets
        ? configuredToolsetsToAutoEnable(loadedToolsets)
        : [];
      if (autoEnableTargets.length > 0) {
        // Ready toolsets are enabled by policy. Render that optimistic truth before
        // awaiting the gateway writes so the switches never flash false-disabled.
        const targetNames = new Set(autoEnableTargets.map((toolset) => toolset.name));
        applyToolsetsFromServer(markToolsetsEnabled(loadedToolsets, targetNames));

        const results = await Promise.allSettled(
          autoEnableTargets.map((toolset) =>
            setToolsetEnabled(gatewayUrl, toolset.name, true, apiKey),
          ),
        );
        const enabledNames = new Set<string>();
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.enabled) {
            enabledNames.add(autoEnableTargets[index].name);
          }
        });
        resolvedToolsets = markToolsetsEnabled(loadedToolsets, enabledNames);
        if (enabledNames.size !== autoEnableTargets.length) {
          setError(
            'Some ready tools could not be enabled automatically. Tap Refresh to retry.',
          );
        }
      }
      applyToolsetsFromServer(resolvedToolsets);
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
    if (nextEnabled && toolsetNeedsApiKey(toolset)) {
      setIntegrationsToolset(toolset);
      return;
    }

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
        setPhoneToggleAvailable(false);
        Alert.alert(
          'Enable on your Mac',
          'This Hermes build on your computer does not accept tool toggles from the phone yet. On your Mac run: hermes tools',
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

  const featureRows = buildGatewayFeatureRows(featureFlags);
  const toolsetsWritable = phoneToggleAvailable === true || isDemo;
  const phoneToggleBlocked = phoneToggleAvailable === false;
  const { essentials: essentialToolsets, advanced: advancedToolsets } =
    partitionMobileToolsets(toolsets);
  const keysNeeded = toolsetsNeedingKeys(essentialToolsets);
  const integrationsConfigAvailable =
    featureFlags.integrations_config === true || isDemo;
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
    : null;

  const renderToolsetRow = (ts: HermesToolset) => {
    const expanded = expandedToolsets.has(ts.name);
    const label = formatToolsetLabel(ts.label, ts.name);
    const busy = togglingToolset === ts.name;
    const needsKey = toolsetNeedsApiKey(ts);
    const showKeyButton = toolsetShowsKeyButton(ts);
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
              <Text style={styles.rowDesc}>
                {toolsetStatusLine(ts, { phoneToggleBlocked })}
              </Text>
              {ts.description ? (
                <Text style={styles.rowDesc} numberOfLines={expanded ? undefined : 2}>
                  {ts.description}
                </Text>
              ) : null}
            </View>
            <Text style={styles.expandHint}>{expanded ? '▾' : '▸'}</Text>
          </TouchableOpacity>
          {showKeyButton ? (
            <TouchableOpacity
              style={[styles.addKeyBtn, needsKey ? styles.addKeyBtnNeeded : null]}
              onPress={() => {
                haptics.selection();
                setIntegrationsToolset(ts);
              }}
              testID={`toolset-add-key-${ts.name}`}
              accessibilityLabel={`${toolsetAddKeyCtaLabel(ts)} for ${label}`}
            >
              <Text style={[styles.addKeyText, needsKey ? styles.addKeyTextNeeded : null]}>
                {toolsetAddKeyCtaLabel(ts)}
              </Text>
            </TouchableOpacity>
          ) : null}
          <Switch
            value={ts.enabled ?? false}
            onValueChange={(value) => handleToolsetToggle(ts, value)}
            disabled={busy}
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
  };

  const handleRepairConnection = useCallback(async () => {
    const probeUrl = effectiveGatewayUrl || settings.gatewayUrl;
    const result = await withTimeout(
      runRepairGatewayLink({
        gatewayUrl: probeUrl,
        machineLabel: repairMachineLabel,
        authMismatch: health?.authMismatch === true,
        ensureGatewayMode: async () => {
          if (settings.connectionMode === 'gateway') {
            return;
          }
          await saveSettings({ ...settings, connectionMode: 'gateway' }, apiKey);
        },
        refreshCredentials: async () => {
          const fresh = await refreshCredentialsFromPairServer({ gatewayUrl: probeUrl });
          if (!fresh) {
            return null;
          }
          await saveSettings(
            { ...settings, gatewayUrl: fresh.gatewayUrl, connectionMode: 'gateway' },
            fresh.apiKey,
          );
          return fresh;
        },
        reconnect: async () => {
          await autoConnectGateway();
          await refreshHealth();
          connectEvents();
          await retryGatewayBootstrap();
        },
        readHealth: async () => {
          const profileId = activeGatewayProfile?.id ?? null;
          const key = await secureCredentials.resolveApiKeyForProfile(profileId);
          const url = effectiveGatewayUrl || settings.gatewayUrl || probeUrl;
          return fetchGatewayHealth(url, key);
        },
      }),
      'Repair link',
      REPAIR_CONNECTION_TIMEOUT_MS,
      repairTimeoutMessage(REPAIR_CONNECTION_TIMEOUT_MS),
    );
    assertRepairSucceeded(result);
    // Catalog refresh is best-effort after a healed link — never starve credential repair.
    try {
      await loadOps({ refresh: true });
    } catch {
      // Health already green; Tools can Refresh manually.
    }
  }, [
    activeGatewayProfile?.id,
    apiKey,
    autoConnectGateway,
    connectEvents,
    effectiveGatewayUrl,
    health?.authMismatch,
    loadOps,
    refreshHealth,
    repairMachineLabel,
    retryGatewayBootstrap,
    saveSettings,
    settings,
  ]);

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

      <Text style={styles.sectionTitle} testID="toolsets-essentials-title">
        Essentials ({essentialToolsets.length})
      </Text>
      <Text style={styles.sectionHint}>
        {toolsetsSectionHint({
          phoneToggleAvailable: toolsetsWritable,
          keysNeededCount: keysNeeded.length,
        })}
      </Text>
      <GlassCard>
        {toolsets.length === 0 ? (
          <Text style={styles.meta} testID="toolsets-empty-state">
            {catalogErrors.toolsets
              ? 'Tools could not load from your computer. Tap Refresh to retry.'
              : 'No toolsets are installed on this computer.'}
          </Text>
        ) : essentialToolsets.length === 0 ? (
          <Text style={styles.meta} testID="toolsets-essentials-empty">
            No essential tools reported by your computer yet.
          </Text>
        ) : (
          essentialToolsets.map(renderToolsetRow)
        )}
      </GlassCard>

      {advancedToolsets.length > 0 ? (
        <>
          <TouchableOpacity
            onPress={() => {
              haptics.selection();
              setAdvancedToolsetsOpen((open) => !open);
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: advancedToolsetsOpen }}
            testID="toolsets-advanced-toggle"
          >
            <Text style={styles.sectionTitle}>
              On your Mac ({advancedToolsets.length}) {advancedToolsetsOpen ? '▾' : '▸'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.sectionHint}>
            Extra integrations already set up on this computer. Collapsed by default — not part of
            the Hermes Mobile essentials.
          </Text>
          {advancedToolsetsOpen ? (
            <GlassCard testID="toolsets-advanced-list">
              {advancedToolsets.map(renderToolsetRow)}
            </GlassCard>
          ) : null}
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Cron jobs ({jobs.length})</Text>
      <Text style={styles.sectionHint}>
        Tap a job name for schedule, last/next run, and purpose. Run / Pause / Delete stay one tap
        away.
      </Text>
      <GlassCard>
        {jobs.length === 0 ? (
          <Text style={styles.meta} testID="jobs-empty-state">
            {catalogErrors.jobs
              ? 'Scheduled jobs could not load from your computer. Tap Refresh to retry.'
              : 'No scheduled jobs yet.'}
          </Text>
        ) : (
          jobs.map((job) => {
            const expanded = expandedJobIds.has(job.id);
            const detailLines = buildCronJobDetailLines(job);
            return (
              <View key={job.id} style={styles.jobRow} testID={`job-row-${job.id}`}>
                <TouchableOpacity
                  onPress={() => {
                    setExpandedJobIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(job.id)) {
                        next.delete(job.id);
                      } else {
                        next.add(job.id);
                      }
                      return next;
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} details for ${job.name ?? job.id}`}
                  testID={`job-expand-${job.id}`}
                  style={styles.jobInfo}
                >
                  <View style={styles.jobTitleRow}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {job.name ?? job.id}
                    </Text>
                    <Text style={styles.expandHint}>{expanded ? '▾' : '▸'}</Text>
                  </View>
                  <Text style={styles.rowDesc}>{formatCronSchedule(job.schedule)}</Text>
                  {!expanded && job.prompt ? (
                    <Text style={styles.jobPurposePreview} numberOfLines={2}>
                      {job.prompt.replace(/\s+/g, ' ').trim()}
                    </Text>
                  ) : null}
                </TouchableOpacity>
                {expanded ? (
                  <View style={styles.jobDetails} testID={`job-details-${job.id}`}>
                    {detailLines.map((line) => (
                      <View key={`${job.id}-${line.label}`} style={styles.jobDetailRow}>
                        <Text style={styles.jobDetailLabel}>{line.label}</Text>
                        <Text style={styles.jobDetailValue} selectable>
                          {line.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
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
                  {isCronJobPaused(job) ? (
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
            );
          })
        )}
      </GlassCard>

      <Text style={styles.sectionTitle}>Skills ({skills.length})</Text>
      <Text style={styles.sectionHint}>
        Tap a skill for the full description. Skills are invoked from Chat — not toggled here.
      </Text>
      <GlassCard>
        {skills.length === 0 ? (
          <Text style={styles.meta} testID="skills-empty-state">
            {catalogErrors.skills
              ? 'Skills could not load from your computer. Tap Refresh to retry.'
              : 'No skills are installed on this computer.'}
          </Text>
        ) : (
          skills.map((skill) => {
            const expanded = expandedSkillNames.has(skill.name);
            return (
              <TouchableOpacity
                key={skill.name}
                style={styles.listRow}
                onPress={() => {
                  setExpandedSkillNames((prev) => {
                    const next = new Set(prev);
                    if (next.has(skill.name)) {
                      next.delete(skill.name);
                    } else {
                      next.add(skill.name);
                    }
                    return next;
                  });
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                testID={`skill-expand-${skill.name}`}
              >
                <View style={styles.jobTitleRow}>
                  <Text style={[styles.rowTitle, { flex: 1 }]}>{skill.name}</Text>
                  <Text style={styles.expandHint}>{expanded ? '▾' : '▸'}</Text>
                </View>
                {skill.description ? (
                  <Text style={styles.rowDesc} numberOfLines={expanded ? undefined : 2}>
                    {skill.description}
                  </Text>
                ) : (
                  <Text style={styles.rowDesc}>No description from the Mac.</Text>
                )}
                {expanded && skill.category ? (
                  <Text style={styles.jobDetailLabel}>Category · {skill.category}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </GlassCard>

      <Text style={styles.sectionTitle}>Gateway features ({featureRows.length})</Text>
      <Text style={styles.sectionHint}>
        What this Hermes build on your computer supports (protocol). Tap for details. These are not
        user prefs — turn tools on/off under Essentials above when the Mac allows phone toggles.
      </Text>
      <GlassCard testID="gateway-features-card">
        {catalogErrors.capabilities ? (
          <Text style={styles.meta}>
            Gateway features could not load. Tap Refresh to retry.
          </Text>
        ) : featureRows.length === 0 ? (
          <Text style={styles.meta}>
            Connect your computer above to discover features.
          </Text>
        ) : (
          featureRows.map((row) => {
            const expanded = expandedFeatureKeys.has(row.key);
            const toggleable = gatewayFeatureIsPhoneToggleable(row.key);
            return (
              <View key={row.key} style={styles.featureRow} testID={`feature-row-${row.key}`}>
                <View style={styles.featureHeader}>
                  <TouchableOpacity
                    onPress={() => {
                      setExpandedFeatureKeys((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.key)) {
                          next.delete(row.key);
                        } else {
                          next.add(row.key);
                        }
                        return next;
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${row.info.title}`}
                    testID={`feature-expand-${row.key}`}
                    style={styles.featureMain}
                  >
                    <View style={styles.jobTitleRow}>
                      <Text style={[styles.rowTitle, { flex: 1 }]} numberOfLines={2}>
                        {row.info.title}
                      </Text>
                      <Text style={styles.expandHint}>{expanded ? '▾' : '▸'}</Text>
                    </View>
                    <Text style={styles.rowDesc} numberOfLines={expanded ? undefined : 2}>
                      {row.info.summary}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.featureToggleCol}>
                    <Switch
                      value={row.active}
                      disabled={!toggleable}
                      onValueChange={() => {
                        // Protocol features are not phone-writable today.
                      }}
                      testID={`feature-switch-${row.key}`}
                      accessibilityLabel={
                        toggleable
                          ? `Toggle ${row.info.title}`
                          : `${row.info.title} is always on for this gateway`
                      }
                      accessibilityState={{ disabled: !toggleable, checked: row.active }}
                    />
                    <Text style={styles.featureToggleHint}>
                      {toggleable ? 'Phone' : 'On'}
                    </Text>
                  </View>
                </View>
                {expanded ? (
                  <View style={styles.jobDetails} testID={`feature-details-${row.key}`}>
                    <View style={styles.jobDetailRow}>
                      <Text style={styles.jobDetailLabel}>About</Text>
                      <Text style={styles.jobDetailValue} selectable>
                        {row.info.detail}
                      </Text>
                    </View>
                    <View style={styles.jobDetailRow}>
                      <Text style={styles.jobDetailLabel}>API flag</Text>
                      <Text style={styles.jobDetailValue} selectable>
                        {row.key}
                      </Text>
                    </View>
                    {row.valueLabel ? (
                      <View style={styles.jobDetailRow}>
                        <Text style={styles.jobDetailLabel}>Value</Text>
                        <Text style={styles.jobDetailValue} selectable>
                          {row.valueLabel}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.jobDetailRow}>
                      <Text style={styles.jobDetailLabel}>Control</Text>
                      <Text style={styles.jobDetailValue}>
                        {toggleable
                          ? 'Can be changed from this phone when the Mac allows it.'
                          : 'Built into the gateway protocol — not a per-user switch. Use Essentials tool toggles for tools the agent can run.'}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </GlassCard>

      <IntegrationsSheet
        visible={integrationsToolset != null}
        toolset={integrationsToolset}
        gatewayUrl={gatewayUrl}
        apiKey={apiKey}
        integrationsConfigAvailable={integrationsConfigAvailable}
        onClose={() => setIntegrationsToolset(null)}
        onSaved={() => {
          void loadOps({ refresh: true });
        }}
      />
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
  featureRow: {
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  featureMain: { flex: 1 },
  featureToggleCol: {
    alignItems: 'center',
    gap: 2,
    paddingTop: 2,
  },
  featureToggleHint: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
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
  addKeyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  addKeyBtnNeeded: { backgroundColor: 'rgba(99, 102, 241, 0.28)' },
  addKeyText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  addKeyTextNeeded: { color: colors.secondary },
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
  jobTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  jobPurposePreview: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 16,
  },
  jobDetails: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    gap: 8,
  },
  jobDetailRow: { gap: 2 },
  jobDetailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  jobDetailValue: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
  },
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
