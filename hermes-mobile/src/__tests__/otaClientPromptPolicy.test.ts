import {
  OTA_BILLING_FREEZE_UNTIL_MS,
  shouldSuppressOtaClientPrompts,
} from '../utils/otaClientPromptPolicy';

describe('otaClientPromptPolicy', () => {
  const prevPrompts = process.env.EXPO_PUBLIC_OTA_CLIENT_PROMPTS;
  const prevThaw = process.env.EXPO_PUBLIC_OTA_BILLING_THAW;

  afterEach(() => {
    if (prevPrompts === undefined) delete process.env.EXPO_PUBLIC_OTA_CLIENT_PROMPTS;
    else process.env.EXPO_PUBLIC_OTA_CLIENT_PROMPTS = prevPrompts;
    if (prevThaw === undefined) delete process.env.EXPO_PUBLIC_OTA_BILLING_THAW;
    else process.env.EXPO_PUBLIC_OTA_BILLING_THAW = prevThaw;
  });

  it('suppresses auto prompts during the Expo billing freeze window', () => {
    delete process.env.EXPO_PUBLIC_OTA_CLIENT_PROMPTS;
    delete process.env.EXPO_PUBLIC_OTA_BILLING_THAW;
    expect(shouldSuppressOtaClientPrompts(OTA_BILLING_FREEZE_UNTIL_MS - 1)).toBe(true);
  });

  it('stops suppressing after the freeze floor date', () => {
    delete process.env.EXPO_PUBLIC_OTA_CLIENT_PROMPTS;
    delete process.env.EXPO_PUBLIC_OTA_BILLING_THAW;
    expect(shouldSuppressOtaClientPrompts(OTA_BILLING_FREEZE_UNTIL_MS)).toBe(false);
  });

  it('thaws when EXPO_PUBLIC_OTA_BILLING_THAW=1', () => {
    process.env.EXPO_PUBLIC_OTA_BILLING_THAW = '1';
    expect(shouldSuppressOtaClientPrompts(OTA_BILLING_FREEZE_UNTIL_MS - 1)).toBe(false);
  });

  it('force-shows when EXPO_PUBLIC_OTA_CLIENT_PROMPTS=1', () => {
    process.env.EXPO_PUBLIC_OTA_CLIENT_PROMPTS = '1';
    expect(shouldSuppressOtaClientPrompts(OTA_BILLING_FREEZE_UNTIL_MS - 1)).toBe(false);
  });
});
