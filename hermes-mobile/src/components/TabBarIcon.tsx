import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

type TabBarIconProps = {
  routeName: 'Chat' | 'Leash' | 'Settings';
  focused: boolean;
  color: string;
  size?: number;
};

const STROKE = 2;

/** Vector-style tab icons without icon-font loading (release-safe). */
export default function TabBarIcon({
  routeName,
  focused,
  color,
  size = 22,
}: TabBarIconProps) {
  if (routeName === 'Chat') {
    return <HermesMarkIcon color={color} focused={focused} size={size} />;
  }
  if (routeName === 'Leash') {
    return <LeashLinkIcon color={color} focused={focused} size={size} />;
  }
  return <GatewayGearIcon color={color} focused={focused} size={size} />;
}

/** Mini Hermes H — matches launcher mark at tab scale. */
function HermesMarkIcon({
  color,
  focused,
  size,
}: {
  color: string;
  focused: boolean;
  size: number;
}) {
  const barW = Math.max(3, Math.round(size * 0.16));
  const barH = Math.round(size * 0.62);
  const gap = Math.round(size * 0.22);
  const crossH = Math.max(3, Math.round(size * 0.14));
  const crossW = barW * 2 + gap;
  const accent = focused ? colors.accent : color;

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View style={{ width: crossW, height: barH, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={[
            styles.crossBar,
            {
              width: crossW,
              height: crossH,
              borderRadius: crossH / 2,
              backgroundColor: accent,
              opacity: focused ? 1 : 0.85,
            },
          ]}
        />
        <View style={[styles.row, { width: crossW, height: barH, position: 'absolute' }]}>
          <View
            style={{
              width: barW,
              height: barH,
              borderRadius: barW / 2,
              backgroundColor: color,
            }}
          />
          <View style={{ width: gap, height: barH }} />
          <View
            style={{
              width: barW,
              height: barH,
              borderRadius: barW / 2,
              backgroundColor: color,
            }}
          />
        </View>
        {focused ? (
          <View
            style={{
              position: 'absolute',
              width: Math.max(4, size * 0.16),
              height: Math.max(4, size * 0.16),
              borderRadius: 999,
              backgroundColor: '#FFFFFF',
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Interlocking links + approval check — Leash tab. */
function LeashLinkIcon({
  color,
  focused,
  size,
}: {
  color: string;
  focused: boolean;
  size: number;
}) {
  const ring = Math.round(size * 0.34);
  const stroke = STROKE;
  const offset = Math.round(size * 0.14);

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View style={{ width: ring + offset, height: ring, justifyContent: 'center' }}>
        <View
          style={[
            styles.linkRing,
            {
              width: ring,
              height: ring,
              borderColor: color,
              borderWidth: stroke,
              left: 0,
              backgroundColor: focused ? 'rgba(34, 211, 238, 0.12)' : 'transparent',
            },
          ]}
        />
        <View
          style={[
            styles.linkRing,
            {
              width: ring,
              height: ring,
              borderColor: focused ? colors.accent : color,
              borderWidth: stroke,
              left: offset,
              backgroundColor: focused ? 'rgba(99, 102, 241, 0.16)' : 'transparent',
            },
          ]}
        >
          <View style={[styles.checkStem, { backgroundColor: focused ? colors.accent : color }]} />
          <View
            style={[
              styles.checkTick,
              { borderColor: focused ? colors.accent : color, borderBottomWidth: stroke, borderRightWidth: stroke },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

/** Gateway gear — Settings tab; 6 teeth, consistent stroke. */
function GatewayGearIcon({
  color,
  focused,
  size,
}: {
  color: string;
  focused: boolean;
  size: number;
}) {
  const outer = size * 0.72;
  const hub = size * 0.2;
  const toothW = Math.max(2, size * 0.12);
  const toothH = Math.max(3, size * 0.18);

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <View
          key={deg}
          style={[
            styles.gearTooth,
            {
              width: toothW,
              height: toothH,
              borderRadius: toothW / 2,
              backgroundColor: color,
              opacity: focused ? 1 : 0.9,
              transform: [{ rotate: `${deg}deg` }, { translateY: -(outer * 0.46) }],
            },
          ]}
        />
      ))}
      <View
        style={[
          styles.gearRing,
          {
            width: outer,
            height: outer,
            borderColor: color,
            borderWidth: STROKE,
            backgroundColor: focused ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
          },
        ]}
      >
        <View
          style={{
            width: hub,
            height: hub,
            borderRadius: 999,
            backgroundColor: focused ? colors.accent : color,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crossBar: {
    position: 'absolute',
  },
  linkRing: {
    position: 'absolute',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkStem: {
    position: 'absolute',
    width: 2,
    height: 5,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }, { translateX: -1.5 }, { translateY: 1 }],
  },
  checkTick: {
    position: 'absolute',
    width: 4,
    height: 2,
    transform: [{ rotate: '45deg' }, { translateX: 1.5 }, { translateY: 0 }],
  },
  gearRing: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearTooth: {
    position: 'absolute',
  },
});
