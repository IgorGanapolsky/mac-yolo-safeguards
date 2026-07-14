import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_CHAT_TEST_PROMPT = 'make money today';

describe('Hermes chat-input test prompt contract', () => {
  it('uses only the approved meaningful prompt in every Maestro chat flow', () => {
    const maestroDir = path.resolve(__dirname, '../../.maestro');
    const flowNames = [
      'chat-send-persistence.yaml',
      'regression-composer-typeable.yaml',
      'chat.yaml',
      'regression-chat-send-visible.yaml',
    ];

    for (const flowName of flowNames) {
      const source = fs.readFileSync(path.join(maestroDir, flowName), 'utf8');
      const prompts = [...source.matchAll(/- inputText:\s*["']([^"']+)["']/g)].map(
        (match) => match[1],
      );
      expect(prompts.length).toBeGreaterThan(0);
      expect(new Set(prompts)).toEqual(new Set([REQUIRED_CHAT_TEST_PROMPT]));
    }
  });
});
