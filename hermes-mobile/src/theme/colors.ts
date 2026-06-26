export interface AppColors {
  backgroundStart: string;
  backgroundEnd: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderLight: string;
  cardBg: string;
  cardBgHover: string;
  success: string;
  error: string;
  warning: string;
  gateBlocked: string;
  userBubble: string;
  userBubbleText: string;
  composerSurface: string;
}

export const colors: AppColors = {
  backgroundStart: '#0B0F19',
  backgroundEnd: '#111827',
  primary: '#4F46E5',
  secondary: '#6366F1',
  accent: '#22D3EE',
  text: '#F9FAFB',
  textSecondary: '#D1D5DB',
  textMuted: '#9CA3AF',
  border: 'rgba(79, 70, 229, 0.2)',
  borderLight: 'rgba(255, 255, 255, 0.08)',
  cardBg: 'rgba(255, 255, 255, 0.04)',
  cardBgHover: 'rgba(255, 255, 255, 0.08)',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  gateBlocked: '#F87171',
  userBubble: '#3D3834',
  userBubbleText: '#F4F1EC',
  composerSurface: '#1A1D24',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};
