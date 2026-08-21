import { NativeModules, Platform } from 'react-native';

type GestureCallback = (gesture: string) => void;

type HermesGlassesNative = {
  isProjectedDeviceConnected: () => Promise<boolean>;
  launchOnGlasses: () => Promise<boolean>;
  /**
   * Connect to the Meta Glasses BLE peripheral.
   * Resolves true on connection, false on failure.
   */
  connectGlasses: () => Promise<boolean>;
  /**
   * Disconnect from the currently connected Meta Glasses.
   */
  disconnectGlasses: () => Promise<void>;
  /**
   * Start listening for AR gesture events from the glasses.
   * Calls the provided callback with gesture names:
   *   "wink_left", "wink_right", "double_blink", "eyebrow_raise",
   *   "tap", "double_tap", "swipe_left", "swipe_right"
   */
  startGestureListener: (listenerId: string) => Promise<void>;
  /**
   * Stop listening for gesture events.
   */
  stopGestureListener: (listenerId: string) => Promise<void>;
  /**
   * Start streaming screen frames from the Mac bridge to the glasses.
   * Returns the SSE endpoint URL.
   */
  startScreenStream: (port: number) => Promise<string>;
  /**
   * Stop the active screen stream.
   */
  stopScreenStream: () => Promise<void>;
  /**
   * Send a macro command (shell or AppleScript) to be executed on the Mac.
   * Resolves with { ok: boolean, output?: string, error?: string }.
   */
  sendMacro: (command: string) => Promise<{ ok: boolean; output?: string; error?: string }>;
};

const Native: HermesGlassesNative | undefined =
  Platform.OS === 'android' ? NativeModules.HermesGlasses : undefined;

// Active gesture listeners registered from JS
const gestureListeners: Record<string, GestureCallback> = {};

/**
 * Check if the Meta Glasses projected device is connected.
 * Returns true on Android when the glasses are paired and projecting.
 */
export async function isGlassesConnected(): Promise<boolean> {
  if (!Native?.isProjectedDeviceConnected) return false;
  try {
    return await Native.isProjectedDeviceConnected();
  } catch {
    return false;
  }
}

/**
 * Launch the Hermes app on the glasses' projected display.
 */
export async function launchHermesOnGlasses(): Promise<boolean> {
  if (!Native?.launchOnGlasses) {
    throw new Error('AI glasses projection is only available on Android');
  }
  return Native.launchOnGlasses();
}

/**
 * Connect to the Meta Glasses BLE peripheral.
 * Must be called before gestures or screen streaming work.
 */
export async function connectToGlasses(): Promise<boolean> {
  if (!Native?.connectGlasses) {
    throw new Error('Meta Glasses BLE is only available on Android');
  }
  return Native.connectGlasses();
}

/**
 * Disconnect from the Meta Glasses.
 */
export async function disconnectGlasses(): Promise<void> {
  if (!Native?.disconnectGlasses) {
    throw new Error('Meta Glasses BLE is only available on Android');
  }
  return Native.disconnectGlasses();
}

let gestureListenerCounter = 0;

/**
 * Register a callback to receive AR gesture events from the glasses.
 * Returns an unsubscribe function.
 *
 * Gestures: "wink_left", "wink_right", "double_blink",
 *           "eyebrow_raise", "tap", "double_tap",
 *           "swipe_left", "swipe_right"
 */
export function onGlassesGesture(callback: GestureCallback): () => void {
  if (!Native?.startGestureListener) {
    throw new Error('Meta Glasses BLE is only available on Android');
  }
  const listenerId = `gesture_${Date.now()}_${gestureListenerCounter++}`;
  gestureListeners[listenerId] = callback;

  Native.startGestureListener(listenerId).catch((err: unknown) => {
    console.error('[HermesGlasses] Failed to start gesture listener:', err);
  });

  return () => {
    if (gestureListeners[listenerId]) {
      delete gestureListeners[listenerId];
    }
    Native.stopGestureListener(listenerId).catch(() => {});
  };
}

// Called by native module via React Native's DeviceEventEmitter
if (typeof global !== 'undefined') {
  (global as any).__emitGlassesGesture = (listenerId: string, gesture: string) => {
    const cb = gestureListeners[listenerId];
    if (cb) {
      cb(gesture);
    }
  };
}

/**
 * Start streaming Mac screen frames to the glasses AR overlay.
 * The Mac-side bridge (`tools/meta-glasses-hermes-bridge.js serve`) must
 * be running and reachable on the local network.
 *
 * @returns The SSE endpoint URL for the screen stream
 */
export async function startScreenStream(port: number = 8643): Promise<string> {
  if (!Native?.startScreenStream) {
    throw new Error('Screen streaming is only available on Android');
  }
  return Native.startScreenStream(port);
}

/**
 * Stop the active screen stream to the glasses.
 */
export async function stopScreenStream(): Promise<void> {
  if (!Native?.stopScreenStream) {
    throw new Error('Screen streaming is only available on Android');
  }
  return Native.stopScreenStream();
}

/**
 * Send a macro command to be executed on the Mac.
 * The command is routed through the OpenBot Action Gateway for policy
 * interdiction before execution.
 *
 * @param command Shell or AppleScript command to execute
 * @returns Execution result with ok/output/error
 */
export async function sendMacro(command: string): Promise<{ ok: boolean; output?: string; error?: string }> {
  if (!Native?.sendMacro) {
    throw new Error('Macro execution is only available on Android');
  }
  return Native.sendMacro(command);
}
