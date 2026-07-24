import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { RelayWorker } from '../types/mobileRelay';
import { colors } from '../theme/colors';
import { relayWorkerDisplayName } from '../utils/relayRouting';

type RelayWorkerListProps = {
  workers: RelayWorker[];
  activeWorkerId?: string | null;
  testID?: string;
};

export default function RelayWorkerList({
  workers,
  activeWorkerId = null,
  testID = 'relay-worker-list',
}: RelayWorkerListProps) {
  if (workers.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.heading}>On your ThumbGate account</Text>
      <Text style={styles.hint}>
        These computers check in over the internet. Direct chat still needs Wi‑Fi or a tunnel URL
        unless cloud chat relay is enabled.
      </Text>
      {workers.map((worker) => {
        const active =
          worker.id === activeWorkerId || worker.machine_id === activeWorkerId;
        const online = /online|active|busy|running/i.test(worker.status ?? '');
        return (
          <View
            key={worker.id}
            style={[styles.row, active && styles.rowActive]}
            testID={`relay-worker-row-${worker.id}`}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: online ? colors.success : colors.textMuted },
              ]}
            />
            <View style={styles.copy}>
              <Text style={styles.name}>{relayWorkerDisplayName(worker)}</Text>
              <Text style={styles.meta}>
                {worker.status ? worker.status : 'relay worker'}
                {active ? ' · active route' : ''}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  heading: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
  },
  rowActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(34, 211, 238, 0.06)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  meta: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
});
