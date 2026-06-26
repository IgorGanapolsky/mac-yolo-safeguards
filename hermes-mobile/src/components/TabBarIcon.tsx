import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

type TabBarIconProps = {
  routeName: 'Chat' | 'Leash' | 'Settings';
  focused: boolean;
  color: string;
  size?: number;
};

/** Vector-style tab icons without icon-font loading (release-safe). */
export default function TabBarIcon({
  routeName,
  focused,
  color,
  size = 22,
}: TabBarIconProps) {
  if (routeName === 'Chat') {
    return <HermesRemoteIcon color={color} focused={focused} size={size} />;
  }
  if (routeName === 'Leash') {
    return <LeashShieldIcon color={color} focused={focused} size={size} />;
  }
  return <SettingsGearIcon color={color} size={size} />;
}

function HermesRemoteIcon({
  color,
  focused,
  size,
}: {
  color: string;
  focused: boolean;
  size: number;
}) {
  const screenW = size * 0.82;
  const screenH = size * 0.52;
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={[
          styles.monitor,
          {
            width: screenW,
            height: screenH,
            borderColor: color,
            backgroundColor: focused ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
          },
        ]}
      >
        <View style={[styles.monitorBar, { backgroundColor: color, opacity: 0.55 }]} />
        <View style={[styles.chip, { borderColor: color, backgroundColor: focused ? colors.accent : 'transparent' }]} />
      </View>
      <View style={[styles.stand, { backgroundColor: color }]} />
      <View style={[styles.standFoot, { backgroundColor: color }]} />
    </View>
  );
}

function LeashShieldIcon({
  color,
  focused,
  size,
}: {
  color: string;
  focused: boolean;
  size: number;
}) {
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={[
          styles.shield,
          {
            borderColor: color,
            backgroundColor: focused ? 'rgba(34, 211, 238, 0.14)' : 'transparent',
          },
        ]}
      >
        <View style={[styles.shieldCheckStem, { backgroundColor: color }]} />
        <View style={[styles.shieldCheckTick, { borderColor: color }]} />
      </View>
    </View>
  );
}

function SettingsGearIcon({ color, size }: { color: string; size: number }) {
  const hub = size * 0.22;
  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View style={[styles.gearRing, { width: size * 0.72, height: size * 0.72, borderColor: color }]}>
        <View style={[styles.gearHub, { width: hub, height: hub, backgroundColor: color }]} />
      </View>
      {[0, 45, 90, 135].map((deg) => (
        <View
          key={deg}
          style={[
            styles.gearTooth,
            {
              backgroundColor: color,
              transform: [{ rotate: `${deg}deg` }, { translateY: -(size * 0.34) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  monitor: {
    borderWidth: 2,
    borderRadius: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monitorBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  chip: {
    width: 7,
    height: 7,
    borderRadius: 2,
    borderWidth: 1.5,
  },
  stand: {
    width: 2,
    height: 4,
    marginTop: 1,
  },
  standFoot: {
    width: 10,
    height: 2,
    borderRadius: 1,
    marginTop: 0,
  },
  shield: {
    width: 16,
    height: 18,
    borderWidth: 2,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldCheckStem: {
    position: 'absolute',
    width: 2,
    height: 5,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }, { translateX: -1 }, { translateY: 1 }],
  },
  shieldCheckTick: {
    position: 'absolute',
    width: 4,
    height: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    transform: [{ rotate: '45deg' }, { translateX: 2 }, { translateY: 0 }],
  },
  gearRing: {
    borderWidth: 2,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearHub: {
    borderRadius: 999,
  },
  gearTooth: {
    position: 'absolute',
    width: 3,
    height: 5,
    borderRadius: 1,
  },
});
