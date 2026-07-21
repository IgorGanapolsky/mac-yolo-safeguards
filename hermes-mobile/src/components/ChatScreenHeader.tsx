import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { RunProgressState } from '../types/chatDisplay';
import { resolveChatLinkDisplay } from '../utils/gatewayConnection';
import type { LeashConnectionState } from '../utils/gatewayEndpoint';
import { GATEWAY_AUTH_REPAIR_HEADER } from '../services/gatewayClient';
import {
  buildConnectedModelTokenLabel,
  displayableLlmModel,
} from '../utils/runProgressDisplay';
import { weakLocalModelWarning } from '../utils/weakLocalModel';
import { shouldShowLargeChatHeaderWarning } from '../utils/sessionTokenGuards';
import { NO_DIRECT_COMPUTER_LINK_LABEL } from '../utils/userFacingRouteCopy';
import ExpandableThreadTitle from './ExpandableThreadTitle';

type ChatScreenHeaderProps = {
  threadTitle: string;
  /** When the current thread was created — shown under the title. */
  threadCreatedLabel?: string | null;
  machineLabel: string;
  machineEndpoint?: string;
  routeStatusLabel?: string;
  connectionState: LeashConnectionState;
  macHttpReachable?: boolean;
  authMismatch?: boolean;
  /** Composer still showing wrong-key banner — header must not say Connected. */
  wrongKeyBannerActive?: boolean;
  /**
   * Unpaired relay / missing credentials with no direct Mac HTTP.
   * Forces pair CTA over Connecting · Tailscale-style false greens.
   */
  needsPair?: boolean;
  isDemo?: boolean;
  /** Keep IP / relay detail visible when connected (multi-Mac setups). */
  showMachineDetailWhenConnected?: boolean;
  activeAgents?: { name: string; status: string }[];
  currentSession?: {
    model?: string | null;
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    api_call_count?: number;
  } | null;
  /** Gateway default model when the session has not reported one yet. */
  gatewayModel?: string;
  /** Live run usage — preferred over session totals while a turn is in flight. */
  runProgress?: RunProgressState | null;
  onOpenThreads: () => void;
  onPressThreadTitle?: () => void;
  onOpenTools?: () => void;
  onPressMachine: () => void;
  /** Health OK but last message failed — amber header instead of green Connected. */
  chatStalled?: boolean;
};

function linkMeta(
  state: LeashConnectionState,
  macHttpReachable = false,
  disconnectedLabel = 'Not connected',
  isDemo = false,
  authMismatch = false,
  chatStalled = false,
  wrongKeyBannerActive = false,
  needsPair = false,
): { label: string; color: string; connected: boolean } {
  const link = resolveChatLinkDisplay({
    connectionState: state,
    macHttpOk: macHttpReachable,
    disconnectedLabel,
    isDemo,
    authMismatch,
    wrongKeyBannerActive,
    chatStalled,
    needsPair,
    pairStatusLabel: needsPair ? disconnectedLabel : undefined,
  });
  if (link.chatStalled) {
    return { label: link.label, color: colors.warning, connected: true };
  }
  if (link.chatReachable) {
    return { label: link.label, color: colors.success, connected: true };
  }
  if (link.label === GATEWAY_AUTH_REPAIR_HEADER) {
    return { label: link.label, color: colors.error, connected: false };
  }
  if (link.label === NO_DIRECT_COMPUTER_LINK_LABEL) {
    return { label: link.label, color: colors.warning, connected: false };
  }
  if (needsPair) {
    return { label: link.label, color: colors.warning, connected: false };
  }
  if (state === 'connecting') {
    return { label: link.label, color: colors.warning, connected: false };
  }
  return { label: link.label, color: colors.error, connected: false };
}

function isActiveRunProgress(progress: RunProgressState | null | undefined): boolean {
  if (!progress) {
    return false;
  }
  return progress.phase !== 'completed' && progress.phase !== 'failed';
}

