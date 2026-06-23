import { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';

export type KeyboardInsetState = {
  /** Reported keyboard height in px (0 when hidden). */
  inset: number;
  /** True when adjustResize visibly reduced window height. */
  windowShrunk: boolean;
};

function keyboardHeightFromEvent(event?: KeyboardEvent): number {
  const fromEvent = event?.endCoordinates.height ?? 0;
  if (fromEvent > 0) {
    return fromEvent;
  }
  return Keyboard.metrics()?.height ?? 0;
}

function measureWindowShrunk(baselineHeight: number, keyboardHeight: number): boolean {
  const currentWindowHeight = Dimensions.get('window').height;
  const shrink = baselineHeight - currentWindowHeight;
  return shrink > Math.max(48, keyboardHeight * 0.2);
}

/**
 * Bottom inset when the software keyboard is visible.
 * Tracks whether Android adjustResize actually shrank the window (dev clients often
 * ship resize while the tab bar prevents it from working — then we lift manually).
 */
export function useKeyboardInset(): KeyboardInsetState {
  const [inset, setInset] = useState(0);
  const [windowShrunk, setWindowShrunk] = useState(false);
  const baselineWindowHeight = useRef(Dimensions.get('window').height);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      const kbHeight = keyboardHeightFromEvent(event);
      setInset(kbHeight);
      setWindowShrunk(measureWindowShrunk(baselineWindowHeight.current, kbHeight));
    };
    const onHide = () => {
      setInset(0);
      setWindowShrunk(false);
      baselineWindowHeight.current = Dimensions.get('window').height;
    };
    const onFrame = (event: KeyboardEvent) => {
      const kbHeight = keyboardHeightFromEvent(event);
      if (kbHeight > 0) {
        setInset(kbHeight);
        setWindowShrunk(measureWindowShrunk(baselineWindowHeight.current, kbHeight));
      }
    };

    const subs = [Keyboard.addListener(showEvent, onShow), Keyboard.addListener(hideEvent, onHide)];
    if (Platform.OS === 'android') {
      subs.push(Keyboard.addListener('keyboardDidChangeFrame', onFrame));
    }

    return () => {
      for (const sub of subs) {
        sub.remove();
      }
    };
  }, []);

  return { inset, windowShrunk };
}
