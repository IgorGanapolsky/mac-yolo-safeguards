import React, { useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { colors } from '../theme/colors';
import { cleanManualGatewayUrl } from '../utils/gatewayUrlPolicy';
import { isTailscaleGatewayUrl } from '../utils/tailscaleHosts';
import { haptics } from '../services/haptics';
import { connectManualGatewayAddress } from '../services/manualGatewayConnection';
import {
  TAILSCALE_PASTE_IP_DETAIL,
  TAILSCALE_PASTE_IP_HERMES_HINT,
  TAILSCALE_PASTE_IP_PLACEHOLDER,
  TAILSCALE_PASTE_IP_TITLE,
} from '../utils/tailscalePasteIpCopy';
import LoadingButton from './ui/LoadingButton';

export type ManualComputerAddressFormProps = {
  onAddProfile: (label: string, gatewayUrl: string) => Promise<void>;
  /** Choose-computer modal — paste-IP copy from #787. */
  pickerMode?: boolean;
  /** First-run ConnectMacGate hero — dominant paste IP row at top of viewport. */
  heroMode?: boolean;
  /** Picker with saved profiles: one-line label + input row, no subtitle. */
  compactMode?: boolean;
  testIDPrefix?: string;
};

/** Stack Connect under the field when the sheet is too narrow for a comfortable row. */
const STACK_CONNECT_BELOW_WIDTH = 380;

export default function ManualComputerAddressForm({
  onAddProfile,
  pickerMode = false,
  heroMode = false,
  compactMode = false,
  testIDPrefix = 'chat-manual',
}: ManualComputerAddressFormProps) {
  const { width } = useWindowDimensions();
  const stackConnect =
    (pickerMode && !compactMode) || heroMode || width < STACK_CONNECT_BELOW_WIDTH;
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

  const usePasteHeroCopy = pickerMode || heroMode;
  const title = usePasteHeroCopy
    ? TAILSCALE_PASTE_IP_TITLE
    : 'Connect manually (Tailscale or IP)';
  const subtitle = usePasteHeroCopy
    ? `${TAILSCALE_PASTE_IP_DETAIL} ${TAILSCALE_PASTE_IP_HERMES_HINT}`
    : "Add by entering your computer's Tailscale or local IP address:";
  const placeholder = usePasteHeroCopy
    ? TAILSCALE_PASTE_IP_PLACEHOLDER
    : 'e.g. your-device-name or a 100.x address';
  const showSubtitle = !compactMode;

  return (
    <View
      style={[
        styles.manualEntry,
        pickerMode ? styles.manualEntryPicker : null,
        compactMode ? styles.manualEntryCompact : null,
        heroMode ? styles.manualEntryHero : null,
      ]}
      testID={`${testIDPrefix}-form`}
    >
      <Text
        style={[
          styles.manualEntryTitle,
          compactMode ? styles.manualEntryTitleCompact : null,
          heroMode ? styles.manualEntryTitleHero : null,
        ]}
      >
        {title}
      </Text>
      {showSubtitle ? (
        <Text
          style={[
            styles.manualEntrySubtitle,
            heroMode ? styles.manualEntrySubtitleHero : null,
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
      <View
        style={[styles.manualInputRow, stackConnect ? styles.manualInputColumn : null]}
        testID={`${testIDPrefix}-input-row`}
      >
        <TextInput
          style={[
            styles.manualInput,
            compactMode ? styles.manualInputCompact : null,
            stackConnect ? styles.manualInputStacked : null,
          ]}
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
          style={[
            styles.manualButton,
            compactMode ? styles.manualButtonCompact : null,
            stackConnect ? styles.manualButtonStacked : null,
          ]}
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
    marginTop: 4,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    gap: 12,
  },
  manualEntryPicker: {
    marginBottom: 4,
  },
  manualEntryCompact: {
    marginTop: 0,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
  },
  manualEntryHero: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
    gap: 10,
  },
  manualEntryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  manualEntryTitleCompact: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  manualEntryTitleHero: {
    fontSize: 17,
  },
  manualEntrySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  manualEntrySubtitleHero: {
    fontSize: 14,
    lineHeight: 20,
  },
  manualInputRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  manualInputColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  manualInput: {
    flex: 1,
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 14,
  },
  manualInputCompact: {
    height: 42,
    fontSize: 13,
    paddingHorizontal: 12,
  },
  manualInputStacked: {
    flex: undefined,
    width: '100%',
  },
  manualButton: {
    paddingVertical: 12,
    height: 48,
    minWidth: 100,
  },
  manualButtonCompact: {
    height: 42,
    minWidth: 88,
    paddingVertical: 10,
  },
  manualButtonStacked: {
    width: '100%',
    minWidth: undefined,
  },
  manualError: {
    fontSize: 13,
    color: colors.error,
    lineHeight: 18,
  },
});
