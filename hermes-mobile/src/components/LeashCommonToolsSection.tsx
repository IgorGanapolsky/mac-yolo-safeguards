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
  createLeashCustomTool,
  leashToolStatusLine,
  mergeLeashToolRows,
  setLeashToolEnabled,
  isLeashToolEnabled,
  type LeashCustomToolDef,
} from '../utils/leashCommonTools';

type Props = {
  approvalRequiredIds: string[];
  customTools: LeashCustomToolDef[];
  onChangeApprovalRequiredIds: (next: string[]) => void;
  onChangeCustomTools: (next: LeashCustomToolDef[]) => void;
};

export default function LeashCommonToolsSection({
  approvalRequiredIds,
  customTools,
  onChangeApprovalRequiredIds,
  onChangeCustomTools,
}: Props) {
  const [draftLabel, setDraftLabel] = useState('');
  const rows = useMemo(
    () => mergeLeashToolRows(customTools),
    [customTools],
  );

  const addCustom = () => {
    const created = createLeashCustomTool(draftLabel);
    if (!created) {
      Alert.alert(
        'Could not add tool',
        'Enter a unique name that is not already in the common list.',
      );
      return;
    }
    if (customTools.some((tool) => tool.id === created.id)) {
      Alert.alert('Already added', `${created.label} is already in your list.`);
      return;
    }
    onChangeCustomTools([...customTools, created]);
    setDraftLabel('');
  };

  return (
    <View testID="leash-common-tools">
      <Text style={styles.sectionTitle}>Common tools</Text>
      <Text style={styles.hint}>
        All tools start allowed. Turn one off to require Approve / Deny on Leash when ThumbGate
        tries to use it.
      </Text>
      {rows.map((row) => {
        const enabled = isLeashToolEnabled(row.id, approvalRequiredIds);
        return (
          <View
            key={row.id}
            style={styles.switchRow}
            testID={`leash-tool-row-${row.id}`}
          >
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
                onChangeApprovalRequiredIds(
                  setLeashToolEnabled(row.id, val, approvalRequiredIds),
                );
              }}
              testID={`leash-tool-switch-${row.id}`}
              trackColor={{ false: '#1F2937', true: colors.primary }}
              thumbColor={enabled ? '#ffffff' : '#9CA3AF'}
            />
          </View>
        );
      })}

      <Text style={styles.customTitle}>Add your own tool</Text>
      <TextInput
        style={styles.input}
        value={draftLabel}
        onChangeText={setDraftLabel}
        placeholder="e.g. Stripe CLI, Docker"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        testID="leash-custom-tool-input"
      />
      <TouchableOpacity
        style={styles.addButton}
        onPress={addCustom}
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
    marginBottom: 8,
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
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
