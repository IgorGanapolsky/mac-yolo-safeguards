/**
 * Obsessive regression pack — failure classes from 2026-07-23 sessions.
 * These are behavioral tests (not only source greps). If any fail, ship is blocked
 * when included in test:release-safety / CI.
 *
 * Failure classes locked here:
 * - USB multi-Mac: never steal foreign Tailscale Mac; same-Mac cable may hand off;
 *   unplug restores same-Mac remote without wiping conversation
 * - Hobby toolsets: Spotify/HA never primary Settings spam
 * - Tools UX: cron + features expand with real details; no fake protocol toggles
 * - Notifications: Uber-like silent run status; approvals only when backgrounded
 * - Pairing: secretless pairCode + legacy key + mini name isolation
 * - Continuity: chip never sticky-lies; inject handoff on empty transcript only
 * - Dual "Let me…" bubbles: near-duplicate assistant collapse
 */
import { shouldPreferUsbProbeFirst } from '../utils/connectionSelfHeal';
import {
  resolveUsbToRemoteHandoff,
  resolveUsbTransportHandoff,
  usbHandoffPreservesConversation,
} from '../utils/usbTransportHandoff';
import type { GatewayProfile } from '../types/gatewayProfile';
import type { HermesMessage } from '../types/chat';
import {
  HOBBY_INTEGRATION_TOOLSET_NAMES,
  isHobbyIntegrationToolset,
  partitionMobileToolsets,
  toolsetShowsKeyButton,
} from '../utils/opsToolsets';
import { buildCronJobDetailLines } from '../utils/cronJobDetails';
import {
  buildGatewayFeatureRows,
  gatewayFeatureIsPhoneToggleable,
  resolveGatewayFeatureInfo,
} from '../utils/gatewayFeatureCatalog';
import {
  isSilentStatusNotificationType,
  resolveHermesNotificationPresentation,
  shouldPresentIntrusiveNotification,
  shouldScheduleApprovalNotification,
  shouldScheduleRunProgressNotification,
} from '../utils/smartNotificationPolicy';
import {
  CONTINUITY_CHIP_AUTO_DISMISS_MS,
  buildContinuitySystemPromptSection,
  buildSessionContinuityHandoff,
  shouldAutoDismissContinuityChip,
  shouldInjectContinuityHandoff,
  shouldShowContinuityChip,
} from '../utils/sessionContinuityHandoff';
import { buildMobileChatSystemPrompt } from '../utils/workspacePrompt';
import { parseSetupDeepLink } from '../utils/setupDeepLink';
import {
  areNearDuplicateAssistantBodies,
  collapseNearDuplicateAssistantTurns,
  dedupeChatMessages,
  mergeServerMessagesWithPending,
} from '../utils/chatMessageMerge';
import { findResumableSessionByPromptTitle } from '../utils/resumeExistingSession';

const miniTs: GatewayProfile = {
  id: 'mini',
  label: 'Igors-Mac-mini',
  hostname: 'Igors-Mac-mini',
  gatewayUrl: 'http://100.94.135.78:8642',
  addedAt: '2026-07-01T00:00:00Z',
};

const proTs: GatewayProfile = {
  id: 'pro',
  label: 'Igors-MacBook-Pro',
  hostname: 'Igors-MacBook-Pro',
  gatewayUrl: 'http://100.87.85.85:8642',
  addedAt: '2026-07-01T00:00:00Z',
};

