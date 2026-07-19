import React, { useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme/colors';
import { cleanManualGatewayUrl } from '../utils/gatewayUrlPolicy';
import { isTailscaleGatewayUrl } from '../utils/tailscaleHosts';
import { haptics } from '../services/haptics';
import { connectManualGatewayAddress } from '../services/manualGatewayConnection';
import LoadingButton from './ui/LoadingButton';

export type ManualComputerAddressFormProps = {
  onAddProfile: (label: string, gatewayUrl: string) => Promise<void>;
  /** When true, use fresh-user picker copy (Your Mac / Tailscale name). */
  pickerMode?: boolean;
  testIDPrefix?: string;
};

export default function ManualComputerAddressForm({
  onAddProfile,
  pickerMode = false,
  testIDPrefix = 'chat-manual',
}: ManualComputerAddressFormProps) {
  const [manualInput, setManualInput] = useState('');
  const [addingProfile, setAddingProfile] = useState(false);
  const [manualInputError, setManualInputError] = useState<string | null>(null);

  const handleManualConnect = async () => {
    Keyboard.dismiss();
    const cleaned = cleanManualGatewayUrl(manualInput);
    if (!cleaned) {
      setManualInputError('Please enter an IP address or URL.');
      return;
    }
    setManualInputError(null);
    setAddingProfile(true);
    try {
      const isTailscale = isTailscaleGatewayUrl(cleaned);
      const label = isTailscale ? 'Tailscale computer' : 'Custom computer';
      await connectManualGatewayAddress({
        gatewayUrl: cleaned,
        fallbackLabel: label,
        persistProfile: onAddProfile,
      });
      setManualInput('');
      haptics.success();
    } catch (err) {
      setManualInputError(err instanceof Error ? err.message : 'Could not add profile.');
      haptics.warning();
    } finally {
      setAddingProfile(false);
    }
  };

  const title = pickerMode ? 'Add by Tailscale address' : 'Connect manually (Tailscale or IP)';
  const subtitle = pickerMode
    ? "Enter your Mac's Tailscale name or 100.x address, then Connect."
    : "Add by entering your computer's Tailscale or local IP address:";
  const placeholder = pickerMode
    ? 'e.g. your-mac or 100.x.x.x'
    : 'e.g. your-device-name or a 100.x address';

  return (
    <View style={styles.manualEntry} testID={`${testIDPrefix}-form`}>
      <Text style={styles.manualEntryTitle}>{title}</Text>
      <Text style={styles.manualEntrySubtitle}>{subtitle}</Text>
      <View style={styles.manualInputRow}>
        <TextInput
          style={styles.manualInput}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={manualInput}
          onChangeText={setManualInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          testID={`${testIDPrefix}-input`}
        />
        <LoadingButton
          label="Connect"
          loadingLabel="Connecting…"
          loading={addingProfile}
          onPress={handleManualConnect}
          testID={`${testIDPrefix}-submit`}
          style={styles.manualButton}
        />
      </View>
      {manualInputError ? (
        <Text style={styles.manualError} testID={`${testIDPrefix}-error`}>
          {manualInputError}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  manualEntry: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: 8,
  },
  manualEntryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  manualEntrySubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  manualInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  manualInput: {
    flex: 1,
    height: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 13,
  },
  manualButton: {
    paddingVertical: 10,
    height: 44,
    minWidth: 90,
  },
  manualError: {
    fontSize: 12,
    color: colors.error,
    marginTop: 2,
  },
});
