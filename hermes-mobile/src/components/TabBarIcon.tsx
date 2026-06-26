import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

type TabBarIconProps = {
  routeName: 'Chat' | 'Leash' | 'Settings';
  focused: boolean;
  color: string;
  size?: number;
};

type IconProps = { color: string; focused: boolean; size: number };

/**
 * Vector-style tab icons drawn as plain Views (no icon-font; release-safe).
 * Designed to stay legible at ~22px: bold silhouettes, no fine detail that
 * turns to mud at tab scale. Mark matches the Aurora launcher (H + cyan core).
 */
export default function TabBarIcon({ routeName, focused, color, size = 22 }: TabBarIconProps) {
  if (routeName === 'Chat') {
    return <HermesMarkIcon color={color} focused={focused} size={size} />;
  }
  if (routeName === 'Leash') {
    return <LeashGateIcon color={color} focused={focused} size={size} />;
  }
  return <SettingsSlidersIcon color={color} focused={focused} size={size} />;
}

/** Mini Hermes H + cyan core — mirrors the launcher mark (no center dot). */
function HermesMarkIcon({ color, focused, size }: IconProps) {
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
          <View style={{ width: barW, height: barH, borderRadius: barW / 2, backgroundColor: color }} />
          <View style={{ width: gap, height: barH }} />
          <View style={{ width: barW, height: barH, borderRadius: barW / 2, backgroundColor: color }} />
        </View>
      </View>
    </View>
  );
}

/** Leash = approval gate + check. Bold rounded square + checkmark; reads at tab size. */
function LeashGateIcon({ color, focused, size }: IconProps) {
  const box = Math.round(size * 0.64);
  const radius = Math.round(box * 0.3);
  const border = Math.max(2, Math.round(size * 0.09));
  const tickColor = focused ? colors.accent : color;
  const tickW = Math.max(5, Math.round(size * 0.24));
  const tickH = Math.max(8, Math.round(size * 0.42));
  const tickStroke = Math.max(2, Math.round(size * 0.1));

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View
        style={{
          width: box,
          height: box,
          borderRadius: radius,
          borderWidth: border,
          borderColor: color,
          backgroundColor: focused ? 'rgba(34,211,238,0.10)' : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* CSS-style checkmark: an L (right + bottom borders) rotated 45°. */}
        <View
          style={{
            width: tickW,
            height: tickH,
            borderRightWidth: tickStroke,
            borderBottomWidth: tickStroke,
            borderColor: tickColor,
            transform: [{ rotate: '45deg' }],
            marginTop: -Math.round(size * 0.05),
          }}
        />
      </View>
    </View>
  );
}

/** Settings = sliders (tune). Three faders with knobs; legible, no fuzzy gear teeth. */
function SettingsSlidersIcon({ color, focused, size }: IconProps) {
  const lineW = Math.round(size * 0.64);
  const lineH = Math.max(2, Math.round(size * 0.1));
  const knob = Math.max(4, Math.round(size * 0.2));
  const knobColor = focused ? colors.accent : color;
  const rows = [lineW - knob - 1, Math.round(lineW * 0.32), lineW - knob - 2];

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <View style={{ height: size * 0.7, justifyContent: 'space-between' }}>
        {rows.map((knobLeft, i) => (
          <View key={i} style={{ width: lineW, height: knob, justifyContent: 'center' }}>
            <View
              style={{
                width: lineW,
                height: lineH,
                borderRadius: lineH / 2,
                backgroundColor: color,
                opacity: focused ? 1 : 0.9,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: knobLeft,
                width: knob,
                height: knob,
                borderRadius: knob / 2,
                backgroundColor: knobColor,
              }}
            />
          </View>
        ))}
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
});
