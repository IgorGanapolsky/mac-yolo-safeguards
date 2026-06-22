import { NativeModules, Platform } from 'react-native';

type HermesGlassesNative = {
  isProjectedDeviceConnected: () => Promise<boolean>;
  launchOnGlasses: () => Promise<boolean>;
};

const Native: HermesGlassesNative | undefined =
  Platform.OS === 'android' ? NativeModules.HermesGlasses : undefined;

export async function isGlassesConnected(): Promise<boolean> {
  if (!Native?.isProjectedDeviceConnected) return false;
  try {
    return await Native.isProjectedDeviceConnected();
  } catch {
    return false;
  }
}

export async function launchHermesOnGlasses(): Promise<boolean> {
  if (!Native?.launchOnGlasses) {
    throw new Error('AI glasses projection is only available on Android');
  }
  return Native.launchOnGlasses();
}
