import fs from 'fs';
import path from 'path';
import { buildApprovalSummaryPrompt } from '../utils/approvalSummaryPrompt';

const root = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Machine Learning checklist (repo contract)', () => {
  it('ships Foundation Models + Vision + Speech Swift scaffolds', () => {
    expect(read('native-intelligence/swift/HermesFoundationModelsBridge.swift')).toContain(
      'HermesFoundationModelsBridge',
    );
    expect(read('native-intelligence/swift/HermesVisionBridge.swift')).toContain(
      'VNRecognizeTextRequest',
    );
    expect(read('native-intelligence/swift/HermesSpeechBridge.swift')).toContain(
      'SFSpeechRecognizer',
    );
  });

  it('exposes RN Apple ML bridge with graceful fallback', () => {
    expect(read('src/native/hermesAppleMl.ts')).toContain('summarizeApprovalDiff');
    expect(read('src/native/hermesAppleMl.ts')).toContain('HermesAppleMl');
    expect(read('src/native/hermesAppleMl.ts')).toContain('buildApprovalSummaryPrompt');
  });

  it('builds Leash-focused approval summary prompts', () => {
    const prompt = buildApprovalSummaryPrompt('rm -rf /tmp/foo', 'run_command');
    expect(prompt).toContain('ThumbGate-blocked');
    expect(prompt).toContain('run_command');
    expect(prompt).toContain('rm -rf');
  });

  it('documents Apple ML mapping', () => {
    const doc = read('docs/MACHINE_LEARNING_CHECKLIST.md');
    expect(doc).toContain('developer.apple.com/machine-learning');
    expect(doc).toContain('Foundation Models');
    expect(doc).toContain('Core AI');
    expect(doc).toContain('MLX');
  });

  it('cross-links Apple Intelligence checklist', () => {
    expect(read('docs/APPLE_INTELLIGENCE_CHECKLIST.md')).toContain('MACHINE_LEARNING_CHECKLIST');
  });
});
