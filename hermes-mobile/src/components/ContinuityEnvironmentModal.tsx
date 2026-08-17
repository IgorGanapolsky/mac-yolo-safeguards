/**
 * hermes-mobile/src/components/ContinuityEnvironmentModal.tsx
 *
 * Full Bidirectional Continuity & Environment Switcher Modal:
 * - Switches between Local Mac and 24/7 Cloud Continuity VPS.
 * - Shows real-time synchronization state, last synced timestamp, and manual sync action.
 */

import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import { haptics } from '../services/haptics';
import type { ChatEnvironmentMode, ContinuitySyncState } from '../services/continuitySyncService';

interface ContinuityEnvironmentModalProps {
  visible: boolean;
  syncState: ContinuitySyncState;
  onSelectEnvironment: (mode: ChatEnvironmentMode) => void;
  onTriggerSync: () => void;
  onClose: () => void;
}

export const ContinuityEnvironmentModal: React.FC<ContinuityEnvironmentModalProps> = ({
  visible,
  syncState,
  onSelectEnvironment,
  onTriggerSync,
  onClose,
}) => {
  const isCloud = syncState.activeEnvironment === 'cloud_continuity';

  const formatLastSync = (ts: number | null) => {
    if (!ts) return 'Never synced';
    const diffSec = Math.round((Date.now() - ts) / 1000);
    if (diffSec < 10) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    return `${Math.round(diffSec / 60)}m ago`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Chat Continuity & Environments</Text>
              <Text style={styles.subtitle}>
                Seamless bidirectional sync between Mac and 24/7 Cloud VPS
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close continuity switcher"
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scroll}>
            {/* Sync Status Banner */}
            <View style={styles.syncCard}>
              <View style={styles.syncStatusRow}>
                <View
                  style={[
                    styles.syncDot,
                    syncState.isSyncing
                      ? styles.syncDotBusy
                      : syncState.syncStatus === 'in_sync'
                        ? styles.syncDotGreen
                        : styles.syncDotAmber,
                  ]}
                />
                <Text style={styles.syncHeadline}>
                  {syncState.isSyncing
                    ? 'Syncing chat transcripts...'
                    : 'Transcripts & State Unified'}
                </Text>
              </View>
              <Text style={styles.syncDetails}>
                Last bidirectional sync: {formatLastSync(syncState.lastSyncedAt)}
              </Text>
              <TouchableOpacity
                style={styles.syncNowBtn}
                onPress={() => {
                  haptics.selection();
                  onTriggerSync();
                }}
                disabled={syncState.isSyncing}
              >
                <Text style={styles.syncNowBtnText}>
                  {syncState.isSyncing ? 'Syncing...' : '↻ Sync Now'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionHeader}>SELECT ACTIVE CHAT TARGET</Text>

            {/* Option 1: Local Mac Direct */}
            <TouchableOpacity
              style={[
                styles.envCard,
                !isCloud && styles.activeEnvCard,
              ]}
              onPress={() => {
                haptics.selection();
                onSelectEnvironment('local_mac');
              }}
            >
              <View style={styles.envIconCol}>
                <Text style={styles.envIcon}>🖥️</Text>
              </View>
              <View style={styles.envInfoCol}>
                <View style={styles.envTitleRow}>
                  <Text style={styles.envTitle}>Your Mac (Direct / Tailscale)</Text>
                  {!isCloud ? <Text style={styles.activeTag}>ACTIVE</Text> : null}
                </View>
                <Text style={styles.envDesc}>
                  Direct connection to your Mac on local Wi-Fi or Tailscale MagicDNS. Executes on
                  your local files and terminal.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Option 2: Cloud Continuity VPS */}
            <TouchableOpacity
              style={[
                styles.envCard,
                isCloud && styles.activeEnvCard,
              ]}
              onPress={() => {
                haptics.selection();
                onSelectEnvironment('cloud_continuity');
              }}
            >
              <View style={styles.envIconCol}>
                <Text style={styles.envIcon}>☁️</Text>
              </View>
              <View style={styles.envInfoCol}>
                <View style={styles.envTitleRow}>
                  <Text style={styles.envTitle}>Cloud Continuity (24/7 VPS)</Text>
                  {isCloud ? <Text style={styles.activeTag}>ACTIVE</Text> : null}
                </View>
                <Text style={styles.envDesc}>
                  Background sandbox that stays online when your laptop is closed. Seamlessly
                  syncs back when your Mac reconnects.
                </Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    color: '#94A3B8',
    fontSize: 18,
  },
  scroll: {
    padding: 16,
  },
  syncCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  syncStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  syncDotGreen: {
    backgroundColor: '#10B981',
  },
  syncDotAmber: {
    backgroundColor: '#F59E0B',
  },
  syncDotBusy: {
    backgroundColor: '#38BDF8',
  },
  syncHeadline: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '600',
  },
  syncDetails: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
    marginBottom: 10,
  },
  syncNowBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  syncNowBtnText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 1,
    marginBottom: 10,
  },
  envCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 12,
  },
  activeEnvCard: {
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    borderColor: '#38BDF8',
  },
  envIconCol: {
    justifyContent: 'center',
  },
  envIcon: {
    fontSize: 24,
  },
  envInfoCol: {
    flex: 1,
  },
  envTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  envTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  activeTag: {
    backgroundColor: '#0284C7',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  envDesc: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
  },
});

export default ContinuityEnvironmentModal;
