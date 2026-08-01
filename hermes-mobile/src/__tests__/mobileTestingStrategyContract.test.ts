/**
 * August 2026 mobile testing strategy contract.
 * Prevents drift from docs/MOBILE-TESTING-AUGUST-2026.md decisions:
 * - continuous e2e=skipped is not a ship/OTA pass
 * - agent-device is exploratory, not e2e=pass alone
 * - OTA gate requires real pass proofs
 * - Maestro remains the deterministic ship runner
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../..');
const REPO = path.join(ROOT, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

describe('mobile testing strategy (August 2026)', () => {
  it('documents the strategy and research report', () => {
    expect(exists('docs/MOBILE-TESTING-AUGUST-2026.md')).toBe(true);
    expect(exists('docs/TESTING.md')).toBe(true);
    const strategy = read('docs/MOBILE-TESTING-AUGUST-2026.md');
    expect(strategy).toMatch(/e2e=skipped/i);
    expect(strategy).toMatch(/agent-device/i);
    expect(strategy).toMatch(/Maestro/i);
    expect(strategy).toMatch(/OTA/i);
    expect(strategy).toMatch(/HERMES_E2E_TIER/);
  });

  it('OTA gate refuses skipped continuous proof', () => {
    const gate = read('scripts/require-fresh-user-ota-gate.sh');
    expect(gate).toMatch(/e2e=skipped is NOT pass|skipped is NOT pass/i);
    expect(gate).toMatch(/fresh-user|stranger cold-start/i);
    // Unsafe force path must hard-fail (exit 2), never green-light OTA.
    expect(gate).toMatch(/HERMES_OTA_FORCE_UNSAFE/);
    expect(gate).toMatch(/exit 2/);
  });

  it('continuous E2E defines core/connection/full tiers', () => {
    const cont = read('scripts/run-continuous-e2e.sh');
    expect(cont).toMatch(/HERMES_E2E_TIER/);
    expect(cont).toMatch(/E2E_FLOWS_CORE/);
    expect(cont).toMatch(/ship-guard\.yaml/);
    expect(cont).toMatch(/chat-send-persistence\.yaml/);
    expect(cont).toMatch(/connection|stranger-cold-start/);
  });

  it('package.json exposes continuous tier scripts', () => {
    const pkg = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['e2e:continuous:once']).toMatch(/run-continuous-e2e/);
    expect(pkg.scripts['e2e:continuous:once:connection']).toMatch(/HERMES_E2E_TIER=connection/);
    expect(pkg.scripts['e2e:continuous:once:full']).toMatch(/HERMES_E2E_TIER=full/);
    expect(pkg.scripts['ota:gate']).toMatch(/require-fresh-user-ota-gate/);
  });

  it('TESTING.md forbids agent-device alone as e2e=pass', () => {
    const testing = read('docs/TESTING.md');
    expect(testing).toMatch(/agent-device/);
    expect(testing.toLowerCase()).toMatch(/not.*(ship gate|e2e=pass|release oracle)/);
  });

  it('connectivity and empty-stream contracts exist (protocol-first)', () => {
    expect(exists('src/__tests__/chatErrors.test.ts')).toBe(true);
    expect(exists('src/__tests__/emptyStreamReplyRecovery.test.ts')).toBe(true);
    expect(exists('src/__tests__/failedSendRetry.test.ts')).toBe(true);
    const chatErrors = read('src/__tests__/chatErrors.test.ts');
    expect(chatErrors).toMatch(/isConnectivityMessage/);
  });

  it('prevent-recurrence still owns composer probe discipline', () => {
    const prevent = read('src/__tests__/preventRecurrenceContract.test.ts');
    expect(prevent).toMatch(/make money today/);
  });

  it('research report is checked in for agents', () => {
    const research =
      exists('docs/RESEARCH-MOBILE-TESTING-AUGUST-2026.md') ||
      fs.existsSync(path.join(REPO, 'parallel-research/mobile-testing-aug-2026.md'));
    expect(research).toBe(true);
  });
});
