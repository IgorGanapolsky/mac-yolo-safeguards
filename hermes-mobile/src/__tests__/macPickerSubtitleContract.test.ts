import fs from 'fs';
import path from 'path';

/**
 * Regression contract: the "Choose your computer" picker subtitle must not promise
 * automatic USB connection to real Play/App Store users.
 *
 * USB from a release build only works when the phone is cabled to a computer running
 * Hermes with Android USB debugging enabled (adb reverse). The previous copy said the
 * phone would "prefer" a cabled Mac automatically, which is false for normal users.
 */

describe('Mac picker subtitle contract', () => {
  const chatScreenPath = path.join(__dirname, '../screens/ChatScreen.tsx');
  const source = fs.readFileSync(chatScreenPath, 'utf8');

  it('does not promise automatic USB preference', () => {
    expect(source).not.toMatch(/preferred automatically/i);
  });

  it('explains USB needs Hermes desktop and USB debugging', () => {
    expect(source).toMatch(/USB debugging enabled/i);
  });

  it('offers QR code scan as the primary fallback', () => {
    expect(source).toMatch(/scan the QR code/i);
  });
});
