import fs from 'fs';
import path from 'path';

const appTsx = fs.readFileSync(path.join(__dirname, '../../App.tsx'), 'utf8');

describe('App startup safety', () => {
  it('does not hide all LogBox output (black-screen footgun on startup errors)', () => {
    expect(appTsx).not.toMatch(/LogBox\.ignoreAllLogs\s*\(\s*true\s*\)/);
  });

  it('hides splash after bootstrap', () => {
    expect(appTsx).toContain('SplashScreen.hideAsync');
    expect(appTsx).toContain('SplashScreen.preventAutoHideAsync');
  });

  it('loads AI dev-tools only in __DEV__ (release must not depend on Metro devtools)', () => {
    expect(appTsx).toContain('__DEV__ ? <DevToolsBootstrap />');
    expect(appTsx).toMatch(/function DevToolsBootstrap/);
    const appBody = appTsx.split('export default function App')[1] ?? '';
    expect(appBody).not.toContain('useAiSdkDevTools()');
  });
});
