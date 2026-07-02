import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../theme/colors';
import { relayWorkerDisplayName } from '../utils/relayRouting';
import type { RelayWorker } from '../types/mobileRelay';

type RelayPairStripProps = {
  isPaired: boolean;
  workers: RelayWorker[];
  onPair: (code: string) => Promise<void>;
  testID?: string;
};

export default function RelayPairStrip({
  isPaired,
  workers,
  onPair,
  testID = 'relay-pair-strip',
}: RelayPairStripProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isPaired) {
    if (workers.length === 0) {
      return (
        <View style={styles.wrap} testID={testID}>
          <Text style={styles.title}>Hermes relay linked</Text>
          <Text style={styles.body}>
            Relay is paired. Approvals work on Wi‑Fi, cellular, or USB. Workers appear when Hermes
            checks in from your computers.
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.wrap} testID={testID}>
        <Text style={styles.title}>Hermes relay workers</Text>
        {workers.slice(0, 4).map((worker) => (
          <Text key={worker.id} style={styles.workerLine}>
            • {relayWorkerDisplayName(worker)}
            {worker.status ? ` (${worker.status})` : ''}
          </Text>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.title}>Link Hermes relay (like Telegram)</Text>
      <Text style={styles.body}>
        Pair relay so approvals reach your phone on Wi‑Fi, cellular, or USB. On your computer, open relay
        pairing and enter the code Hermes shows you.
      </Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(text) => {
          setCode(text);
          setError(null);
        }}
        placeholder="MOON-DUST"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        testID="relay-pair-code-input"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        disabled={busy || !code.trim()}
        onPress={() => {
          setBusy(true);
          setError(null);
          void onPair(code.trim().toUpperCase())
            .then(() => setCode(''))
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'Pairing failed');
            })
            .finally(() => setBusy(false));
        }}
        testID="relay-pair-submit"
      >
        <Text style={styles.buttonText}>{busy ? 'Pairing…' : 'Pair Hermes relay'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0.3,
  },
  body: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  workerLine: {
    fontSize: 12,
    color: colors.textMuted,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  error: {
    fontSize: 12,
    color: colors.error,
  },
  button: {
    borderRadius: 10,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
});
