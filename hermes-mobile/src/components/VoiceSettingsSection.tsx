import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Switch } from 'react-native';
import GlassCard from './GlassCard';
import { colors } from '../theme/colors';
import {
  HERMES_VOICES,
  type HermesVoicePreset,
  loadVoicePreferences,
  playVoicePreview,
  setPreferredVoice,
  setSpeakRepliesAloud,
  setStartWithVoice,
} from '../services/voiceService';

export default function VoiceSettingsSection() {
  const [activeVoice, setActiveVoiceState] = useState<HermesVoicePreset>('cove');
  const [speakReplies, setSpeakRepliesState] = useState(true);
  const [startVoice, setStartVoiceState] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  useEffect(() => {
    loadVoicePreferences().then((prefs) => {
      setActiveVoiceState(prefs.preferredVoice);
      setSpeakRepliesState(prefs.speakReplies);
      setStartVoiceState(prefs.startVoice);
    });
  }, []);

  const handleSelectVoice = async (voice: HermesVoicePreset) => {
    setActiveVoiceState(voice);
    await setPreferredVoice(voice);
    const phrase = playVoicePreview(voice);
    setPreviewingVoice(phrase);
    setTimeout(() => {
      setPreviewingVoice(null);
    }, 2800);
  };

  const handleToggleSpeakReplies = async (val: boolean) => {
    setSpeakRepliesState(val);
    await setSpeakRepliesAloud(val);
  };

  const handleToggleStartVoice = async (val: boolean) => {
    setStartVoiceState(val);
    await setStartWithVoice(val);
  };

  return (
    <GlassCard style={styles.card} testID="voice-settings-card">
      <Text style={styles.description}>
        ChatGPT Voice patterns: speak inside chat, edit the transcript, hear replies aloud. Standard
        mode transcribes before send. Live duplex is not required for Hermes agent work.
      </Text>

      <View style={styles.divider} />

      <View style={styles.switchRow}>
        <View style={styles.switchLabelCol}>
          <Text style={styles.switchLabel}>Speak replies aloud</Text>
          <Text style={styles.switchDesc}>
            TTS for assistant messages (also on in Glance / audio-first mode)
          </Text>
        </View>
        <Switch
          value={speakReplies}
          onValueChange={handleToggleSpeakReplies}
          testID="voice-speak-replies-switch"
          trackColor={{ false: '#1F2937', true: colors.primary }}
          thumbColor={speakReplies ? '#ffffff' : '#9CA3AF'}
        />
      </View>

      <View style={styles.divider} />

      <View style={styles.switchRow}>
        <View style={styles.switchLabelCol}>
          <Text style={styles.switchLabel}>Start with Voice</Text>
          <Text style={styles.switchDesc}>Open the mic when you land on an empty chat</Text>
        </View>
        <Switch
          value={startVoice}
          onValueChange={handleToggleStartVoice}
          testID="voice-start-with-voice-switch"
          trackColor={{ false: '#1F2937', true: colors.primary }}
          thumbColor={startVoice ? '#ffffff' : '#9CA3AF'}
        />
      </View>

      <View style={styles.divider} />

      <Text style={styles.switchLabel}>Preferred voice</Text>
      <Text style={styles.switchDesc}>Tone presets for spoken replies — tap to preview sound</Text>

      <View style={styles.voiceGrid} testID="voice-preset-grid">
        {HERMES_VOICES.map((v) => {
          const isSelected = activeVoice === v.id;
          return (
            <TouchableOpacity
              key={v.id}
              style={[styles.voiceChip, isSelected && styles.voiceChipActive]}
              onPress={() => handleSelectVoice(v.id)}
              testID={`voice-chip-${v.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Select ${v.label} voice`}
            >
              <Text style={[styles.voiceChipText, isSelected && styles.voiceChipTextActive]}>
                {v.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {previewingVoice ? (
        <View style={styles.previewBox} testID="voice-preview-banner">
          <Text style={styles.previewSpeakerIcon}>🔊</Text>
          <Text style={styles.previewText} numberOfLines={2}>
            {previewingVoice}
          </Text>
        </View>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchLabelCol: {
    flex: 1,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  switchDesc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  voiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  voiceChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  voiceChipActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.22)',
    borderColor: colors.primary,
  },
  voiceChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  voiceChipTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    marginTop: 6,
  },
  previewSpeakerIcon: {
    fontSize: 16,
  },
  previewText: {
    flex: 1,
    fontSize: 12,
    color: colors.secondary,
    fontStyle: 'italic',
  },
});
