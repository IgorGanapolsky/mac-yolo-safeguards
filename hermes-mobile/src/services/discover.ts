import { NativeModules } from 'react-native';

/**
 * Parses the React Native packager script URL to extract the host IP address.
 * This identifies the development Mac's IP dynamically on physical devices.
 */
export function getPackagerHostIp(): string | null {
  try {
    const scriptURL = NativeModules.SourceCode?.scriptURL;
    if (scriptURL && typeof scriptURL === 'string') {
      const match = scriptURL.match(/^https?:\/\/([^:/]+)/);
      if (match && match[1]) {
        const host = match[1];
        if (host !== 'localhost' && host !== '127.0.0.1') {
          return host;
        }
      }
    }
  } catch (_) {
    // Graceful fallback
  }
  return null;
}
