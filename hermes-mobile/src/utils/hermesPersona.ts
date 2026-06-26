import type { HermesAvatar, HermesPersona } from '../types/gateway';

export type HermesPersonaCopy = {
  key: HermesPersona;
  label: string;
  tagline: string;
  stylePrompt: string;
};

export type HermesAvatarCopy = {
  key: HermesAvatar;
  emoji: string;
  label: string;
  aura: string;
};

export const PERSONAS: HermesPersonaCopy[] = [
  {
    key: 'operator',
    label: 'Operator',
    tagline: 'Fast, direct, evidence-first.',
    stylePrompt:
      'Style: crisp operator. Be concise, decisive, and evidence-first. Keep personality warm but never sacrifice execution.',
  },
  {
    key: 'coach',
    label: 'Coach',
    tagline: 'Encouraging, clear, momentum-focused.',
    stylePrompt:
      'Style: practical coach. Be encouraging and clear. Turn messy work into the next confident action while preserving evidence.',
  },
  {
    key: 'spark',
    label: 'Spark',
    tagline: 'Playful, energetic, still serious about proof.',
    stylePrompt:
      'Style: playful technical partner. Add lightness and momentum, but keep claims verified and never invent outcomes.',
  },
];

export const AVATARS: HermesAvatarCopy[] = [
  { key: 'orb', emoji: '◉', label: 'Orb', aura: 'calm signal' },
  { key: 'bolt', emoji: '⚡', label: 'Bolt', aura: 'fast action' },
  { key: 'navigator', emoji: '✦', label: 'Navigator', aura: 'route finder' },
  { key: 'guardian', emoji: '◆', label: 'Guardian', aura: 'approval shield' },
];

export function personaCopy(key?: HermesPersona): HermesPersonaCopy {
  return PERSONAS.find((persona) => persona.key === key) ?? PERSONAS[0];
}

export function avatarCopy(key?: HermesAvatar): HermesAvatarCopy {
  return AVATARS.find((avatar) => avatar.key === key) ?? AVATARS[0];
}

export function buildPersonaSystemPrompt(persona?: HermesPersona): string {
  return [
    'Hermes mobile presentation style:',
    `- ${personaCopy(persona).stylePrompt}`,
    '- This is style guidance only. Safety, scope, approval, and execution directives override persona.',
  ].join('\n');
}