describe('July 23 session regression — USB / multi-Mac', () => {
  it('never hands Tailscale→USB when cable is a different Mac than active chat', () => {
    const decision = resolveUsbTransportHandoff({
      currentGatewayUrl: miniTs.gatewayUrl,
      wifiConnected: true,
      liveUsbReachable: true,
      liveUsbHostname: 'Igors-MacBook-Pro.local',
      activeProfile: miniTs,
    });
    expect(decision.shouldHandoff).toBe(false);
    expect(decision.reason).toBe('foreign_usb_host');
    expect(decision.preserveActiveProfileId).toBe('mini');
  });

  it('hands Tailscale→USB when cable matches CURRENT chatting machine', () => {
    const decision = resolveUsbTransportHandoff({
      currentGatewayUrl: proTs.gatewayUrl,
      wifiConnected: true,
      liveUsbReachable: true,
      liveUsbHostname: 'Igors-MacBook-Pro.local',
      activeProfile: proTs,
    });
    expect(decision.shouldHandoff).toBe(true);
    expect(decision.reason).toBe('handoff');
  });

  it('does not prefer USB probe first when sticky URL is Tailscale (not already loopback)', () => {
    expect(
      shouldPreferUsbProbeFirst({
        activeGatewayUrl: miniTs.gatewayUrl,
        wifiConnected: true,
      }),
    ).toBe(false);
  });

  it('USB unplug restores same-Mac Tailscale without switching activeProfileId', () => {
    const decision = resolveUsbToRemoteHandoff({
      currentGatewayUrl: 'http://127.0.0.1:8642',
      liveUsbReachable: false,
      activeProfile: proTs,
      remoteGatewayUrl: proTs.gatewayUrl,
    });
    expect(decision.shouldHandoff).toBe(true);
    expect(decision.reason).toBe('handoff');
    expect(decision.remoteGatewayUrl).toBe(proTs.gatewayUrl);
    expect(decision.preserveActiveProfileId).toBe('pro');
  });

  it('USB unplug does not hand off while cable still live', () => {
    const decision = resolveUsbToRemoteHandoff({
      currentGatewayUrl: 'http://127.0.0.1:8642',
      liveUsbReachable: true,
      activeProfile: proTs,
      remoteGatewayUrl: proTs.gatewayUrl,
    });
    expect(decision.shouldHandoff).toBe(false);
    expect(decision.reason).toBe('still_usb');
  });

  it('USB transport handoff never implies a new chat / wiped transcript', () => {
    expect(
      usbHandoffPreservesConversation({
        beforeSessionId: 'sess-money',
        afterSessionId: 'sess-money',
        beforeProjectId: 'proj-1',
        afterProjectId: 'proj-1',
        beforeMessageCount: 12,
        afterMessageCount: 12,
      }),
    ).toBe(true);
    expect(
      usbHandoffPreservesConversation({
        beforeSessionId: 'sess-money',
        afterSessionId: 'sess-NEW',
        beforeMessageCount: 12,
        afterMessageCount: 0,
      }),
    ).toBe(false);
  });

  it('refuses USB handoff without live hostname (ghost reverse guard)', () => {
    const decision = resolveUsbTransportHandoff({
      currentGatewayUrl: proTs.gatewayUrl,
      wifiConnected: false,
      liveUsbReachable: true,
      liveUsbHostname: null,
      activeProfile: proTs,
    });
    expect(decision.shouldHandoff).toBe(false);
    expect(decision.reason).toBe('missing_usb_hostname');
  });
});

describe('July 23 session regression — hobby tools never primary spam', () => {
  it('locks hobby denylist (Spotify / HA / Discord / Yuanbao)', () => {
    for (const name of [
      'spotify',
      'homeassistant',
      'discord',
      'discord_admin',
      'yuanbao',
    ] as const) {
      expect(isHobbyIntegrationToolset(name)).toBe(true);
      expect(HOBBY_INTEGRATION_TOOLSET_NAMES).toContain(name);
      expect(
        toolsetShowsKeyButton({ name, configured: false, enabled: false }),
      ).toBe(false);
    }
  });

  it('hides unconfigured hobby from Settings partition entirely', () => {
    const { essentials, advanced } = partitionMobileToolsets([
      {
        name: 'terminal',
        configured: true,
        enabled: true,
        tools: ['run'],
      },
      {
        name: 'spotify',
        configured: false,
        enabled: false,
        tools: ['play'],
      },
      {
        name: 'homeassistant',
        configured: false,
        enabled: false,
        tools: ['light'],
      },
    ]);
    expect(essentials.map((t) => t.name)).toEqual(['terminal']);
    expect(advanced.map((t) => t.name)).toEqual([]);
  });

  it('puts configured Spotify only in advanced On your Mac, never Essentials', () => {
    const { essentials, advanced } = partitionMobileToolsets([
      {
        name: 'spotify',
        configured: true,
        enabled: true,
        tools: ['play'],
      },
      {
        name: 'web',
        configured: true,
        enabled: true,
        tools: ['search'],
      },
    ]);
    expect(essentials.some((t) => t.name === 'spotify')).toBe(false);
    expect(advanced.some((t) => t.name === 'spotify')).toBe(true);
  });
});

