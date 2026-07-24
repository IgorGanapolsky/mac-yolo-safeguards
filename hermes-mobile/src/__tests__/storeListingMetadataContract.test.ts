import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../..');
const ANDROID = path.join(ROOT, 'fastlane/metadata/android/en-US');
const IOS = path.join(ROOT, 'fastlane/metadata/ios/en-US');

function read(p: string): string {
  return fs.readFileSync(p, 'utf8').replace(/\s+$/, '');
}

describe('store listing metadata contract (stellar live)', () => {
  it('Play free/paid + iOS share one product name, never a different brand (e.g. ThumbGate)', () => {
    const playTitle = read(path.join(ANDROID, 'title.txt'));
    const paidTitle = read(path.join(ANDROID, 'paid_title.txt'));
    const iosName = read(path.join(IOS, 'name.txt'));
    expect(playTitle.length).toBeLessThanOrEqual(30);
    expect(paidTitle.length).toBeLessThanOrEqual(30);
    expect(iosName.length).toBeLessThanOrEqual(30);
    // Canonical name pinned to the live, ASC-locked iOS trackName (id 6786778037) so
    // free+paid Play and iOS never drift apart again. iOS App Info "Name" cannot be
    // patched on a READY_FOR_SALE version without a new build (confirmed 409 lock,
    // 2026-07-23 `cursor-asc-rename-ship`); "Hermes Mobile: AI Agent" stays staged in
    // ASC 1.4 for the next native build, at which point re-align all three together.
    expect(playTitle).toBe('Hermes AI Agent Leash');
    expect(paidTitle).toBe('Hermes AI Agent Leash');
    expect(iosName).toBe('Hermes AI Agent Leash');
    expect(playTitle).toBe(paidTitle);
    expect(playTitle).toBe(iosName);
    expect(playTitle).not.toMatch(/ThumbGate/i);
    expect(paidTitle).not.toMatch(/ThumbGate/i);
  });

  it('Play short description is Mac-remote wedge within 80 chars', () => {
    const short = read(path.join(ANDROID, 'short_description.txt'));
    const paidShort = read(path.join(ANDROID, 'paid_short_description.txt'));
    expect(short.length).toBeLessThanOrEqual(80);
    expect(paidShort.length).toBeLessThanOrEqual(80);
    // Title already carries "Hermes Mobile"; short spends chars on job + price + anti-confusion.
    expect(short).toMatch(/Mac/i);
    expect(short).toMatch(/4\.99/);
    expect(short).not.toMatch(/19\.99/);
    expect(short).toMatch(/once/i);
    expect(short).toMatch(/not phone AI/i);
    expect(paidShort).toMatch(/4\.99/);
    expect(paidShort).toMatch(/not phone AI/i);
    expect(paidShort).toMatch(/Pay once|paid/i);
  });

  it('Play full description does not claim iOS is still in review', () => {
    const full = read(path.join(ANDROID, 'full_description.txt'));
    const paidFull = read(path.join(ANDROID, 'paid_full_description.txt'));
    expect(full.length).toBeLessThanOrEqual(4000);
    expect(paidFull.length).toBeLessThanOrEqual(4000);
    expect(full).not.toMatch(/iOS is in App Store review/i);
    expect(full).toMatch(/live on (the )?App Store/i);
    expect(full).toMatch(/Looking for .Hermes Agent/i);
    expect(full).toMatch(/Tailscale/i);
    expect(full).toMatch(/Hen Works/i);
    expect(paidFull).toMatch(/PAID DOWNLOAD/i);
    expect(paidFull).toMatch(/Hen Works/i);
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
    expect(subtitle).toMatch(/Mac/i);
    expect(promo).toMatch(/not a phone chatbot|not phone/i);
    expect(promo).toMatch(/pay once|once/i);
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
