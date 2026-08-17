import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import type { ComputerSessionState } from '../types/grokBot';

interface ComputerScreenPaneProps {
  visible: boolean;
  state: ComputerSessionState;
  onToggleControl: () => void;
  onClose: () => void;
}

export const ComputerScreenPane: React.FC<ComputerScreenPaneProps> = ({
  visible,
  state,
  onToggleControl,
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.trafficLights}>
                <View style={[styles.light, { backgroundColor: '#FF5F56' }]} />
                <View style={[styles.light, { backgroundColor: '#FFBD2E' }]} />
                <View style={[styles.light, { backgroundColor: '#27C93F' }]} />
              </View>
              <Text style={styles.titleText}>🖥️ Mac Sandbox Live Screen</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {/* Subheader / URL / Resolution */}
          <View style={styles.metaBar}>
            <View style={styles.urlPill}>
              <Text style={styles.urlText} numberOfLines={1}>
                {state.currentUrl || state.activeAppTitle}
              </Text>
            </View>
            <Text style={styles.resText}>{state.resolution}</Text>
          </View>

          {/* Viewport Simulation */}
          <View style={styles.viewportBox}>
            <View style={styles.desktopCanvas}>
              <View style={styles.appWindow}>
                <View style={styles.appWindowHeader}>
                  <Text style={styles.appWindowTitle}>{state.activeAppTitle}</Text>
                </View>
                <View style={styles.appWindowBody}>
                  <Text style={styles.terminalPrompt}>igor@MacBook-Pro ~ %</Text>
                  <Text style={styles.terminalCommand}>
                    ./bin/agent-loop --health --json
                  </Text>
                  <Text style={styles.terminalOutput}>
                    ✓ Hooks: verified (SessionStart + PreToolUse)
                  </Text>
                  <Text style={styles.terminalOutput}>
                    ✓ ThumbGate RAG: active (0 active violations)
                  </Text>
                  <Text style={styles.terminalOutput}>
                    ✓ Statusline: Ollama ($0.00 / TTFT &lt;10ms)
                  </Text>
                </View>
              </View>

              {/* Status Overlay */}
              <View style={styles.liveIndicator}>
                <View style={styles.pulseDot} />
                <Text style={styles.liveText}>LIVE SCREEN STREAM</Text>
              </View>
            </View>
          </View>

          {/* Console Activity Logs */}
          <View style={styles.logsSection}>
            <Text style={styles.logsHeading}>RECENT AGENT ACTIVITY</Text>
            <ScrollView style={styles.logsScrollView} nestedScrollEnabled>
              {state.recentLogs.map((log, index) => (
                <Text key={`log-${index}`} style={styles.logLine}>
                  {log}
                </Text>
              ))}
            </ScrollView>
          </View>

          {/* Control Bar */}
          <View style={styles.footer}>
            <Pressable
              style={[
                styles.controlButton,
                state.isUserInControl
                  ? styles.controlButtonActive
                  : styles.controlButtonIdle,
              ]}
              onPress={onToggleControl}
            >
              <Text
                style={[
                  styles.controlButtonText,
                  state.isUserInControl && styles.controlButtonTextActive,
                ]}
              >
                {state.isUserInControl ? 'Relinquish Control' : 'Take Control of Desktop'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  container: {
    backgroundColor: '#0F131C',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingBottom: 24,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  trafficLights: {
    flexDirection: 'row',
    gap: 6,
  },
  light: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  titleText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  metaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  urlPill: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 10,
  },
  urlText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: colors.accent,
  },
  resText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  viewportBox: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  desktopCanvas: {
    height: 200,
    backgroundColor: '#090D16',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
    position: 'relative',
    justifyContent: 'center',
  },
  appWindow: {
    backgroundColor: '#161B26',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  appWindowHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  appWindowTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  appWindowBody: {
    padding: 10,
    gap: 3,
  },
  terminalPrompt: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#60A5FA',
  },
  terminalCommand: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#F9FAFB',
    fontWeight: '600',
  },
  terminalOutput: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#34D399',
  },
  liveIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#34D399',
    letterSpacing: 0.5,
  },
  logsSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  logsHeading: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  logsScrollView: {
    maxHeight: 100,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  logLine: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  controlButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonIdle: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  controlButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  controlButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  controlButtonTextActive: {
    color: '#F87171',
  },
});

export default ComputerScreenPane;