describe('July 23 session regression — Tools expand details', () => {
  it('cron jobs expose purpose, started, last/next run when gateway provides them', () => {
    const lines = buildCronJobDetailLines(
      {
        id: 'job1',
        name: 'Pipeline Dashboard Refresh',
        schedule: { display: 'every 120m' },
        prompt: 'Refresh revenue pipeline from metrics.db',
        created_at: '2026-06-15T12:00:00.000Z',
        last_run_at: '2026-07-23T13:00:00.000Z',
        next_run_at: '2026-07-23T15:00:00.000Z',
        last_status: 'ok',
      },
      Date.parse('2026-07-23T14:00:00.000Z'),
    );
    const labels = lines.map((l) => l.label);
    expect(labels).toEqual(
      expect.arrayContaining(['Status', 'Schedule', 'Started', 'Last run', 'Next run', 'Purpose']),
    );
    expect(lines.find((l) => l.label === 'Purpose')?.value).toMatch(/revenue pipeline/i);
  });

  it('gateway features have human copy and are never phone-toggleable protocol flags', () => {
    const info = resolveGatewayFeatureInfo('chat_completions_streaming');
    expect(info.detail.length).toBeGreaterThan(20);
    expect(gatewayFeatureIsPhoneToggleable('chat_completions')).toBe(false);
    expect(gatewayFeatureIsPhoneToggleable('run_events_sse')).toBe(false);
    const rows = buildGatewayFeatureRows({
      chat_completions: true,
      run_stop: true,
      toolsets_write: false,
    });
    expect(rows.map((r) => r.key).sort()).toEqual(['chat_completions', 'run_stop']);
  });
});

describe('July 23 session regression — notifications never annoy', () => {
  it('run progress / stall / complete never present as intrusive banners', () => {
    for (const type of ['run_progress', 'run_stall', 'run_completed']) {
      expect(isSilentStatusNotificationType(type)).toBe(true);
      expect(shouldPresentIntrusiveNotification('background', type)).toBe(false);
      expect(shouldPresentIntrusiveNotification('active', type)).toBe(false);
      const presentation = resolveHermesNotificationPresentation('background', {
        notificationType: type,
        playSound: true,
      });
      expect(presentation.shouldShowBanner).toBe(false);
      expect(presentation.shouldPlaySound).toBe(false);
      expect(presentation.shouldShowList).toBe(true);
    }
  });

  it('run progress notifications only schedule when backgrounded + category enabled', () => {
    expect(shouldScheduleRunProgressNotification('background', true)).toBe(true);
    expect(shouldScheduleRunProgressNotification('active', true)).toBe(false);
    expect(shouldScheduleRunProgressNotification('background', false)).toBe(false);
  });

  it('approvals may interrupt only when backgrounded', () => {
    expect(shouldPresentIntrusiveNotification('background', 'approval')).toBe(true);
    expect(shouldPresentIntrusiveNotification('active', 'approval')).toBe(false);
  });
});

describe('July 23 session regression — pairing deep links', () => {
  it('legacy key deep link carries url + key for cold install', () => {
    const parsed = parseSetupDeepLink(
      'hermes://setup?url=http%3A%2F%2F127.0.0.1%3A8642&key=sk-test-key&name=Igors-MacBook-Pro',
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.gatewayUrl).toContain('127.0.0.1:8642');
    expect(parsed?.apiKey).toBe('sk-test-key');
    expect(parsed?.macName).toMatch(/MacBook/i);
  });

  it('secretless deep link carries pairCode + pairServer (exchange path)', () => {
    const parsed = parseSetupDeepLink(
      'hermes://setup?pairCode=ABCD1234&pairServer=http%3A%2F%2F127.0.0.1%3A8765&name=Igors-Mac-mini',
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.pairingCode).toBe('ABCD1234');
    expect(parsed?.pairServerUrl).toContain('127.0.0.1:8765');
    // No embedded key — app must redeem via /pair-exchange
    expect(parsed?.apiKey).toBeUndefined();
  });

  it('mini Tailscale deep link name is Mac-mini not Pro when pairing mini', () => {
    const parsed = parseSetupDeepLink(
      'hermes://setup?url=http%3A%2F%2F100.94.135.78%3A8642&key=sk-mini&name=Igors-Mac-mini',
    );
    expect(parsed?.macName).toMatch(/[Mm]ini/);
    expect(parsed?.gatewayUrl).toContain('100.94.135.78');
  });
});

