import { Linking, Platform } from 'react-native';

/** Optional deep link to Telegram bot (legacy); mobile Chat sends slash commands to the gateway. */
export const HERMES_TELEGRAM_BOT_USERNAME = 'igor_hermes_bot';

const SLASH_PREFIX = /^\/[a-z][a-z0-9_-]*/i;

export function isHermesSlashCommand(text: string): boolean {
  return SLASH_PREFIX.test(text.trim());
}

export function isTelegramChatContext(session: { source?: string; id?: string } | null): boolean {
  if (!session) return false;
  if (session.id === '__telegram_inbox__') return true;
  const source = session.source?.toLowerCase() ?? '';
  return source.includes('telegram');
}

export async function openHermesTelegramBot(): Promise<boolean> {
  const urls = Platform.select({
    ios: [`tg://resolve?domain=${HERMES_TELEGRAM_BOT_USERNAME}`, `https://t.me/${HERMES_TELEGRAM_BOT_USERNAME}`],
    android: [`https://t.me/${HERMES_TELEGRAM_BOT_USERNAME}`, `tg://resolve?domain=${HERMES_TELEGRAM_BOT_USERNAME}`],
    default: [`https://t.me/${HERMES_TELEGRAM_BOT_USERNAME}`],
  }) ?? [`https://t.me/${HERMES_TELEGRAM_BOT_USERNAME}`];

  for (const url of urls) {
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) continue;
      await Linking.openURL(url);
      return true;
    } catch {
      // try next scheme
    }
  }
  return false;
}

export const MOBILE_CHAT_HINT =
  'Type messages or slash commands (/help, /approve, /status) here — they go to your computer gateway.';
