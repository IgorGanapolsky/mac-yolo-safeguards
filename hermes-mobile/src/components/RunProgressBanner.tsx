import React, { useEffect, useState, memo } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Platform, Pressable } from 'react-native';
import { colors } from '../theme/colors';
import type { RunProgressState } from '../types/chatDisplay';
import { displayableLlmModel, humanizeRunProgressDetail, runProgressFailedTitle } from '../utils/runProgressDisplay';
import { isConnectivityMessage } from '../utils/chatErrors';
import { classifyRunStale, runStaleHint } from '../utils/runStaleDetection';

type RunProgressBannerProps = {
  progress: RunProgressState;
  /** Fallback LLM id when stream/session only report gateway platform labels. */
  fallbackModel?: string;
  /** Show model + token counts on completed/failed runs (always on while active). */
  showTechnicalStats?: boolean;
  onStop?: () => void;
  onDismiss?: () => void;
  onRetry?: () => void;
  /** Live terminal line from Mac — shown below status, not as a second banner. */
  terminalToolName?: string;
  terminalPreview?: string;
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
  onStop,
  onDismiss,
  onRetry,
  terminalToolName,
  terminalPreview,
}: RunProgressBannerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => {
      const sec = Math.max(0, Math.floor((Date.now() - progress.startedAtMs) / 1000));
      setElapsed(sec);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [progress.startedAtMs]);

  const isCompleted = progress.phase === 'completed';
  const isFailed = progress.phase === 'failed';
  const isActive = !isCompleted && !isFailed;
  const staleLevel = isActive ? classifyRunStale(progress) : 'normal';
  const staleMessage = runStaleHint(staleLevel);
  const emphasizeStop = isActive && staleLevel !== 'normal' && Boolean(onStop);

  const durationSec = progress.duration != null ? Math.round(progress.duration * 10) / 10 : elapsed;
  const modelLabel =
    displayableLlmModel(progress.model) ?? displayableLlmModel(fallbackModel);
  const tokenLabel = formatTokenSummary(progress);
  const showStats = Boolean(modelLabel || tokenLabel);
  const showStatsPanel = showStats && (isActive || showTechnicalStats);

  const detailLabel = humanizeRunProgressDetail(progress.detail, progress.phase);
  const failedTitle = isFailed ? runProgressFailedTitle(progress.detail) : detailLabel;
  const failedDetail =
    isFailed && isConnectivityMessage(progress.detail ?? '') ? progress.detail?.trim() : null;
  const terminalLine = terminalPreview?.trim() || '';

  return (
    <View style={[
      styles.banner,
      isCompleted && styles.bannerCompleted,
      isFailed && styles.bannerFailed,
    ]} testID="run-progress-banner">
      <View style={styles.headerRow}>
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
          numberOfLines={isFailed && failedDetail ? 1 : 2}
          testID="run-progress-detail"
        >
          {isCompleted ? 'Reply ready on your computer' : isFailed ? failedTitle : detailLabel}
        </Text>
        <Text style={styles.timeLabel}>{durationSec}s</Text>
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

      {failedDetail ? (
        <Text style={styles.failedDetail} testID="run-progress-failed-detail">
          {failedDetail}
        </Text>
      ) : null}

      {staleMessage ? (
        <Text style={styles.staleHint} testID="run-progress-stale-hint">
          {staleMessage}
        </Text>
      ) : null}

      {showStatsPanel ? (
        <View style={styles.statsPanel}>
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

      {terminalLine ? (
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
    (prev.terminalToolName ?? '') === (next.terminalToolName ?? '')
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  timeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    flexShrink: 0,
    minWidth: 28,
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
  statsPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    gap: 8,
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
