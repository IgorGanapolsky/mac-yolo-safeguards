import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('AI glasses checklist (repo contract)', () => {
  it('ships expo config plugin for Jetpack XR', () => {
    expect(read('plugins/withHermesAiGlasses.js')).toContain('androidx.xr.glimmer:glimmer');
    expect(read('plugins/withHermesAiGlasses.js')).toContain('XR_PROJECTED_LAUNCHER');
  });

  it('defines projected activity + shared ViewModel sources', () => {
    expect(read('native-glasses/kotlin/HermesGlassesProjectedActivity.kt')).toContain(
      'HermesGlassesProjectedActivity',
    );
    expect(read('native-glasses/kotlin/HermesGlassesViewModel.kt')).toContain('approveTop');
    expect(read('native-glasses/kotlin/HermesGatewayClient.kt')).toContain('/health');
  });

  it('keeps native launch API but never surfaces glasses UI in Settings (phone\u2194Mac product)', () => {
    expect(read('src/native/hermesGlasses.ts')).toContain('launchHermesOnGlasses');
    expect(read('app.json')).toContain('withHermesAiGlasses');
    const settings = read('src/screens/SettingsScreen.tsx');
    expect(settings).not.toContain('launch-on-glasses-button');
    expect(settings).not.toContain('GLASSES NOT CONNECTED');
    expect(settings).not.toMatch(/GLASSES NOT CONNECTED|launch-on-glasses-button|\ud83d\udd76\ufe0f/);
  });

  it('documents the 9-step I/O checklist', () => {
    const doc = read('docs/AI_GLASSES_CHECKLIST.md');
    expect(doc).toContain('## 1. Set up the XR');
    expect(doc).toContain('## 9. Ship and iterate');
    expect(doc).toContain('83CF7AhozJ8');
  });
});
