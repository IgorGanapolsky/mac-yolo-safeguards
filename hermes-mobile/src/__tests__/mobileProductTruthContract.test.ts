import fs from 'fs';
import path from 'path';

const SRC_ROOT = path.join(__dirname, '..');

function productionSource(): string {
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') visit(absolute);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        files.push(absolute);
      }
    }
  };
  visit(SRC_ROOT);
  return files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}

describe('mobile product truth contract', () => {
  const source = productionSource();

  it('never exposes legacy connection jargon', () => {
    expect(source).not.toMatch(/Needs computer link|Still checking your computer link/i);
  });

  it('never exposes a second mobile purchase or restore path', () => {
    expect(source).not.toMatch(
      /Unlock in Google Play|Restore purchases|Free tier includes|Hermes Chat is free|requestPurchase/,
    );
  });

  it('labels the thread date as its start time', () => {
    const header = fs.readFileSync(
      path.join(SRC_ROOT, 'components/ChatScreenHeader.tsx'),
      'utf8',
    );
    const sessionDisplay = fs.readFileSync(
      path.join(SRC_ROOT, 'utils/sessionDisplay.ts'),
      'utf8',
    );
    expect(sessionDisplay).toMatch(/return `Started \$\{date\.toLocaleString/);
    expect(header).toMatch(/\{threadCreatedLabel\}/);
  });
});
