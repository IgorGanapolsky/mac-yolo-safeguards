import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { DiscoveredGateway } from '../types/gatewayProfile';
import type { LanScanProgress, LanScanResult } from '../types/lanScan';
import { formatLanScanStageLabel, lanScanFraction } from '../utils/lanScanLabels';
import { tailscaleDiscoveryLabel } from '../services/tailscaleDiscovery';
import { colors } from '../theme/colors';
import {
  COMPUTER_PICKER_STATUS_COLLAPSED_MIN_HEIGHT,
  COMPUTER_PICKER_STATUS_COMPACT_MIN_HEIGHT,
  COMPUTER_PICKER_STATUS_DEBOUNCE_MS,
  COMPUTER_PICKER_STATUS_MIN_HEIGHT,
  computerPickerStatusSignature,
  resolveComputerPickerStatus,
  shouldCollapsePickerStatusBand,
  shouldCommitComputerPickerStatus,
  type ComputerPickerStatusSnapshot,
} from '../utils/computerPickerStatus';

const RESULT_TTL_MS = 12000;

type ComputerPickerStatusRegionProps = {
  scanning: boolean;
  scanProgress: LanScanProgress | null;
  scanResult: LanScanResult | null;
  tailscaleProbing: boolean;
  tailscaleVpnActive: boolean;
  tailscaleDiscoveries: DiscoveredGateway[];
  activeGatewayUrl?: string | null;
  wifiConnected?: boolean;
  activeReachable?: boolean;
  addingTailscale?: boolean;
  onAddTailscale?: (discovery: DiscoveredGateway) => void;
  /** Saved profile count — idle help collapses when > 0 unless expanded. */
  savedProfileCount?: number;
  helpExpanded?: boolean;
  onExpandHelp?: () => void;
  compact?: boolean;
  testID?: string;
};

