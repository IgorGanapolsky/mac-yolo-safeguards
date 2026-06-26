import { Linking } from 'react-native';
import {
  openHermesTelegramBot,
  isHermesSlashCommand,
  isTelegramChatContext,
  HERMES_TELEGRAM_BOT_USERNAME,
  MOBILE_CHAT_HINT,
} from '../utils/telegramSync';

describe('telegramSync', () => {
  it('detects gateway slash commands', () => {
    expect(isHermesSlashCommand('/approve deploy triage fit')).toBe(true);
    expect(isHermesSlashCommand('Approve deploy triage fit')).toBe(false);
  });

  it('recognizes telegram session context', () => {
    expect(isTelegramChatContext({ source: 'telegram', id: 'tg-1' })).toBe(true);
    expect(isTelegramChatContext({ id: '__telegram_inbox__' })).toBe(true);
    expect(isTelegramChatContext({ source: 'cli', id: 'x' })).toBe(false);
  });

  it('documents mobile chat slash routing', () => {
    expect(MOBILE_CHAT_HINT).toContain('/approve');
    expect(HERMES_TELEGRAM_BOT_USERNAME).toBe('igor_hermes_bot');
  });

  it('opens telegram bot via Linking when available', async () => {
    const canOpenURL = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    const opened = await openHermesTelegramBot();
    expect(opened).toBe(true);
    expect(canOpenURL).toHaveBeenCalled();
    expect(openURL).toHaveBeenCalled();
  });
});
