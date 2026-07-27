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
    // Preserve both exact product-name intents in the indexed title. The live iOS
    // App Info name is locked until the next approved version; this combined name
    // is staged for 1.4 and must remain aligned with the paid Play listing.
    expect(playTitle).toBe('Hermes Mobile: AI Agent Leash');
    expect(paidTitle).toBe('Hermes Mobile: AI Agent Leash');
    expect(iosName).toBe('Hermes Mobile: AI Agent Leash');
    expect(playTitle).toBe(paidTitle);
    expect(playTitle).toBe(iosName);
    expect(playTitle).not.toMatch(/ThumbGate/i);
    expect(paidTitle).not.toMatch(/ThumbGate/i);
  });

  it('Play descriptions stay within limits and the paid listing targets Hermes AI intent', () => {
    const short = read(path.join(ANDROID, 'short_description.txt'));
    const paidShort = read(path.join(ANDROID, 'paid_short_description.txt'));
    expect(short.length).toBeLessThanOrEqual(80);
    expect(paidShort.length).toBeLessThanOrEqual(80);
    // The unpublished legacy package remains source-compatible while the live paid
    // package follows current Play guidance: communicate the job, not price promotion.
    expect(short).toMatch(/Mac/i);
    expect(short).toMatch(/4\.99/);
    expect(short).not.toMatch(/19\.99/);
    expect(short).toMatch(/once/i);
    expect(short).toMatch(/not phone AI/i);
    expect(paidShort).toMatch(/Hermes AI/i);
    expect(paidShort).toMatch(/from your phone/i);
    expect(paidShort).toMatch(/approve tools/i);
    expect(paidShort).not.toMatch(/\$|free|no ads/i);
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
    expect(paidFull).toMatch(/PAID-UPFRONT APP/i);
    expect(paidFull).toMatch(/desktop AI agent/i);
    expect(paidFull).toMatch(/remote AI agent/i);
    expect(paidFull).toMatch(/Mac, Windows, (and )?Linux/i);
    expect(paidFull).not.toMatch(/free package .*remains available/i);
    expect(paidFull).not.toMatch(/#1|best app|top-ranked/i);
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
    expect(keywords).toMatch(/remote,coding,assistant,desktop,control/i);
    expect(keywords).toMatch(/linux,windows,selfhosted,local,computer/i);
    expect(keywords).not.toMatch(/\s/);
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
