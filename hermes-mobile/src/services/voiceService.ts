import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { haptics } from './haptics';

export type HermesVoicePreset = 'system' | 'arbor' | 'cove' | 'ember' | 'juniper' | 'sol';

export interface VoiceMetadata {
  id: HermesVoicePreset;
  label: string;
  description: string;
  previewPhrase: string;
  pitch: number;
  rate: number;
}

export const HERMES_VOICES: VoiceMetadata[] = [
  {
    id: 'system',
    label: 'System',
    description: 'Default OS speech synthesizer',
    previewPhrase: "Hi, I'm Hermes. Using your default system voice.",
    pitch: 1.0,
    rate: 1.0,
  },
  {
    id: 'arbor',
    label: 'Arbor',
    description: 'Warm, measured baritone tone',
    previewPhrase: "Hi, I'm Hermes. Arbor voice is active and ready for work.",
    pitch: 0.85,
    rate: 0.95,
  },
  {
    id: 'cove',
    label: 'Cove',
    description: 'Calm, clear conversational tone',
    previewPhrase: "Hi, I'm Hermes. Cove voice is selected for clear dialogue.",
    pitch: 1.05,
    rate: 1.0,
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Energetic, dynamic tone',
    previewPhrase: "Hi, I'm Hermes. Ember voice is tuned for fast action.",
    pitch: 1.15,
    rate: 1.08,
  },
  {
    id: 'juniper',
    label: 'Juniper',
    description: 'Sharp, analytical tone',
    previewPhrase: "Hi, I'm Hermes. Juniper voice is engaged for deep analysis.",
    pitch: 0.95,
    rate: 1.02,
  },
  {
    id: 'sol',
    label: 'Sol',
    description: 'Ultrafast, direct operator tone',
    previewPhrase: "Hi, I'm Hermes. Sol ultrafast voice stream engaged.",
    pitch: 1.0,
    rate: 1.25,
  },
];

const PREFERRED_VOICE_KEY = '@hermes_preferred_voice_v1';
const SPEAK_REPLIES_KEY = '@hermes_speak_replies_v1';
const START_WITH_VOICE_KEY = '@hermes_start_with_voice_v1';

let activeVoice: HermesVoicePreset = 'cove';
let speakRepliesAloud = true;
let startWithVoice = false;

export async function loadVoicePreferences(): Promise<{
  preferredVoice: HermesVoicePreset;
  speakReplies: boolean;
  startVoice: boolean;
}> {
  try {
    const [savedVoice, savedSpeak, savedStart] = await Promise.all([
      AsyncStorage.getItem(PREFERRED_VOICE_KEY),
      AsyncStorage.getItem(SPEAK_REPLIES_KEY),
      AsyncStorage.getItem(START_WITH_VOICE_KEY),
    ]);
    if (savedVoice) {
      activeVoice = savedVoice as HermesVoicePreset;
    }
    if (savedSpeak !== null) {
      speakRepliesAloud = savedSpeak === 'true';
    }
    if (savedStart !== null) {
      startWithVoice = savedStart === 'true';
    }
  } catch {
    // Fall back to defaults
  }
  return {
    preferredVoice: activeVoice,
    speakReplies: speakRepliesAloud,
    startVoice: startWithVoice,
  };
}

export async function setPreferredVoice(voice: HermesVoicePreset): Promise<void> {
  activeVoice = voice;
  try {
    await AsyncStorage.setItem(PREFERRED_VOICE_KEY, voice);
  } catch {
    // Ignore storage write failure
  }
}

export async function setSpeakRepliesAloud(enabled: boolean): Promise<void> {
  speakRepliesAloud = enabled;
  try {
    await AsyncStorage.setItem(SPEAK_REPLIES_KEY, String(enabled));
  } catch {
    // Ignore storage write failure
  }
}

export async function setStartWithVoice(enabled: boolean): Promise<void> {
  startWithVoice = enabled;
  try {
    await AsyncStorage.setItem(START_WITH_VOICE_KEY, String(enabled));
  } catch {
    // Ignore storage write failure
  }
}

export function getActiveVoice(): HermesVoicePreset {
  return activeVoice;
}

export function playVoicePreview(voice: HermesVoicePreset): string {
  haptics.selection();
  const metadata = HERMES_VOICES.find((v) => v.id === voice) ?? HERMES_VOICES[0];
  // Web Speech API / Native TTS preview fallback
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(metadata.previewPhrase);
      utterance.pitch = metadata.pitch;
      utterance.rate = metadata.rate;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore audio synthesis errors on unsupported browsers
    }
  }
  return metadata.previewPhrase;
}
