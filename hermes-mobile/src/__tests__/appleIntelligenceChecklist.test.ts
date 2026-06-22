import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Apple Intelligence checklist (repo contract)', () => {
  it('ships App Intents Swift sources + expo plugin', () => {
    expect(read('native-intelligence/swift/HermesAppIntents.swift')).toContain('ApproveTopPendingIntent');
    expect(read('native-intelligence/swift/HermesAppIntents.swift')).toContain('HermesShortcuts');
    expect(read('plugins/withHermesAppleIntelligence.js')).toContain('NSSiriUsageDescription');
    expect(read('app.json')).toContain('withHermesAppleIntelligence');
  });

  it('defines entity schema for pending approvals', () => {
    expect(read('native-intelligence/swift/HermesIntentEntities.swift')).toContain(
      'HermesPendingApprovalEntity',
    );
  });

  it('bridges Siri deep links into Gateway agent tools', () => {
    expect(read('src/hooks/useHermesDeepLinks.ts')).toContain('leash/approve');
    expect(read('App.tsx')).toContain('useHermesDeepLinks');
    expect(read('App.tsx')).toContain("prefixes: ['hermes://']");
  });

  it('documents Apple Intelligence mapping', () => {
    const doc = read('docs/APPLE_INTELLIGENCE_CHECKLIST.md');
    expect(doc).toContain('developer.apple.com/apple-intelligence');
    expect(doc).toContain('App Intents');
  });
});
