import { measureFunction } from 'reassure';
import {
  formatMessageForDisplay,
  unescapeChatText,
} from '../utils/chatMessageDisplay';

// Hot path: every message bubble render formats its content. A long agent
// transcript (tool output, code blocks, escapes) is the worst case the phone
// actually hits — regressions here directly slow message send/receive feel.
function syntheticTranscript(lines: number): string {
  const parts: string[] = [];
  for (let i = 0; i < lines; i += 1) {
    parts.push(
      `Line ${i}: tool.completed \\"terminal\\" output with \\n escapes and ` +
        '```ts\nconst x = ' +
        i +
        ';\n``` plus some **markdown** and a URL https://example.com/path?q=' +
        i,
    );
  }
  return parts.join('\\n');
}

const SMALL = syntheticTranscript(10);
const LARGE = syntheticTranscript(400);

test('formatMessageForDisplay — small message', async () => {
  await measureFunction(() => formatMessageForDisplay(SMALL));
});

test('formatMessageForDisplay — large transcript', async () => {
  await measureFunction(() => formatMessageForDisplay(LARGE));
});

test('unescapeChatText — large transcript', async () => {
  await measureFunction(() => unescapeChatText(LARGE));
});
