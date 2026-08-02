import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';
import type { HerdrAgentInfo } from '../services/herdrStatus';

export type HerdrMobileWorkspace = {
  id: string;
  name: string;
  tabCount: number;
  activeBranch?: string;
  agents: HerdrAgentInfo[];
};

export type HerdrMobileSwitcherProps = {
  workspaces: HerdrMobileWorkspace[];
  activeWorkspaceId?: string;
  onSelectWorkspace?: (workspaceId: string) => void;
  onNewWorkspace?: () => void;
  onNewTab?: () => void;
};

export function getStateDotColor(state: HerdrAgentInfo['state']): string {
  switch (state) {
    case 'working':
      return '#eab308'; // yellow/amber
    case 'done':
      return '#22c55e'; // green
    case 'blocked':
      return '#ef4444'; // red
    case 'idle':
      return '#94a3b8'; // slate
    default:
      return '#64748b';
  }
}

export function HerdrMobileSwitcher({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onNewWorkspace,
  onNewTab,
}: HerdrMobileSwitcherProps) {
  return (
    <View style={styles.container} testID="herdr-mobile-switcher">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>spaces</Text>
        <TouchableOpacity style={styles.actionBtn} onPress={onNewWorkspace} testID="btn-new-workspace">
          <Text style={styles.actionBtnText}>+ new workspace</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.workspaceList}>
        {workspaces.map(ws => {
          const isActive = ws.id === activeWorkspaceId;
          const primaryAgent = ws.agents[0];
          const dotColor = primaryAgent ? getStateDotColor(primaryAgent.state) : '#64748b';

          return (
            <TouchableOpacity
              key={ws.id}
              style={[styles.workspaceRow, isActive && styles.workspaceRowActive]}
              onPress={() => onSelectWorkspace?.(ws.id)}
              testID={`ws-row-${ws.id}`}
            >
              <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
              <View style={styles.workspaceInfo}>
                <Text style={[styles.workspaceName, isActive && styles.workspaceNameActive]}>
                  {ws.name}
                </Text>
                <Text style={styles.workspaceSubtext}>
                  {ws.activeBranch ? `${ws.activeBranch} · ` : ''}tab {ws.tabCount}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.header}>
        <Text style={styles.headerTitle}>tabs</Text>
        <TouchableOpacity style={styles.actionBtn} onPress={onNewTab} testID="btn-new-tab">
          <Text style={styles.actionBtnText}>+ new tab</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  headerTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontFamily: 'Courier',
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  actionBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: '#1e293b',
  },
  actionBtnText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  workspaceList: {
    marginBottom: 10,
  },
  workspaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  workspaceRowActive: {
    backgroundColor: '#1e293b',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  workspaceInfo: {
    flex: 1,
  },
  workspaceName: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Courier',
  },
  workspaceNameActive: {
    color: '#38bdf8',
  },
  workspaceSubtext: {
    color: '#64748b',
    fontSize: 12,
  },
});
