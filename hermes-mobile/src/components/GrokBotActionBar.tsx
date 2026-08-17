import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { BotPersona, BrainModel, TokenTelemetry } from '../types/grokBot';
import TokenEfficiencyMeter from './TokenEfficiencyMeter';

interface GrokBotActionBarProps {
  activePersona: BotPersona;
  activeBrain: BrainModel;
  telemetry: TokenTelemetry;
  onOpenRoster: () => void;
  onOpenBrainPicker: () => void;
  onOpenComputerPane: () => void;
  onOpenRoutines: () => void;
}

export const GrokBotActionBar: React.FC<GrokBotActionBarProps> = ({
  activePersona,
  activeBrain,
  telemetry,
  onOpenRoster,
  onOpenBrainPicker,
  onOpenComputerPane,
  onOpenRoutines,
}) => {
  return (
    <View style={styles.wrapper}>
      {/* Top action row */}
      <View style={styles.actionRow}>
        {/* Active Bot Persona Chip */}
        <Pressable
          style={styles.personaChip}
          onPress={onOpenRoster}
          accessibilityRole="button"
          accessibilityLabel={`Active bot: ${activePersona.name}. Tap to switch bot persona.`}
        >
          <View
            style={[
              styles.avatarDot,
              { backgroundColor: activePersona.avatarColor },
            ]}
          />
          <Text style={styles.personaText} numberOfLines={1}>
            {activePersona.name}
          </Text>
          <Text style={styles.chevron}>▾</Text>
        </Pressable>

        {/* Brain Model Chip */}
        <Pressable
          style={styles.brainChip}
          onPress={onOpenBrainPicker}
          accessibilityRole="button"
          accessibilityLabel={`Active model: ${activeBrain.name}. Tap to switch brain.`}
        >
          <Text style={styles.brainIcon}>🧠</Text>
          <Text style={styles.brainText} numberOfLines={1}>
            {activeBrain.isZeroMarginalCost ? '$0' : 'MoE'}{' '}
            {activeBrain.provider.toUpperCase()}
          </Text>
          <Text style={styles.chevron}>▾</Text>
        </Pressable>

        {/* Live Computer Screen Button */}
        <Pressable
          style={styles.toolBtn}
          onPress={onOpenComputerPane}
          accessibilityRole="button"
          accessibilityLabel="Open live computer desktop pane"
        >
          <Text style={styles.toolIcon}>🖥️</Text>
          <Text style={styles.toolText}>Screen</Text>
        </Pressable>

        {/* Outcome Routines Button */}
        <Pressable
          style={styles.toolBtn}
          onPress={onOpenRoutines}
          accessibilityRole="button"
          accessibilityLabel="Open automated outcome routines"
        >
          <Text style={styles.toolIcon}>⏱️</Text>
          <Text style={styles.toolText}>Routines</Text>
        </Pressable>
      </View>

      {/* Live token & noise reduction telemetry meter */}
      <TokenEfficiencyMeter telemetry={telemetry} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  personaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    flex: 1.2,
    gap: 6,
  },
  avatarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  personaText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  chevron: {
    fontSize: 10,
    color: colors.textMuted,
  },
  brainChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(79, 70, 229, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.3)',
    flex: 1,
    gap: 4,
  },
  brainIcon: {
    fontSize: 11,
  },
  brainText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A5B4FC',
    flex: 1,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 4,
  },
  toolIcon: {
    fontSize: 11,
  },
  toolText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});

export default GrokBotActionBar;
