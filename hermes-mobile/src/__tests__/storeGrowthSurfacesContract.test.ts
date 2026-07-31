import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

describe('store growth surfaces', () => {
  const csl = readJson('docs/store-assets/csl-definitions-20260715.json');
  const cpp = readJson('docs/store-assets/cpp-definitions-20260715.json');
  const appleKeywords = new Set(
    fs
      .readFileSync(path.join(ROOT, 'fastlane/metadata/ios/en-US/keywords.txt'), 'utf8')
      .trim()
      .split(','),
  );

  test('Google custom listings target only the paid app with policy-safe copy', () => {
    expect(csl.package).toBe('com.iganapolsky.hermesmobile.paid');
    expect(csl.listings).toHaveLength(3);

    const allKeywords: string[] = [];
    for (const listing of csl.listings) {
      expect(listing.targeting.type).toBe('searchKeywords');
      expect(listing.targeting.keywords.length).toBeGreaterThan(0);
      expect(listing.appName.length).toBeLessThanOrEqual(30);
      expect(listing.shortDescription.length).toBeLessThanOrEqual(80);
      expect(listing.fullDescriptionSource).toBe(
        '../../fastlane/metadata/android/en-US/paid_full_description.txt',
      );
      expect(
        fs.existsSync(path.join(ROOT, 'docs/store-assets', listing.fullDescriptionSource)),
      ).toBe(true);

      const policyText = `${listing.appName} ${listing.shortDescription}`.toLowerCase();
      expect(policyText).not.toMatch(
        /#1|best|free download|\$|19\.99|cursor|claude|openai|chatgpt|gemini|replit|copilot|windsurf|openclaw/,
      );
      allKeywords.push(...listing.targeting.keywords.map((keyword: string) => keyword.toLowerCase()));
    }
    expect(new Set(allKeywords).size).toBe(allKeywords.length);
  });

  test('Apple custom pages use unique staged keywords and complete assets', () => {
    expect(cpp.ascAppId).toBe('6786778037');
    expect(cpp.templateVersion).toBe('1.4');
    expect(cpp.pages).toHaveLength(3);

    const liveKeywordIds = new Set(cpp.liveKeywordIds);
    const allKeywords: string[] = [];
    const allNextKeywords: string[] = [];
    for (const page of cpp.pages) {
      expect(page.name.length).toBeGreaterThan(0);
      expect(page.promotionalText.length).toBeLessThanOrEqual(170);
      expect(page.keywordIds.length).toBeGreaterThan(0);
      for (const keyword of page.keywordIds) {
        expect(liveKeywordIds.has(keyword)).toBe(true);
        allKeywords.push(keyword);
      }
      for (const keyword of page.nextKeywordIds) {
        expect(appleKeywords.has(keyword)).toBe(true);
        allNextKeywords.push(keyword);
      }
    }
    expect(new Set(allKeywords).size).toBe(allKeywords.length);
    expect(new Set(allNextKeywords).size).toBe(allNextKeywords.length);

    const files = fs.readdirSync(path.join(ROOT, 'fastlane/screenshots/en-US'));
    expect(files.filter((name) => /_67\.png$/.test(name))).toHaveLength(6);
    expect(files.filter((name) => /_ipad129\.png$/.test(name))).toHaveLength(6);
  });

});
