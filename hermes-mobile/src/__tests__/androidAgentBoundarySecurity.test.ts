import fs from 'fs';
import path from 'path';

const repositoryRoot = path.resolve(__dirname, '../../..');
const automationPaths = [
  'hermes-mobile/scripts/capture-store-screenshots.sh',
  'hermes-mobile/scripts/recapture-store-screenshots.py',
] as const;

const readAutomation = (relativePath: (typeof automationPaths)[number]) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

describe('Android agent automation boundary', () => {
  const sources = automationPaths.map(readAutomation).join('\n');

  it('streams screenshots directly instead of writing predictable device-side PNG files', () => {
    expect(readAutomation(automationPaths[0])).toContain(
      'exec-out screencap -p',
    );
    expect(readAutomation(automationPaths[1])).toContain(
      '["adb", "-s", DEVICE, "exec-out", "screencap", "-p"]',
    );
    expect(sources).not.toMatch(/\/sdcard\/[^\s"']*\.png/i);
  });

  it('does not introduce unauthenticated ADB keyboard broadcasts', () => {
    expect(sources).not.toMatch(/ADB_INPUT_(?:TEXT|B64)/);
    expect(sources).not.toMatch(/\bam\s+(?:broadcast|send-broadcast)\b/i);
  });

  it('does not enable shell parsing in child-process APIs', () => {
    expect(sources).not.toMatch(/\bshell\s*[:=]\s*(?:true|True)\b/);
  });

  it('publishes the enabled private vulnerability reporting channel', () => {
    const securityPolicy = fs.readFileSync(
      path.join(repositoryRoot, 'SECURITY.md'),
      'utf8',
    );
    expect(securityPolicy).toContain(
      'https://github.com/IgorGanapolsky/mac-yolo-safeguards/security/advisories/new',
    );
    expect(securityPolicy).toContain('Do not open a public issue');
  });
});