export default function ComputerPickerStatusRegion({
  scanning,
  scanProgress,
  scanResult,
  tailscaleProbing,
  tailscaleVpnActive,
  tailscaleDiscoveries,
  activeGatewayUrl = null,
  wifiConnected = true,
  activeReachable = false,
  addingTailscale = false,
  onAddTailscale,
  savedProfileCount = 0,
  helpExpanded = false,
  onExpandHelp,
  compact = false,
  testID = 'mac-picker-status-region',
}: ComputerPickerStatusRegionProps) {
  const [resultExpired, setResultExpired] = useState(false);
  const [status, setStatus] = useState<ComputerPickerStatusSnapshot>(() =>
    resolveComputerPickerStatus({
      scanning,
      scanProgress,
      scanResult,
      showScanResult: Boolean(scanResult) && !scanning,
      tailscaleProbing,
      tailscaleVpnActive,
      tailscaleDiscoveries,
      activeGatewayUrl,
      wifiConnected,
      activeReachable,
    }),
  );
  const commitMetaRef = useRef<{
    atMs: number;
    signature: string | null;
    kind: ComputerPickerStatusSnapshot['kind'] | null;
  }>({
    atMs: 0,
    signature: null,
    kind: null,
  });
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setResultExpired(false);
    if (!scanResult || scanning) {
      return undefined;
    }
    const timer = setTimeout(() => setResultExpired(true), RESULT_TTL_MS);
    return () => clearTimeout(timer);
  }, [scanResult, scanning]);

  const showScanResult = Boolean(scanResult) && !scanning && !resultExpired;

  useEffect(() => {
    const next = resolveComputerPickerStatus({
      scanning,
      scanProgress,
      scanResult,
      showScanResult,
      tailscaleProbing,
      tailscaleVpnActive,
      tailscaleDiscoveries,
      activeGatewayUrl,
      wifiConnected,
      activeReachable,
    });
    const nextSignature = computerPickerStatusSignature(next);
    const nowMs = Date.now();
    const meta = commitMetaRef.current;

    if (
      shouldCommitComputerPickerStatus({
        lastCommitAtMs: meta.atMs,
        nowMs,
        prevSignature: meta.signature,
        nextSignature,
        prevKind: meta.kind,
        nextKind: next.kind,
      })
    ) {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      commitMetaRef.current = {
        atMs: nowMs,
        signature: nextSignature,
        kind: next.kind,
      };
      setStatus(next);
      return undefined;
    }

    if (meta.signature === nextSignature) {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      return undefined;
    }

    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
    }
    const waitMs = Math.max(
      0,
      COMPUTER_PICKER_STATUS_DEBOUNCE_MS - (nowMs - meta.atMs),
    );
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      const committedAt = Date.now();
      commitMetaRef.current = {
        atMs: committedAt,
        signature: nextSignature,
        kind: next.kind,
      };
      setStatus(next);
    }, waitMs);

    return () => {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, [
    scanning,
    scanProgress,
    scanResult,
    showScanResult,
    tailscaleProbing,
    tailscaleVpnActive,
    tailscaleDiscoveries,
    activeGatewayUrl,
    wifiConnected,
    activeReachable,
  ]);

  const collapsed = shouldCollapsePickerStatusBand(status, savedProfileCount, helpExpanded);

  if (collapsed) {
    return (
      <View
        style={[styles.collapsedSlot, { minHeight: COMPUTER_PICKER_STATUS_COLLAPSED_MIN_HEIGHT }]}
        testID={`${testID}-slot`}
      >
        {onExpandHelp ? (
          <TouchableOpacity
            style={styles.helpLinkRow}
            onPress={onExpandHelp}
            testID={`${testID}-help-link`}
          >
            <Text style={styles.helpLinkText}>Missing another computer?</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const minHeight = compact ? COMPUTER_PICKER_STATUS_COMPACT_MIN_HEIGHT : COMPUTER_PICKER_STATUS_MIN_HEIGHT;

  const borderTint =
    status.kind === 'result' || status.kind === 'active'
      ? status.success
        ? styles.cardSuccess
        : styles.cardWarn
      : status.kind === 'tailscale_found'
        ? styles.cardAccent
        : status.kind === 'searching'
          ? styles.cardSearching
          : styles.cardHelp;

  return (
    <View
      style={[
        styles.region,
        compact ? styles.regionCompact : null,
        { minHeight },
        borderTint,
      ]}
      testID={testID}
    >
      <View style={styles.row}>
        {status.kind === 'searching' ? (
          <ActivityIndicator color={colors.accent} size="small" />
        ) : null}
        <Text
          style={[
            styles.title,
            compact ? styles.titleCompact : null,
            (status.kind === 'result' || status.kind === 'active') && status.success
              ? styles.titleSuccess
              : null,
            status.kind === 'result' && !status.success ? styles.titleWarn : null,
          ]}
          numberOfLines={compact ? 1 : 2}
        >
          {status.title}
        </Text>
      </View>
      <Text style={[styles.detail, compact ? styles.detailCompact : null]} numberOfLines={compact ? 2 : 3}>
        {status.detail}
      </Text>
      {status.kind === 'searching' && scanProgress ? (
        <View style={styles.progressContainer} testID="picker-status-progress-track">
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(lanScanFraction(scanProgress) * 100),
            }}
          >
            <View
              style={[
                styles.fill,
                { width: `${Math.max(4, Math.round(lanScanFraction(scanProgress) * 100))}%` },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {formatLanScanStageLabel(scanProgress)}
          </Text>
        </View>
      ) : null}
      {status.kind === 'tailscale_found' && status.discoveries.length > 0 ? (
        <View style={styles.chips} testID={`${testID}-tailscale-chips`}>
          {status.discoveries.map((discovery) => {
            const label = tailscaleDiscoveryLabel(discovery);
            return (
              <TouchableOpacity
                key={discovery.gatewayUrl}
                style={styles.chip}
                onPress={() => onAddTailscale?.(discovery)}
                disabled={addingTailscale || !onAddTailscale}
                testID={`tailscale-add-${label.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`}
              >
                <Text style={styles.chipText}>
                  {addingTailscale ? 'Adding…' : `Add ${label}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedSlot: {
    justifyContent: 'center',
    marginBottom: 4,
  },
  region: {
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
    justifyContent: 'center',
  },
  regionCompact: {
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  cardHelp: {
    borderColor: 'rgba(34, 211, 238, 0.18)',
    backgroundColor: 'rgba(34, 211, 238, 0.05)',
  },
  cardSearching: {
    borderColor: 'rgba(99, 102, 241, 0.22)',
    backgroundColor: 'rgba(99, 102, 241, 0.07)',
  },
  cardAccent: {
    borderColor: 'rgba(34, 211, 238, 0.35)',
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
  },
  cardSuccess: {
    borderColor: 'rgba(16, 185, 129, 0.28)',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  cardWarn: {
    borderColor: 'rgba(245, 158, 11, 0.28)',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 19,
  },
  titleCompact: {
    fontSize: 13,
    lineHeight: 17,
  },
  titleSuccess: {
    color: colors.success,
  },
  titleWarn: {
    color: colors.warning,
  },
  detail: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  detailCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 12,
  },
  helpLinkRow: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  helpLinkText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  progressContainer: {
    marginTop: 6,
    gap: 4,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '600',
  },
});
