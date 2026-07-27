import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const chat = fs.readFileSync(
  path.join(root, 'hermes-mobile/src/screens/ChatScreen.tsx'),
  'utf8',
);

describe('chat list implementation contract', () => {
  it('uses RN FlatList — FlashList max-update-depth kept crashing production OTAs', () => {
    expect(chat).toMatch(/\bFlatList\b/);
    expect(chat).not.toMatch(/@shopify\/flash-list/);
    expect(chat).not.toMatch(/import \{[^}]*FlashList/);
  });
});
