import { Platform } from 'react-native';
import {
  initHermesNotifications,
  approvalNotificationSubtitle,
} from '../services/hermesNotifications';
import type { PendingApproval } from '../types/gateway';

// Mock expo-notifications
const mockSetNotificationChannelAsync = jest.fn();
const mockSetNotificationCategoryAsync = jest.fn();
const mockSetNotificationHandler = jest.fn();

jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4, DEFAULT: 3, LOW: 2 },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0, SECRET: -1 },
  setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannelAsync(...args),
  setNotificationCategoryAsync: (...args: unknown[]) => mockSetNotificationCategoryAsync(...args),
  setNotificationHandler: (...args: unknown[]) => mockSetNotificationHandler(...args),
}));

describe('approvalNotificationsSecurity (Issue #141)', () => {
  const originalOs = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'android';
  });

  afterEach(() => {
    Platform.OS = originalOs;
  });

  it('configures CHANNEL_APPROVALS with PRIVATE lock-screen visibility and no DND bypass', async () => {
    await initHermesNotifications();

    const approvalsCall = mockSetNotificationChannelAsync.mock.calls.find(
      (call: [string, Record<string, unknown>]) => call[0] === 'hermes-approvals',
    );

    expect(approvalsCall).toBeDefined();
    const config = approvalsCall[1];
    expect(config.lockscreenVisibility).toEqual(0); // AndroidNotificationVisibility.PRIVATE
    expect(config.bypassDnd).toEqual(false); // Does not bypass DND
    expect(config.importance).toEqual(4); // HIGH importance
  });

  it('formats approval subtitle securely without exposing raw secrets', () => {
    const pendingHigh: PendingApproval = {
      actionId: 'app-1',
      toolName: 'mcp_execute_command',
      reason: 'Command execution requested',
      receivedAt: new Date().toISOString(),
      command: 'git status',
      riskTier: 'high',
    };
    expect(approvalNotificationSubtitle(pendingHigh)).toEqual('High risk · Shell command');

    const pendingTool: PendingApproval = {
      actionId: 'app-2',
      toolName: 'mcp_read_file',
      reason: 'File read requested',
      receivedAt: new Date().toISOString(),
      riskTier: 'medium',
    };
    expect(approvalNotificationSubtitle(pendingTool)).toEqual('Medium risk · mcp_read_file');
  });
});
