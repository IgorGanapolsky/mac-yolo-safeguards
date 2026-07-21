import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../..');
const ANDROID = path.join(ROOT, 'fastlane/metadata/android/en-US');
const IOS = path.join(ROOT, 'fastlane/metadata/ios/en-US');

function read(p: string): string {
  return fs.readFileSync(p, 'utf8').replace(/\s+$/, '');
}

describe('store listing metadata contract (stellar live)', () => {
  it('Play and iOS titles lead with Hermes AI Agent Leash', () => {
    const playTitle = read(path.join(ANDROID, 'title.txt'));
    const iosName = read(path.join(IOS, 'name.txt'));
    expect(playTitle.length).toBeLessThanOrEqual(30);
    expect(iosName.length).toBeLessThanOrEqual(30);
    expect(playTitle).toBe('Hermes AI Agent Leash');
    expect(iosName).toBe('Hermes AI Agent Leash');
  });

  it('Play short description is Mac-remote wedge within 80 chars', () => {
    const short = read(path.join(ANDROID, 'short_description.txt'));
    expect(short.length).toBeLessThanOrEqual(80);
    expect(short).toMatch(/Hermes AI/i);
    expect(short).toMatch(/Mac/i);
    expect(short).toMatch(/4\.99/);
    expect(short).not.toMatch(/19\.99/);
    expect(short).toMatch(/once/i);
    expect(short).toMatch(/not phone AI/i);
  });

  it('Play full description does not claim iOS is still in review', () => {
    const full = read(path.join(ANDROID, 'full_description.txt'));
    expect(full.length).toBeLessThanOrEqual(4000);
    expect(full).not.toMatch(/iOS is in App Store review/i);
    expect(full).toMatch(/live on (the )?App Store/i);
    expect(full).toMatch(/Looking for .Hermes Agent/i);
    expect(full).toMatch(/Tailscale/i);
    expect(full).toMatch(/Hen Works/i);
  });

  it('Play phone screenshots are present and distinct filenames', () => {
    const dir = path.join(ANDROID, 'images/phoneScreenshots');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    expect(files).toEqual([
      '01_approve.png',
      '02_block.png',
      '03_standing.png',
      '04_pair.png',
      '05_thumbgate.png',
      '06_works.png',
    ]);
  });

  it('iOS subtitle and promo fit limits and avoid review-stale language', () => {
    const subtitle = read(path.join(IOS, 'subtitle.txt'));
    const promo = read(path.join(IOS, 'promotional_text.txt'));
    const keywords = read(path.join(IOS, 'keywords.txt'));
    expect(subtitle.length).toBeLessThanOrEqual(30);
    expect(promo.length).toBeLessThanOrEqual(170);
    expect(keywords.length).toBeLessThanOrEqual(100);
    expect(promo).not.toMatch(/in App Store review/i);
    expect(subtitle).not.toMatch(/Claude Code|Cursor/i);
    // Product subtitle: Hermes-on-Mac chat (not generic "Control Mac agents")
    expect(subtitle).toMatch(/Hermes/i);
    expect(subtitle).toMatch(/Mac/i);
    expect(promo).toMatch(/not a phone chatbot|not phone/i);
  });

  it('iOS promo and Play copy use paid-upfront pricing', () => {
    const promo = read(path.join(IOS, 'promotional_text.txt'));
    const full = read(path.join(ANDROID, 'full_description.txt'));
    expect(promo).toMatch(/pay once|once/i);
    expect(promo).not.toMatch(/19\.99\/mo/);
    expect(full).toMatch(/4\.99/);
    expect(full).not.toMatch(/LEASH PRO \(\$19\.99\/mo\)/i);
    expect(full).toMatch(/pay once|\$4\.99 once/i);
    expect(full).not.toMatch(/19\.99\/mo/);
  });

  it('review prompt threshold is first approval (stellar bar)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { STORE_REVIEW_THRESHOLD } = require('../services/storeReview') as {
      STORE_REVIEW_THRESHOLD: number;
    };
    expect(STORE_REVIEW_THRESHOLD).toBe(1);
  });
});
