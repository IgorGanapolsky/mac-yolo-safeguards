import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  Text,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextLayoutEventData,
  type TextStyle,
} from 'react-native';

/** Max lines when expanded — enough for long prompts without taking the whole screen. */
export const EXPANDED_THREAD_TITLE_MAX_LINES = 6;

/** Rough chars per line before RN ellipsis kicks in (header ~17px). */
export function likelyTruncatedTitle(title: string, collapsedLines: number): boolean {
  const charsPerLine = 28;
  return title.trim().length > charsPerLine * collapsedLines;
}

export type ExpandableThreadTitleProps = {
  title: string;
  collapsedLines?: number;
  style?: StyleProp<TextStyle>;
  activeStyle?: StyleProp<TextStyle>;
  testID?: string;
  textTestID?: string;
  expandable?: boolean;
};

export default function ExpandableThreadTitle({
  title,
  collapsedLines = 1,
  style,
  activeStyle,
  testID = 'expandable-thread-title',
  textTestID,
  expandable = true,
}: ExpandableThreadTitleProps) {
  const [expanded, setExpanded] = useState(false);
  const [layoutTruncated, setLayoutTruncated] = useState(false);

  useEffect(() => {
    setExpanded(false);
    setLayoutTruncated(false);
  }, [title]);

  const handleTextLayout = useCallback(
    (event: NativeSyntheticEvent<TextLayoutEventData>) => {
      if (!expanded) {
        setLayoutTruncated(event.nativeEvent.lines.length > collapsedLines);
      }
    },
    [collapsedLines, expanded],
  );

  const canExpand =
    expandable &&
    (layoutTruncated || likelyTruncatedTitle(title, collapsedLines) || expanded);
  const showExpanded = expanded && canExpand;

  const titleText = (
    <Text
      style={[style, activeStyle]}
      numberOfLines={showExpanded ? EXPANDED_THREAD_TITLE_MAX_LINES : collapsedLines}
      ellipsizeMode="tail"
      onTextLayout={handleTextLayout}
      testID={textTestID ?? `${testID}-text`}
      accessibilityLabel={title}
    >
      {title}
    </Text>
  );

  if (!canExpand) {
    return titleText;
  }

  return (
    <Pressable
      onPress={() => setExpanded((value) => !value)}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={expanded ? 'Collapse thread title' : 'Expand thread title'}
      accessibilityState={{ expanded }}
      testID={testID}
      hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
      style={styles.pressable}
    >
      {titleText}
    </Pressable>
  );
}

const styles = {
  pressable: {
    flexShrink: 1,
    minWidth: 0,
    flex: 1,
  },
} as const;
