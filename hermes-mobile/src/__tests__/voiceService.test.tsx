import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  HERMES_VOICES,
  loadVoicePreferences,
  setPreferredVoice,
  setSpeakRepliesAloud,
  setStartWithVoice,
  playVoicePreview,
} from '../services/voiceService';
import VoiceSettingsSection from '../components/VoiceSettingsSection';

describe('voiceService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('provides 6 distinct voice presets', () => {
    expect(HERMES_VOICES).toHaveLength(6);
    expect(HERMES_VOICES.map((v) => v.id)).toEqual([
      'system',
      'arbor',
      'cove',
      'ember',
      'juniper',
      'sol',
    ]);
  });

  it('persists and loads voice preferences', async () => {
    await setPreferredVoice('ember');
    await setSpeakRepliesAloud(false);
    await setStartWithVoice(true);

    const prefs = await loadVoicePreferences();
    expect(prefs.preferredVoice).toBe('ember');
    expect(prefs.speakReplies).toBe(false);
    expect(prefs.startVoice).toBe(true);
  });

  it('plays voice preview and returns the phrase', () => {
    const phrase = playVoicePreview('sol');
    expect(phrase).toContain("Sol ultrafast");
  });
});

describe('VoiceSettingsSection component', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('renders all voice options and triggers preview on voice chip press', async () => {
    const { getByTestId, getByText } = render(<VoiceSettingsSection />);

    expect(getByTestId('voice-settings-card')).toBeTruthy();
    expect(getByTestId('voice-preset-grid')).toBeTruthy();
    expect(getByText('System')).toBeTruthy();
    expect(getByText('Arbor')).toBeTruthy();
    expect(getByText('Cove')).toBeTruthy();
    expect(getByText('Ember')).toBeTruthy();
    expect(getByText('Juniper')).toBeTruthy();
    expect(getByText('Sol')).toBeTruthy();

    fireEvent.press(getByTestId('voice-chip-ember'));

    await waitFor(() => {
      expect(getByTestId('voice-preview-banner')).toBeTruthy();
      expect(getByText(/Ember voice is tuned for fast action/i)).toBeTruthy();
    });
  });

  it('toggles speak replies and start with voice switches', async () => {
    const { getByTestId } = render(<VoiceSettingsSection />);

    fireEvent(getByTestId('voice-speak-replies-switch'), 'valueChange', false);
    fireEvent(getByTestId('voice-start-with-voice-switch'), 'valueChange', true);

    await waitFor(async () => {
      const prefs = await loadVoicePreferences();
      expect(prefs.speakReplies).toBe(false);
      expect(prefs.startVoice).toBe(true);
    });
  });
});
