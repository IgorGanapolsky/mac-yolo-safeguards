import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Switch,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { colors } from '../theme/colors';
import {
  buildLeashCustomToolAddedMessage,
  createLeashCustomTool,
  LEASH_COMMON_TOOLS_MECHANISM_HINT,
  LEASH_CUSTOM_TOOL_ADD_HINT,
  LEASH_DISCONNECTED_NOTICE,
  leashToolStatusLine,
  mergeLeashToolRows,
  setLeashToolEnabled,
  isLeashToolEnabled,
  type LeashCustomToolDef,
} from '../utils/leashCommonTools';

type Props = {
  approvalRequiredIds: string[];
  customTools: LeashCustomToolDef[];
  /** True when the phone currently has a live connection to a Mac. */
  macConnected: boolean;
  onChangeApprovalRequiredIds: (next: string[]) => void;
  onChangeCustomTools: (next: LeashCustomToolDef[]) => void;
};

export default function LeashCommonToolsSection({
  approvalRequiredIds,
  customTools,
  macConnected,
  onChangeApprovalRequiredIds,
  onChangeCustomTools,
}: Props) {
  const [draftLabel, setDraftLabel] = useState('');
  const rows = useMemo(() => mergeLeashToolRows(customTools), [customTools]);

  const addCustom = () => {
    const trimmed = draftLabel.trim();
    if (!trimmed) {
      return;
    }
    const result = createLeashCustomTool(trimmed, customTools);
    if (!result.tool) {
      Alert.alert(
        result.duplicate ? 'Already added' : 'Could not add tool',
        result.duplicate
          ? `"${trimmed}" is already in your list.`
          : 'Enter a name with at least one letter or number.',
      );
      return;
    }
    onChangeCustomTools([...customTools, result.tool]);
    setDraftLabel('');
    Alert.alert('Tool added', buildLeashCustomToolAddedMessage(result.tool.label));
  };

  return (
    <View testID="leash-common-tools">
      <Text style={styles.sectionTitle}>Common tools</Text>
      <Text style={styles.hint}>{LEASH_COMMON_TOOLS_MECHANISM_HINT}</Text>
      {!macConnected ? (
        <View style={styles.disconnectedBanner} testID="leash-common-tools-disconnected">
          <Text style={styles.disconnectedText}>{LEASH_DISCONNECTED_NOTICE}</Text>
        </View>
      ) : null}
      {rows.map((row) => {
        const enabled = isLeashToolEnabled(row.id, approvalRequiredIds);
        return (
          <View key={row.id} style={styles.switchRow} testID={`leash-tool-row-${row.id}`}>
            <View style={styles.switchLabelCol}>
              <Text style={styles.switchLabel}>{row.label}</Text>
              <Text style={styles.switchDesc}>
                {'description' in row && row.description
                  ? row.description
                  : leashToolStatusLine(enabled)}
              </Text>
              <Text style={styles.statusLine}>{leashToolStatusLine(enabled)}</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={(val) => {
                onChangeApprovalRequiredIds(setLeashToolEnabled(row.id, val, approvalRequiredIds));
              }}
              testID={`leash-tool-switch-${row.id}`}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={enabled ? '#ffffff' : '#9CA3AF'}
            />
          </View>
        );
      })}

      <Text style={styles.customTitle}>Add your own tool</Text>
      <Text style={styles.customHint}>{LEASH_CUSTOM_TOOL_ADD_HINT}</Text>
      <TextInput
        style={styles.input}
        value={draftLabel}
        onChangeText={setDraftLabel}
        placeholder="e.g. Stripe CLI, Docker"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        testID="leash-custom-tool-input"
        onSubmitEditing={addCustom}
      />
      <TouchableOpacity
        style={[styles.addButton, !draftLabel.trim() && styles.addButtonDisabled]}
        onPress={addCustom}
        disabled={!draftLabel.trim()}
        testID="leash-custom-tool-add"
        accessibilityRole="button"
        accessibilityLabel="Add custom tool"
      >
        <Text style={styles.addButtonText}>Add tool</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 12,
    lineHeight: 17,
  },
  disconnectedBanner: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#7C2D12',
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  disconnectedText: {
    fontSize: 12,
    color: '#FBBF24',
    lineHeight: 17,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1F2937',
    gap: 12,
  },
  switchLabelCol: {
    flex: 1,
    paddingRight: 8,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  switchDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  statusLine: {
    fontSize: 11,
    color: colors.primary,
    marginTop: 4,
  },
  customTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 4,
  },
  customHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 8,
    lineHeight: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
    backgroundColor: '#0B1220',
  },
  addButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addButtonDisabled: {
    opacity: 0.45,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
