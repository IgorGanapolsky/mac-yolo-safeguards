import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';

export type TerminalControlKey = 'ctrl_c' | 'esc' | 'enter' | 'tab' | 'yes' | 'no';

export type AgentTerminalControlPadProps = {
  onSendKey: (key: TerminalControlKey) => void;
  disabled?: boolean;
};

export const TERMINAL_KEYS: { id: TerminalControlKey; label: string; bg?: string }[] = [
  { id: 'ctrl_c', label: '^C (Interrupt)', bg: '#334155' },
  { id: 'esc', label: 'Esc', bg: '#1e293b' },
  { id: 'tab', label: 'Tab ⇥', bg: '#1e293b' },
  { id: 'enter', label: 'Enter ↵', bg: '#0284c7' },
  { id: 'yes', label: 'y (Yes)', bg: '#15803d' },
  { id: 'no', label: 'n (No)', bg: '#b91c1c' },
];

export function AgentTerminalControlPad({ onSendKey, disabled = false }: AgentTerminalControlPadProps) {
  return (
    <View style={styles.container} testID="agent-terminal-control-pad">
      <Text style={styles.headerTitle}>quick terminal keys</Text>
      <View style={styles.grid}>
        {TERMINAL_KEYS.map(item => (
          <TouchableOpacity
            key={item.id}
            style={[styles.keyBtn, { backgroundColor: item.bg || '#1e293b' }, disabled && styles.disabledBtn]}
            onPress={() => !disabled && onSendKey(item.id)}
            disabled={disabled}
            testID={`key-btn-${item.id}`}
          >
            <Text style={styles.keyLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginVertical: 6,
  },
  headerTitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'Courier',
    fontWeight: '700',
    textTransform: 'lowercase',
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  keyBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  keyLabel: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
});