/** Compact Hermes status line: presence + model + live or session token counts. */
export function buildHermesStatusLabel(
  hermesAgent: { name: string; status: string },
  currentSession?: ChatScreenHeaderProps['currentSession'],
  gatewayModel?: string,
  runProgress?: RunProgressState | null,
): string {
  const model =
    displayableLlmModel(currentSession?.model) ??
    displayableLlmModel(runProgress?.model) ??
    displayableLlmModel(gatewayModel);
  const modelLabel = model ? ` · ${model}` : '';

  let tokensLabel = '';
  if (
    isActiveRunProgress(runProgress) &&
    (runProgress?.inputTokens != null || runProgress?.outputTokens != null)
  ) {
    const input = (runProgress?.inputTokens ?? 0).toLocaleString();
    const output = (runProgress?.outputTokens ?? 0).toLocaleString();
    tokensLabel = ` · In: ${input} | Out: ${output}`;
  } else {
    const totalTokens = (currentSession?.input_tokens ?? 0) + (currentSession?.output_tokens ?? 0);
    if (totalTokens > 0) {
      tokensLabel = ` · ${totalTokens.toLocaleString()} tokens`;
    }
  }

  const cacheLabel = currentSession?.cache_read_tokens
    ? ` (${(currentSession.cache_read_tokens / 1000).toFixed(0)}k cached)`
    : '';

  return `Hermes (${hermesAgent.status})${modelLabel}${tokensLabel}${cacheLabel}`;
}

/**
 * Conversation-first header — title, always-visible Mac · status · transport,
 * model/tokens, and secondary chrome with no expand/collapse toggle.
 */