describe('July 23 session regression — continuity chip never sticky-lies', () => {
  const handoff = {
    version: 1 as const,
    writtenAt: '2026-07-23T00:00:00.000Z',
    lastGoal: 'make money today',
    openTodos: ['ship regression pack'] as string[],
    lastAssistantSummary: 'Working on revenue.',
    previousSessionId: 'sess-1',
    vaultRelativePath: 'Handoffs/hermes-mobile-last.md' as const,
  };

  it('shouldShowContinuityChip never returns true (seamless / no empty-New-chat lie)', () => {
    expect(
      shouldShowContinuityChip({
        handoff,
        chipDismissed: false,
        transcriptEmpty: true,
      }),
    ).toBe(false);
    expect(
      shouldShowContinuityChip({
        handoff,
        chipDismissed: false,
        transcriptEmpty: false,
      }),
    ).toBe(false);
  });

  it('continuity injects system prompt on empty transcript but not after bubbles exist', () => {
    expect(
      shouldInjectContinuityHandoff({
        handoff,
        transcriptEmpty: true,
      }),
    ).toBe(true);
    expect(
      shouldInjectContinuityHandoff({
        handoff,
        transcriptEmpty: false,
      }),
    ).toBe(false);
  });

  it('buildMobileChatSystemPrompt embeds last goal + previousSessionId on empty thread', () => {
    const prompt = buildMobileChatSystemPrompt(undefined, {
      continuityHandoff: handoff,
      transcriptEmpty: true,
      userText: 'make money today',
    });
    expect(prompt).toMatch(/make money today/i);
    expect(prompt).toContain('sess-1');
    expect(buildContinuitySystemPromptSection(handoff)).toMatch(/Previous session id/i);
  });

  it('handoff builder captures previousSessionId + last user goal without secrets', () => {
    const built = buildSessionContinuityHandoff({
      sessionId: 'sess-money-42',
      sessionTitle: 'make money today',
      messages: [
        { role: 'user', content: 'make money today' },
        {
          role: 'assistant',
          content: 'Working. key=sk-live-should-not-leak-abc1234567890',
        },
      ],
    });
    expect(built?.previousSessionId).toBe('sess-money-42');
    expect(built?.lastGoal).toMatch(/make money today/i);
    expect(built?.lastAssistantSummary).not.toMatch(/sk-live/);
  });

  it('continuity chip auto-dismiss window is short (never sticky Dismiss-only)', () => {
    expect(CONTINUITY_CHIP_AUTO_DISMISS_MS).toBeLessThanOrEqual(3000);
    expect(shouldAutoDismissContinuityChip(0, 3000)).toBe(true);
    expect(shouldAutoDismissContinuityChip(1000, 1500)).toBe(false);
  });
});

describe('July 23 session regression — dual Let-me bubbles collapse', () => {
  const ACK_A =
    "I'll activate your revenue engine immediately. Let me spin up the autonomous loops that actually print money right now.";
  const ACK_B =
    "I'll activate our revenue engines immediately. Let me check our current monetization channels and spin up our highest-ROI activities.";

  it('paraphrased consecutive revenue acks are near-duplicates', () => {
    expect(areNearDuplicateAssistantBodies(ACK_A, ACK_B)).toBe(true);
  });

  it('collapseNearDuplicateAssistantTurns leaves a single assistant bubble', () => {
    const messages: HermesMessage[] = [
      { id: 'u1', role: 'user', content: 'make money today' },
      { id: 'a1', role: 'assistant', content: ACK_A, created_at: '2026-07-23T10:00:00Z' },
      { id: 'a2', role: 'assistant', content: ACK_B, created_at: '2026-07-23T10:00:02Z' },
    ];
    const collapsed = collapseNearDuplicateAssistantTurns(messages);
    expect(collapsed.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(dedupeChatMessages(messages).filter((m) => m.role === 'assistant')).toHaveLength(1);
  });

  it('mergeServerMessagesWithPending does not stack stream + server paraphrase', () => {
    const server: HermesMessage[] = [
      { id: 'gw-u', role: 'user', content: 'make money today' },
      { id: 'gw-a', role: 'assistant', content: ACK_B },
    ];
    const local: HermesMessage[] = [
      { id: 'gw-u', role: 'user', content: 'make money today' },
      { id: 'asst-stream', role: 'assistant', content: ACK_A },
    ];
    const merged = mergeServerMessagesWithPending(server, local);
    expect(merged.filter((m) => m.role === 'assistant')).toHaveLength(1);
  });
});

describe('July 23 session regression — resume by title never traps mega-session', () => {
  it('findResumableSessionByPromptTitle picks latest matching title', () => {
    const match = findResumableSessionByPromptTitle(
      [
        {
          id: 'old',
          title: 'make money today',
          last_active_at: '2026-07-20T00:00:00Z',
        } as never,
        {
          id: 'new',
          title: 'make money today',
          last_active_at: '2026-07-23T00:00:00Z',
        } as never,
      ],
      'make money today',
    );
    expect(match?.id).toBe('new');
  });
});

describe('July 23 session regression — approvals not spam while foregrounded', () => {
  it('approval notifications schedule only when backgrounded', () => {
    const pending = {
      id: 'a1',
      actionId: 'act-1',
      command: 'rm -rf /tmp/demo',
      riskTier: 'high' as const,
    };
    expect(shouldScheduleApprovalNotification(pending as never, 'background', true)).toBe(
      true,
    );
    expect(shouldScheduleApprovalNotification(pending as never, 'active', true)).toBe(false);
  });
});
