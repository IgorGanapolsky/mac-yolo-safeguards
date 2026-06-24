import { useEffect, useRef, useState, type RefObject } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';
import {
  detectWindowShrunkForKeyboard,
  keyboardOverlapHeight,
} from '../utils/composerKeyboard';

export type KeyboardInsetState = {
  /** Reported keyboard overlap in px (0 when hidden). */
  inset: number;
  /** True when adjustResize visibly reduced window height. */
  windowShrunk: boolean;
};

function resolveKeyboardInset(event?: KeyboardEvent): number {
  const windowHeight = Dimensions.get('window').height;
  const fromEvent = keyboardOverlapHeight(event?.endCoordinates, windowHeight);
  if (fromEvent > 0) {
    return fromEvent;
  }
  return Keyboard.metrics()?.height ?? 0;
}

/**
 * Bottom inset when the software keyboard is visible.
 * Tracks whether Android adjustResize actually shrank the window (dev clients often
 * ship resize while the tab bar prevents it from working — then we lift manually).
 */
export function useKeyboardInset(options?: {
  /** Ignore keyboardDidHide while true — prevents compose flicker on Android. */
  suppressHideWhileFocusedRef?: RefObject<boolean>;
  focused?: boolean;
}): KeyboardInsetState {
  const [inset, setInset] = useState(0);
  const [windowShrunk, setWindowShrunk] = useState(false);
  const baselineWindowHeight = useRef(Dimensions.get('window').height);

  useEffect(() => {
    if (options?.focused === false) {
      setInset(0);
      setWindowShrunk(false);
    }
  }, [options?.focused]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !options?.focused || inset <= 0) {
      return;
    }

    const timer = setInterval(() => {
      if ((Keyboard.metrics()?.height ?? 0) > 0) {
        return;
      }
      setInset(0);
      setWindowShrunk(false);
      baselineWindowHeight.current = Dimensions.get('window').height;
    }, 250);

    return () => clearInterval(timer);
  }, [inset, options?.focused]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const applyInset = (event?: KeyboardEvent) => {
      const kbHeight = resolveKeyboardInset(event);
      const currentWindowHeight = Dimensions.get('window').height;
      setInset(kbHeight);
      setWindowShrunk(
        detectWindowShrunkForKeyboard(kbHeight, baselineWindowHeight.current, currentWindowHeight),
      );
    };

    const onShow = (event: KeyboardEvent) => {
      applyInset(event);
      if (Platform.OS === 'android') {
        // Pan/edge-to-edge layouts often settle one frame late — re-read metrics.
        requestAnimationFrame(() => {
          const settled = resolveKeyboardInset(event);
          if (settled > 0) {
            const currentWindowHeight = Dimensions.get('window').height;
            setInset(settled);
            setWindowShrunk(
              detectWindowShrunkForKeyboard(
                settled,
                baselineWindowHeight.current,
                currentWindowHeight,
              ),
            );
          }
        });
      }
    };
    const onHide = () => {
      setInset(0);
      setWindowShrunk(false);
      baselineWindowHeight.current = Dimensions.get('window').height;
    };
    const onFrame = (event: KeyboardEvent) => {
      const kbHeight = resolveKeyboardInset(event);
      if (kbHeight > 0) {
        const currentWindowHeight = Dimensions.get('window').height;
        setInset(kbHeight);
        setWindowShrunk(
          detectWindowShrunkForKeyboard(
            kbHeight,
            baselineWindowHeight.current,
            currentWindowHeight,
          ),
        );
      }
    };

    const dimensionSub = Dimensions.addEventListener('change', ({ window }) => {
      if ((Keyboard.metrics()?.height ?? 0) <= 0) {
        baselineWindowHeight.current = window.height;
      }
    });

    const subs = [Keyboard.addListener(showEvent, onShow), Keyboard.addListener(hideEvent, onHide)];
    if (Platform.OS === 'android') {
      subs.push(Keyboard.addListener('keyboardDidChangeFrame', onFrame));
    }

    return () => {
      dimensionSub.remove();
      for (const sub of subs) {
        sub.remove();
      }
    };
  }, [options?.suppressHideWhileFocusedRef]);

  return { inset, windowShrunk };
}
