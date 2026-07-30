import fs from 'fs';
import path from 'path';
import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import NotificationPermissionBanner from '../components/NotificationPermissionBanner';
import {
  getHermesNotificationPermissionSnapshot,
  requestHermesNotificationPermissionSnapshot,
} from '../services/hermesNotifications';
import {
  clearNotificationBannerDismissal,
  loadNotificationBannerDismissal,
  saveNotificationBannerDismissal,
} from '../services/notificationPermissionPrefs';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React2 = require('react');
    React2.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../services/hermesNotifications', () => ({
  getHermesNotificationPermissionSnapshot: jest.fn(),
  requestHermesNotificationPermissionSnapshot: jest.fn(),
}));

jest.mock('../services/notificationPermissionPrefs', () => ({
  loadNotificationBannerDismissal: jest.fn(),
  saveNotificationBannerDismissal: jest.fn(),
  clearNotificationBannerDismissal: jest.fn(),
}));

const mockGet = getHermesNotificationPermissionSnapshot as jest.Mock;
const mockRequest = requestHermesNotificationPermissionSnapshot as jest.Mock;
const mockLoadDismissal = loadNotificationBannerDismissal as jest.Mock;
const mockSaveDismissal = saveNotificationBannerDismissal as jest.Mock;
const mockClearDismissal = clearNotificationBannerDismissal as jest.Mock;

describe('NotificationPermissionBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadDismissal.mockResolvedValue(null);
    mockSaveDismissal.mockResolvedValue(undefined);
    mockClearDismissal.mockResolvedValue(undefined);
    jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  });

  it('renders nothing when notifications are granted', async () => {
    mockGet.mockResolvedValue({ granted: true, canAskAgain: true });
    const screen = render(<NotificationPermissionBanner />);
    await act(async () => {});
    expect(screen.queryByTestId('leash-notification-permission-banner')).toBeNull();
  });

  // This is the whole defect: denied permission produced no UI on the approvals surface.
  it('surfaces the degraded-capability warning when permission is denied', async () => {
    mockGet.mockResolvedValue({ granted: false, canAskAgain: true });
    const screen = render(<NotificationPermissionBanner />);
    await waitFor(() => {
      expect(screen.getByTestId('leash-notification-permission-banner')).toBeTruthy();
    });
    expect(screen.getByTestId('leash-notification-permission-cta')).toHaveTextContent(
      'Turn on alerts',
    );
  });

  it('sends the user to system settings when the OS will not prompt again', async () => {
    mockGet.mockResolvedValue({ granted: false, canAskAgain: false });
    const screen = render(<NotificationPermissionBanner />);
    await waitFor(() => {
      expect(screen.getByTestId('leash-notification-permission-cta')).toHaveTextContent(
        'Open system settings',
      );
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('leash-notification-permission-cta'));
    });
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('requests permission and clears the banner once granted', async () => {
    mockGet.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequest.mockResolvedValue({ granted: true, canAskAgain: false });
    const screen = render(<NotificationPermissionBanner />);
    await waitFor(() => {
      expect(screen.getByTestId('leash-notification-permission-banner')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('leash-notification-permission-cta'));
    });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(Linking.openSettings).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByTestId('leash-notification-permission-banner')).toBeNull();
    });
    expect(mockClearDismissal).toHaveBeenCalled();
  });

  // Denying the OS prompt for the last time must not dead-end on a button that does nothing.
  it('escalates to system settings when the prompt is denied permanently', async () => {
    mockGet.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequest.mockResolvedValue({ granted: false, canAskAgain: false });
    const screen = render(<NotificationPermissionBanner />);
    await waitFor(() => {
      expect(screen.getByTestId('leash-notification-permission-banner')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('leash-notification-permission-cta'));
    });
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByTestId('leash-notification-permission-cta')).toHaveTextContent(
        'Open system settings',
      );
    });
  });

  it('persists a dismissal and hides the banner', async () => {
    mockGet.mockResolvedValue({ granted: false, canAskAgain: true });
    const screen = render(<NotificationPermissionBanner />);
    await waitFor(() => {
      expect(screen.getByTestId('leash-notification-permission-banner')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('leash-notification-permission-dismiss'));
    });
    expect(mockSaveDismissal).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'request', atMs: expect.any(Number) }),
    );
    await waitFor(() => {
      expect(screen.queryByTestId('leash-notification-permission-banner')).toBeNull();
    });
  });

  it('stays hidden while a fresh dismissal is stored', async () => {
    mockGet.mockResolvedValue({ granted: false, canAskAgain: true });
    mockLoadDismissal.mockResolvedValue({ variant: 'request', atMs: Date.now() });
    const screen = render(<NotificationPermissionBanner />);
    await act(async () => {});
    expect(screen.queryByTestId('leash-notification-permission-banner')).toBeNull();
  });
});

describe('Leash tab wiring', () => {
  // The banner is worthless unless the approvals surface actually renders it.
  it('ApprovalsScreen renders the notification permission banner', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'ApprovalsScreen.tsx'),
      'utf8',
    );
    expect(source).toContain("import NotificationPermissionBanner from '../components/NotificationPermissionBanner'");
    expect(source).toContain('<NotificationPermissionBanner />');
  });
});
