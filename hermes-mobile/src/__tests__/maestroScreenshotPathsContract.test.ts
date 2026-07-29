/**
 * Device E2E (2026-07-29): Maestro takeScreenshot with relative
 * `../docs/proofs/...` paths throws FileNotFoundException because Maestro
 * resolves screenshots under `~/.maestro/tests/<run>/takeScreenshot/`, not the
 * repo root. iPad flows already use `build/...` — Android proof flows must match.
 *
 * Also: tailscale-profile-disconnected-copy asserts connect-mac-gate, which is
 * suppressed when saved profiles exist. It must clearState like stranger-cold-start.
 *
 * wrong-key-repair must use chat-context-mac-button: Android flattens nested Text
 * testIDs inside the compact connection line so chat-context-link is invisible to Maestro.
 */
import * as fs from 'fs';
import * as path from 'path';

const maestroDir = path.join(__dirname, '../../.maestro');

function listYamlFlows(): string[] {
  return fs
    .readdirSync(maestroDir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => path.join(maestroDir, f));
}

describe('maestroScreenshotPathsContract', () => {
  it('never uses relative ../docs/proofs takeScreenshot paths', () => {
    const offenders: string[] = [];
    for (const file of listYamlFlows()) {
      const body = fs.readFileSync(file, 'utf8');
      const lines = body.split('\n');
      lines.forEach((line, i) => {
        if (/takeScreenshot:\s*\.\.\/docs\/proofs\//.test(line)) {
          offenders.push(`${path.basename(file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('uses repo-local build/ (or absolute-safe) paths for takeScreenshot', () => {
    const bad: string[] = [];
    for (const file of listYamlFlows()) {
      const body = fs.readFileSync(file, 'utf8');
      for (const line of body.split('\n')) {
        const m = line.match(/takeScreenshot:\s*(.+)\s*$/);
        if (!m) continue;
        const target = m[1].trim();
        if (target.includes('..')) {
          bad.push(`${path.basename(file)}: ${target}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('tailscale-profile-disconnected-copy clears state and asserts gate hero (not numbered steps)', () => {
    const flow = fs.readFileSync(
      path.join(maestroDir, 'tailscale-profile-disconnected-copy.yaml'),
      'utf8',
    );
    expect(flow).toMatch(/clearState:\s*true/);
    expect(flow).toMatch(/connect-mac-gate/);
    expect(flow).toMatch(/connect-manual-form/);
    // ConnectMacGate no longer mounts FreshUserOnboardingCard steps as assertions.
    expect(flow).not.toMatch(/id:\s*"fresh-user-step-/);
    expect(flow).not.toMatch(/takeScreenshot:\s*\.\.\/docs\/proofs\//);
  });

  it('wrong-key-repair uses chat-context-mac-button (Android nested Text testIDs flatten)', () => {
    const flow = fs.readFileSync(
      path.join(maestroDir, 'wrong-key-repair.yaml'),
      'utf8',
    );
    expect(flow).toMatch(/chat-context-mac-button/);
    expect(flow).not.toMatch(/id:\s*"chat-context-link"/);
  });
});