export default function ChatScreenHeader({
  threadTitle,
  threadCreatedLabel,
  machineLabel,
  machineEndpoint,
  routeStatusLabel,
  connectionState,
  macHttpReachable = false,
  authMismatch = false,
  wrongKeyBannerActive = false,
  needsPair = false,
  isDemo = false,
  activeAgents,
  currentSession,
  gatewayModel,
  runProgress,
  onOpenThreads,
  onPressThreadTitle,
  onOpenTools,
  onPressMachine,
  chatStalled = false,
}: ChatScreenHeaderProps) {
  const link = linkMeta(
    connectionState,
    macHttpReachable,
    routeStatusLabel,
    isDemo,
    authMismatch,
    chatStalled,
    wrongKeyBannerActive,
    needsPair,
  );
  const endpoint = machineEndpoint?.trim() || '';
  const showEndpoint = endpoint.length > 0;
  const hermesAgent = activeAgents?.find((a) => a.name.toLowerCase() === 'hermes');
  const resolvedModel =
    displayableLlmModel(currentSession?.model) ??
    displayableLlmModel(runProgress?.model) ??
    displayableLlmModel(gatewayModel);
  const localModelWarning = weakLocalModelWarning(resolvedModel);
  const hugeContext = shouldShowLargeChatHeaderWarning(
    currentSession,
    runProgress?.inputTokens,
  );
  const modelTokenStrip = link.connected
    ? buildConnectedModelTokenLabel({
        sessionModel: currentSession?.model,
        runModel: runProgress?.model,
        gatewayModel,
        runProgress,
        sessionInputTokens: currentSession?.input_tokens,
        sessionOutputTokens: currentSession?.output_tokens,
      })
    : null;

  return (
    <View style={styles.wrap} testID="chat-screen-header">
      <View style={styles.titleRow}>
        <Pressable
          onPress={onOpenThreads}
          style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
          testID="open-sessions-modal"
          accessibilityLabel="Open threads"
        >
          <Text style={styles.menuIcon}>☰</Text>
        </Pressable>
        <View style={styles.titlePressable} testID="chat-thread-title">
          <View style={styles.titleTextRow}>
            <ExpandableThreadTitle
              title={threadTitle}
              collapsedLines={1}
              style={styles.threadTitle}
              testID="chat-thread-title-expand"
              textTestID="HERMES CHAT"
            />
            {onPressThreadTitle ? (
              <Pressable
                onPress={onPressThreadTitle}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Rename current thread"
                testID="rename-current-thread-header-btn"
                style={styles.renameHeaderBtn}
              >
                <Text style={styles.renameHeaderIcon}>✎</Text>
              </Pressable>
            ) : null}
          </View>
          {threadCreatedLabel ? (
            <Text style={styles.threadCreated} numberOfLines={1} testID="chat-thread-created">
              {threadCreatedLabel}
            </Text>
          ) : null}
        </View>
        <View style={styles.titleActions}>
          {isDemo ? (
            <View style={styles.demoPill}>
              <Text style={styles.demoPillText}>DEMO</Text>
            </View>
          ) : null}
          {onOpenTools ? (
            <Pressable
              onPress={onOpenTools}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              testID="chat-header-tools"
              accessibilityRole="button"
              accessibilityLabel="Open tools"
            >
              <Text style={styles.iconBtnText}>⋯</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.macRow} testID="chat-header-connection-row">
        <Pressable
          onPress={onPressMachine}
          style={({ pressed }) => [styles.macRowMain, pressed && styles.pressed]}
          testID="chat-context-mac-button"
          accessibilityLabel="Choose your computer"
        >
          <View style={[styles.statusDot, { backgroundColor: link.color }]} />
          <View style={styles.macTextBlock}>
            <Text style={styles.macCompactLine} numberOfLines={1} ellipsizeMode="tail">
              <Text style={styles.macName} testID="chat-context-mac">
                {machineLabel}
              </Text>
              <Text style={styles.macCompactSep}> · </Text>
              <Text
                style={[styles.macCompactStatus, { color: link.color }]}
                testID="chat-context-link"
              >
                {link.label}
              </Text>
              {showEndpoint ? (
                <>
                  <Text style={styles.macCompactSep}> · </Text>
                  <Text style={styles.macEndpoint} testID="chat-context-mac-endpoint">
                    {endpoint}
                  </Text>
                </>
              ) : null}
            </Text>
          </View>
        </Pressable>
      </View>

      {modelTokenStrip ? (
        <Text style={styles.modelTokenStrip} numberOfLines={1} testID="chat-header-model-strip">
          {modelTokenStrip}
        </Text>
      ) : null}


      {hermesAgent ? (
        <View style={styles.agentsRow} testID="chat-header-active-agents">
          <Text style={styles.agentsLabel} testID="chat-header-hermes-status">
            {buildHermesStatusLabel(hermesAgent, currentSession, gatewayModel, runProgress)}
          </Text>
        </View>
      ) : null}

      {localModelWarning ? (
        <Text style={styles.modelWarning} testID="chat-header-weak-model-warning">
          {localModelWarning}
        </Text>
      ) : null}
      {hugeContext && !localModelWarning ? (
        <Text style={styles.modelWarning} testID="chat-header-poisoned-context-warning">
          This chat is large — Start fresh chat so the model cannot keep drifting from old context.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 22,
  },
  titlePressable: {
    flex: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 2,
    minWidth: 0,
  },
  titleTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  threadTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0,
  },
  threadCreated: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 1,
  },
  renameHeaderBtn: {
    flexShrink: 0,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameHeaderIcon: {
    fontSize: 13,
    color: colors.textMuted,
  },
  titleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  demoPill: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  demoPillText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.backgroundStart,
    letterSpacing: 0,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textSecondary,
    lineHeight: 24,
    marginTop: -4,
  },
  pressed: {
    opacity: 0.72,
  },
  macRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  macRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  macTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  macCompactLine: {
    fontSize: 12,
    lineHeight: 16,
  },
  macCompactSep: {
    fontWeight: '500',
    color: colors.textMuted,
  },
  macCompactStatus: {
    fontWeight: '600',
  },
  macName: {
    fontWeight: '600',
    color: colors.textMuted,
  },
  macEndpoint: {
    fontWeight: '500',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  modelTokenStrip: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
  agentsRow: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  agentsLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  modelWarning: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: colors.warning,
  },
});
