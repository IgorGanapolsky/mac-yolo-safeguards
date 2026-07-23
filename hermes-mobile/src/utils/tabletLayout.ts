import { Platform, StyleSheet, useWindowDimensions } from 'react-native';

export const TABLET_BREAKPOINT = 700;
export const TABLET_CONTENT_MAX_WIDTH = 500;

export function useTabletContainerStyle() {
  const { width } = useWindowDimensions();
  if (Platform.OS === 'ios' && Platform.isPad && width >= TABLET_BREAKPOINT) {
    return StyleSheet.flatten([
      styles.tabletConstrained,
      { width: TABLET_CONTENT_MAX_WIDTH, marginLeft: (width - TABLET_CONTENT_MAX_WIDTH) / 2 },
    ]);
  }
  return styles.flexFill;
}

export function useIsTablet() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'ios' && Platform.isPad && width >= TABLET_BREAKPOINT;
}

const styles = StyleSheet.create({
  flexFill: {
    flex: 1,
  },
  tabletConstrained: {
    flex: 1,
  },
});
