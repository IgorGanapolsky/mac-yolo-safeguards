import fs from 'fs';
import path from 'path';

/**
 * When the attach sheet is open, empty-state "Type a message below" must not
 * remain visible under the sheet (looks like a broken composer).
 */
describe('attachSheetEmptyHintContract', () => {
  const chatScreenSource = fs.readFileSync(
    path.join(__dirname, '../screens/ChatScreen.tsx'),
    'utf8',
  );

  it('hides empty type-below hint while attach picker is visible', () => {
    expect(chatScreenSource).toContain('chat-empty-type-below-hint');
    expect(chatScreenSource).toMatch(
      /attachPickerVisible\s*\?\s*null\s*:\s*\(\s*<Text[^>]*testID="chat-empty-type-below-hint"/s,
    );
    expect(chatScreenSource).toContain('!currentSession && !attachPickerVisible');
  });
});
