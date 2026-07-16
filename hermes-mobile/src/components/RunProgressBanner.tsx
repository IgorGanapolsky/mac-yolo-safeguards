import React, { useEffect, useRef, useState, memo } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Platform, Pressable } from 'react-native';
import { colors } from '../theme/colors';
import type { RunProgressState } from '../types/chatDisplay';
import {
  formatLlmModelShortName,
  humanizeRunProgressDetail,
  runProgressBannerTitle,
  runProgressFailedTitle,
} from '../utils/runProgressDisplay';
import { isConnectivityMessage } from '../utils/chatErrors';
import { classifyRunStale, runStaleHint } from '../utils/runStaleDetection';
import { formatElapsedDuration } from '../utils/formatElapsedDuration';
import {
  RUN_PROGRESS_ELAPSED_MIN_WIDTH,
  RUN_PROGRESS_STATS_MIN_HEIGHT,
  resolveRunProgressDetailsExpanded,
  shouldUpdateDebouncedTokenLabel,
} from '../utils/runProgressLayout';
import { investigateChatStall } from '../utils/chatStallInvestigation';

type RunProgressBannerProps = {
  progress: RunProgressState;
  /** Fallback LLM id when stream/session only report gateway platform labels. */
  fallbackModel?: string;
  /** Show model + token counts on completed/failed runs (always on while active). */
  showTechnicalStats?: boolean;
  /**
   * Compact mode (keyboard open): collapse MODEL/TOKENS/terminal by default so the
   * transcript keeps height instead of thrashing on every status tick.
   */
  compact?: boolean;
  onStop?: () => void;
  onDismiss?: () => void;
  onRetry?: () => void;
  /** Poll gateway transcript for reply text (works at bottom of chat; unlike pull-to-refresh). */
  onRefreshRun?: () => void;
  refreshRunBusy?: boolean;
  /** Live terminal line from Mac — shown below status, not as a second banner. */
  terminalToolName?: string;
  terminalPreview?: string;
  /** Honest warning when the backing session is extremely large. */
  megaSessionWarning?: string | null;
  onStartFreshChat?: () => void;
  /** Open Mac picker (weak model / wrong machine). */
  onSwitchMac?: () => void;
  /** Session token total for stall investigation (mega-session ranking). */
  sessionTokens?: number | null;
  /** Chat path healthy (not vibes Connected). */
  macHttpOk?: boolean;
  /** Show spinner while Start fresh is in flight (fork + stop Mac run). */
  isStartingFreshChat?: boolean;
};

function formatTokenSummary(progress: RunProgressState): string | null {
  const input = progress.inputTokens;
  const output = progress.outputTokens;
  if (input != null || output != null) {
    return `In: ${input ?? 0} | Out: ${output ?? 0}`;
  }
  if (progress.totalTokens != null) {
    return `${progress.totalTokens} total`;
  }
  return null;
}

