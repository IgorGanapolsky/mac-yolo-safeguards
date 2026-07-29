import fs from 'fs';
import path from 'path';
import React from 'react';
import { render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DiffPreviewBox from '../components/DiffPreviewBox';
import GateApprovalCard from '../components/GateApprovalCard';
import { prepareDiffForDisplay, redactDiffContent } from '../utils/diffDisplay';
import { storage } from '../services/storage';
import type { PendingApproval } from '../types/gateway';

/**
 * Realistic-looking credentials — the exact shapes a diff on an .env file leaks.
 * All fake, and every one is assembled at runtime: committing these literally
 * trips GitHub push protection / GitGuardian even though nothing here is real.
 */
const OPENAI_KEY = ['sk', 'proj', 'J8xQ2mR7vN4pL0aB6cD1eF3gH5iK9tU2wY7zX4qS8nM6rV0j'].join('-');
const GITHUB_TOKEN = ['ghp', '16C7e42F292c6912E7710c838347Ae178B4a'].join('_');
const AWS_KEY_ID = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
const STRIPE_KEY = ['sk', 'live', '51H8xQ2mR7vN4pL0aB6cD1eF3'].join('_');
const CONTACT_EMAIL = ['igor.ganapolsky', 'example.com'].join('@');

const SECRET_DIFF = [
  '--- a/.env',
  '+++ b/.env',
  '@@ -1,3 +1,6 @@',
  `+OPENAI_API_KEY=${OPENAI_KEY}`,
  `+GITHUB_TOKEN=${GITHUB_TOKEN}`,
  `+AWS_ACCESS_KEY_ID=${AWS_KEY_ID}`,
  `+STRIPE_SECRET=${STRIPE_KEY}`,
  `+OWNER_EMAIL=${CONTACT_EMAIL}`,
  '-# nothing to see here',
].join('\n');

const ALL_SECRETS = [OPENAI_KEY, GITHUB_TOKEN, AWS_KEY_ID, STRIPE_KEY, CONTACT_EMAIL];

const approvalWithDiff: PendingApproval = {
  actionId: 'act_redact_1',
  toolName: 'apply_patch',
  reason: 'Write credentials to .env',
  command: 'apply_patch .env',
  diff: SECRET_DIFF,
  receivedAt: '2026-07-25T12:00:00.000Z',
};

function renderedText(tree: unknown): string {
  return JSON.stringify(tree);
}

describe('redactPii setting — diff previews', () => {
  it('masks every credential shape and keeps diff line structure', () => {
    const redacted = redactDiffContent(SECRET_DIFF);
    for (const secret of ALL_SECRETS) {
      expect(redacted).not.toContain(secret);
    }
    expect(redacted).toContain('[redacted]');
    // Diff framing survives so +/- stats stay meaningful.
    expect(redacted).toContain('--- a/.env');
    expect(redacted).toContain('@@ -1,3 +1,6 @@');
    expect(redacted.split('\n')).toHaveLength(SECRET_DIFF.split('\n').length);
  });

  it('prepareDiffForDisplay returns raw text when the toggle is off', () => {
    expect(prepareDiffForDisplay(SECRET_DIFF, false)).toBe(SECRET_DIFF);
    expect(prepareDiffForDisplay(SECRET_DIFF, true)).not.toContain(OPENAI_KEY);
    // Fails closed when a caller cannot resolve the setting.
    expect(prepareDiffForDisplay(SECRET_DIFF)).not.toContain(OPENAI_KEY);
  });

  it('DiffPreviewBox masks the API key when redactPii is on', () => {
    const { toJSON } = render(<DiffPreviewBox diff={SECRET_DIFF} redactPii />);
    const text = renderedText(toJSON());
    for (const secret of ALL_SECRETS) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('[redacted]');
  });

  it('DiffPreviewBox shows the raw API key when redactPii is off', () => {
    const { toJSON } = render(<DiffPreviewBox diff={SECRET_DIFF} redactPii={false} />);
    const text = renderedText(toJSON());
    expect(text).toContain(OPENAI_KEY);
    expect(text).toContain(GITHUB_TOKEN);
  });

  it('GateApprovalCard honours the toggle end to end', () => {
    const masked = render(
      <GateApprovalCard
        approval={approvalWithDiff}
        onApprove={jest.fn()}
        onReject={jest.fn()}
        redactPii
      />,
    );
    expect(renderedText(masked.toJSON())).not.toContain(OPENAI_KEY);
    masked.unmount();

    const raw = render(
      <GateApprovalCard
        approval={approvalWithDiff}
        onApprove={jest.fn()}
        onReject={jest.fn()}
        redactPii={false}
      />,
    );
    expect(renderedText(raw.toJSON())).toContain(OPENAI_KEY);
  });

  it('GateApprovalCard fails closed when the prop is omitted', () => {
    const { toJSON } = render(
      <GateApprovalCard
        approval={approvalWithDiff}
        onApprove={jest.fn()}
        onReject={jest.fn()}
      />,
    );
    expect(renderedText(toJSON())).not.toContain(OPENAI_KEY);
  });
});

describe('usePortal removal', () => {
  const SRC_DIR = path.resolve(__dirname, '..');
  /** Only the storage migration shim may still name the removed key. */
  const ALLOWED = new Set([path.join(SRC_DIR, 'services', 'storage.ts'), __filename]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, out);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  it('leaves no usePortal reference in src/ outside the migration shim', () => {
    const offenders = walk(SRC_DIR)
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => fs.readFileSync(file, 'utf8').includes('usePortal'))
      .map((file) => path.relative(SRC_DIR, file));
    expect(offenders).toEqual([]);
  });

  it('loads legacy persisted settings that still contain usePortal', async () => {
    await storage.clearAll();
    await AsyncStorage.setItem(
      'hermes-mobile:gateway_settings',
      JSON.stringify({
        connectionMode: 'gateway',
        cloudUrl: 'https://hermesmobile-cloud.fly.dev',
        gatewayUrl: 'http://192.168.1.10:8642',
        usePortal: true,
        redactPii: false,
        notificationsEnabled: true,
        demoMode: false,
        thumbgateCaptureOnDown: true,
      }),
    );

    const loaded = await storage.loadGatewaySettings();

    expect(loaded).not.toHaveProperty('usePortal');
    expect(loaded.connectionMode).toBe('gateway');
    expect(loaded.redactPii).toBe(false);
    expect(loaded.thumbgateCaptureOnDown).toBe(true);
    expect(loaded.approvalPolicy).toBe('balanced');
  });
});