function RunProgressBanner({
  progress,
  fallbackModel,
  showTechnicalStats = false,
  compact = false,
  onStop,
  onDismiss,
  onRetry,
  onRefreshRun,
  refreshRunBusy = false,
  terminalToolName,
  terminalPreview,
  megaSessionWarning,
  onStartFreshChat,
  onSwitchMac,
  sessionTokens = null,
  macHttpOk = true,
  isStartingFreshChat = false,
}: RunProgressBannerProps) {
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - progress.startedAtMs) / 1000)),
  );
  /** null = follow compact/keyboard default; boolean = user toggled. */
  const [userExpandedOverride, setUserExpandedOverride] = useState<boolean | null>(null);
  const [displayedTokenLabel, setDisplayedTokenLabel] = useState<string | null>(null);
  const tokenLabelUpdatedAtRef = useRef(0);
  const displayedTokenLabelRef = useRef<string | null>(null);

  useEffect(() => {
    const update = () => {
      const sec = Math.max(0, Math.floor((Date.now() - progress.startedAtMs) / 1000));
      setElapsed(sec);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [progress.startedAtMs]);

  useEffect(() => {
    // Leaving compact resets override so details expand again without sticky collapse.
    if (!compact) {
      setUserExpandedOverride(null);
    }
  }, [compact]);

  const isCompleted = progress.phase === 'completed';
  const isFailed = progress.phase === 'failed';
  const isActive = !isCompleted && !isFailed;
  const staleLevel = isActive ? classifyRunStale(progress) : 'normal';
  const staleMessage = runStaleHint(staleLevel);
  const investigation = investigateChatStall({
    elapsedMs: elapsed * 1000,
    phase: progress.phase,
    detail: progress.detail,
    model: progress.model ?? fallbackModel,
    sessionTokens,
    outputTokens: progress.outputTokens,
    macHttpOk,
  });
  const emphasizeStop =
    isActive &&
    Boolean(onStop) &&
    (staleLevel !== 'normal' || investigation.active);

  const durationSec = progress.duration != null ? Math.round(progress.duration * 10) / 10 : elapsed;
  const durationLabel = formatElapsedDuration(Math.floor(durationSec));
  const modelLabel =
    formatLlmModelShortName(progress.model) ?? formatLlmModelShortName(fallbackModel);
  const liveTokenLabel = formatTokenSummary(progress);

  useEffect(() => {
    const next = liveTokenLabel ?? '';
    const prev = displayedTokenLabelRef.current ?? '';
    const now = Date.now();
    if (
      !shouldUpdateDebouncedTokenLabel({
        lastUpdateAtMs: tokenLabelUpdatedAtRef.current,
        nowMs: now,
        prevLabel: prev,
        nextLabel: next,
      })
    ) {
      return;
    }
    tokenLabelUpdatedAtRef.current = now;
    displayedTokenLabelRef.current = liveTokenLabel;
    setDisplayedTokenLabel(liveTokenLabel);
  }, [liveTokenLabel]);

  const tokenLabel = displayedTokenLabel ?? liveTokenLabel;
  const showStats = Boolean(modelLabel || tokenLabel);
  const showStatsPanel = showStats;

  const detailLabel = isActive
    ? runProgressBannerTitle(progress)
    : humanizeRunProgressDetail(progress.detail, progress.phase);
  const failedTitle = isFailed ? runProgressFailedTitle(progress.detail) : detailLabel;
  const failedDetail =
    isFailed && isConnectivityMessage(progress.detail ?? '') ? progress.detail?.trim() : null;
  const terminalLine = terminalPreview?.trim() || '';
  const hasCollapsibleDetails = Boolean(
    showStatsPanel ||
      terminalLine ||
      failedDetail ||
      staleMessage ||
      megaSessionWarning ||
      investigation.active,
  );
  const detailsExpanded = resolveRunProgressDetailsExpanded({
    keyboardOpen: compact,
    userOverride: userExpandedOverride,
  });
  const showDetailSections = detailsExpanded && hasCollapsibleDetails;

  const toggleDetails = () => {
    if (hasCollapsibleDetails) {
      setUserExpandedOverride(!detailsExpanded);
    }
  };

  return (
    <View style={[
      styles.banner,
      isCompleted && styles.bannerCompleted,
      isFailed && styles.bannerFailed,
      !detailsExpanded && styles.bannerCollapsed,
    ]} testID="run-progress-banner">
      <View style={styles.headerRow}>
        <Pressable
          style={styles.headerToggle}
          onPress={toggleDetails}
          disabled={!hasCollapsibleDetails}
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsExpanded }}
          accessibilityLabel={
            hasCollapsibleDetails
              ? detailsExpanded
                ? 'Collapse run details'
                : 'Expand run details'
              : undefined
          }
          testID="run-progress-header"
        >
          {isActive ? (
            <ActivityIndicator size="small" color={colors.warning} style={styles.spinner} />
          ) : (
            <Text style={styles.statusIcon}>{isCompleted ? '✅' : '⚠️'}</Text>
          )}
          <Text
            style={[
              styles.text,
              isCompleted && styles.textCompleted,
              isFailed && styles.textFailed,
            ]}
            numberOfLines={showDetailSections && isFailed && failedDetail ? 1 : 2}
            testID="run-progress-detail"
          >
            {isCompleted ? 'Reply ready on your computer' : isFailed ? failedTitle : detailLabel}
          </Text>
          <Text style={styles.timeLabel} testID="run-progress-elapsed">
            {durationLabel}
          </Text>
        </Pressable>
        {hasCollapsibleDetails ? (
          <Pressable
            onPress={toggleDetails}
            hitSlop={8}
            style={({ pressed }) => [styles.chevronChip, pressed && styles.stopChipPressed]}
            testID="run-progress-toggle"
            accessibilityLabel={detailsExpanded ? 'Collapse details' : 'Expand details'}
          >
            <Text style={styles.chevron}>{detailsExpanded ? '▾' : '▸'}</Text>
          </Pressable>
        ) : null}
        {isActive && onStop ? (
          <Pressable
            onPress={onStop}
            style={({ pressed }) => [
              styles.stopChip,
              emphasizeStop && styles.stopChipEmphasis,
              pressed && styles.stopChipPressed,
            ]}
            testID="run-progress-stop"
            accessibilityLabel={emphasizeStop ? 'Stop stuck run' : 'Stop run'}
          >
            <Text style={[styles.stopChipText, emphasizeStop && styles.stopChipTextEmphasis]}>
              {emphasizeStop ? 'Stop stuck run' : 'Stop'}
            </Text>
          </Pressable>
        ) : null}
        {onRefreshRun ? (
          <Pressable
            onPress={onRefreshRun}
            disabled={refreshRunBusy}
            style={({ pressed }) => [
              styles.refreshChip,
              refreshRunBusy && styles.stopChipPressed,
              pressed && !refreshRunBusy && styles.stopChipPressed,
            ]}
            testID="run-progress-refresh"
            accessibilityLabel="Refresh run"
            accessibilityState={{ busy: refreshRunBusy, disabled: refreshRunBusy }}
          >
            {refreshRunBusy ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.refreshChipText}>Refresh</Text>
            )}
          </Pressable>
        ) : null}
        {!isActive && onRetry ? (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [styles.retryChip, pressed && styles.stopChipPressed]}
            testID="run-progress-retry"
            accessibilityLabel="Retry connection"
          >
            <Text style={styles.retryChipText}>Retry</Text>
          </Pressable>
        ) : null}
        {!isActive && onDismiss ? (
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [styles.stopChip, pressed && styles.stopChipPressed]}
            testID="run-progress-dismiss"
            accessibilityLabel="Dismiss banner"
          >
            <Text style={styles.stopChipText}>Dismiss</Text>
          </Pressable>
        ) : null}
      </View>

      {showDetailSections && failedDetail ? (
        <Text style={styles.failedDetail} testID="run-progress-failed-detail">
          {failedDetail}
        </Text>
      ) : null}

      {showDetailSections && staleMessage ? (
        <Text style={styles.staleHint} testID="run-progress-stale-hint">
          {staleMessage}
        </Text>
      ) : null}

      {investigation.active ? (
        <Text style={styles.investigationHint} testID="run-progress-investigation">
          {investigation.title}
        </Text>
      ) : null}

      {showDetailSections && megaSessionWarning ? (
        <Text style={styles.megaSessionHint} testID="run-progress-mega-session-hint">
          {megaSessionWarning}
        </Text>
      ) : null}

      {investigation.active &&
      investigation.action === 'switch_mac' &&
      onSwitchMac &&
      !isStartingFreshChat ? (
        <Pressable
          onPress={onSwitchMac}
          style={({ pressed }) => [styles.freshChatChip, pressed && styles.stopChipPressed]}
          testID="run-progress-switch-mac"
          accessibilityLabel={investigation.actionLabel}
        >
          <Text style={styles.freshChatChipText}>{investigation.actionLabel}</Text>
        </Pressable>
      ) : null}

      {(megaSessionWarning ||
        isStartingFreshChat ||
        (investigation.active && investigation.action === 'start_fresh')) &&
      onStartFreshChat ? (
        <Pressable
          onPress={onStartFreshChat}
          disabled={isStartingFreshChat}
          accessibilityState={{ busy: isStartingFreshChat, disabled: isStartingFreshChat }}
          style={({ pressed }) => [
            styles.freshChatChip,
            pressed && !isStartingFreshChat && styles.stopChipPressed,
          ]}
          testID="run-progress-start-fresh-chat"
          accessibilityLabel={isStartingFreshChat ? 'Starting fresh chat' : investigation.actionLabel || 'Start fresh chat'}
        >
          {isStartingFreshChat ? (
            <View style={styles.freshChatChipRow} testID="run-progress-start-fresh-spinner">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.freshChatChipText}>Starting…</Text>
            </View>
          ) : (
            <Text style={styles.freshChatChipText}>Start fresh chat</Text>
          )}
        </Pressable>
      ) : null}

      {showDetailSections && showStatsPanel ? (
        <View style={styles.statsPanel} testID="run-progress-stats">
          {modelLabel ? (
            <>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>MODEL</Text>
                <Text style={styles.statValue} numberOfLines={2} ellipsizeMode="tail">
                  {modelLabel}
                </Text>
              </View>
              {tokenLabel ? <View style={styles.statDivider} /> : null}
            </>
          ) : null}
          {tokenLabel ? (
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>TOKENS</Text>
              <Text style={styles.statValue}>{tokenLabel}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {showDetailSections && terminalLine ? (
        <View style={styles.terminalBox} testID="operator-terminal-preview">
          <Text style={styles.terminalLabel}>
            {terminalToolName ? `Terminal · ${terminalToolName}` : 'Terminal on your computer'}
          </Text>
          <Text style={styles.terminalText} numberOfLines={8} ellipsizeMode="tail" selectable>
            {terminalLine}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default memo(RunProgressBanner, (prev, next) => {
  const a = prev.progress;
  const b = next.progress;
  return (
    prev.showTechnicalStats === next.showTechnicalStats &&
    Boolean(prev.compact) === Boolean(next.compact) &&
    (prev.fallbackModel ?? '') === (next.fallbackModel ?? '') &&
    prev.onStop === next.onStop &&
    prev.onDismiss === next.onDismiss &&
    prev.onRetry === next.onRetry &&
    a.phase === b.phase &&
    a.startedAtMs === b.startedAtMs &&
    (a.detail ?? '') === (b.detail ?? '') &&
    (a.model ?? '') === (b.model ?? '') &&
    (a.inputTokens ?? -1) === (b.inputTokens ?? -1) &&
    (a.outputTokens ?? -1) === (b.outputTokens ?? -1) &&
    (a.duration ?? -1) === (b.duration ?? -1) &&
    (prev.terminalPreview ?? '') === (next.terminalPreview ?? '') &&
    (prev.terminalToolName ?? '') === (next.terminalToolName ?? '') &&
    (prev.megaSessionWarning ?? '') === (next.megaSessionWarning ?? '') &&
    Boolean(prev.onStartFreshChat) === Boolean(next.onStartFreshChat) &&
    Boolean(prev.isStartingFreshChat) === Boolean(next.isStartingFreshChat)
  );
});

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    gap: 6,
  },
  bannerCompleted: {
    borderColor: 'rgba(16, 185, 129, 0.25)',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  bannerFailed: {
    borderColor: 'rgba(239, 68, 68, 0.25)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  bannerCollapsed: {
    paddingVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  chevronChip: {
    paddingHorizontal: 2,
    paddingVertical: 2,
    flexShrink: 0,
  },
  chevron: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
    lineHeight: 16,
  },
  spinner: {
    marginRight: 2,
  },
  statusIcon: {
    fontSize: 12,
  },
  text: {
    flex: 1,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
  },
  textCompleted: {
    color: colors.success,
  },
  textFailed: {
    color: colors.error,
  },
  failedDetail: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  staleHint: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    color: colors.warning,
  },
  investigationHint: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    color: colors.warning,
  },
  megaSessionHint: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    color: colors.error,
  },
  freshChatChip: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.45)',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  freshChatChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  freshChatChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    flexShrink: 0,
    minWidth: RUN_PROGRESS_ELAPSED_MIN_WIDTH,
    textAlign: 'right',
  },
  stopChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stopChipEmphasis: {
    borderColor: colors.error,
    backgroundColor: 'rgba(239, 68, 68, 0.28)',
    borderWidth: 2,
    paddingHorizontal: 12,
  },
  stopChipPressed: {
    opacity: 0.85,
  },
  stopChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.error,
  },
  stopChipTextEmphasis: {
    fontSize: 12,
  },
  retryChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.55)',
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  retryChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.warning,
  },
  refreshChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.45)',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  statsPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    gap: 8,
    minHeight: RUN_PROGRESS_STATS_MIN_HEIGHT,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  terminalBox: {
    borderRadius: 8,
    backgroundColor: '#0A1018',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
  },
  terminalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.accent,
    marginBottom: 4,
  },
  terminalText: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
