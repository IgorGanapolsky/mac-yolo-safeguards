import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, TextStyle, View, type StyleProp } from 'react-native';
import { colors } from '../theme/colors';
import {
  hasFormattedMarkdown,
  parseFormattedBlocks,
  type FormattedBlock,
  type InlineSpan,
} from '../utils/chatFormattedBlocks';

type ChatFormattedTextProps = {
  text: string;
  style?: StyleProp<TextStyle>;
  variant?: 'assistant' | 'user' | 'detail';
  selectable?: boolean;
  testID?: string;
};

function renderInlineSpans(
  spans: InlineSpan[],
  baseStyle: TextStyle,
  keyPrefix: string,
  selectable: boolean,
): React.ReactNode {
  return spans.map((span, index) => (
    <Text
      key={`${keyPrefix}-${index}`}
      selectable={selectable}
      style={[
        baseStyle,
        span.bold && styles.bold,
        span.italic && styles.italic,
        span.code && styles.inlineCode,
      ]}
    >
      {span.text}
    </Text>
  ));
}

function renderBlock(
  block: FormattedBlock,
  index: number,
  baseStyle: TextStyle,
  variant: ChatFormattedTextProps['variant'],
  selectable: boolean,
): React.ReactNode {
  switch (block.kind) {
    case 'spacer':
      return <View key={`spacer-${index}`} style={styles.spacer} />;
    case 'heading': {
      const headingStyle =
        block.level === 1
          ? styles.heading1
          : block.level === 2
            ? styles.heading2
            : styles.heading3;
      return (
        <Text
          key={`heading-${index}`}
          selectable={selectable}
          style={[baseStyle, headingStyle, variant === 'detail' && styles.detailHeading]}
        >
          {renderInlineSpans(block.spans, baseStyle, `h-${index}`, selectable)}
        </Text>
      );
    }
    case 'bullet':
      return (
        <View key={`bullet-${index}`} style={styles.listRow}>
          <Text selectable={selectable} style={[baseStyle, styles.bulletMarker]}>
            {'\u2022'}
          </Text>
          <Text selectable={selectable} style={[baseStyle, styles.listText]}>
            {renderInlineSpans(block.spans, baseStyle, `b-${index}`, selectable)}
          </Text>
        </View>
      );
    case 'ordered':
      return (
        <View key={`ordered-${index}`} style={styles.listRow}>
          <Text selectable={selectable} style={[baseStyle, styles.bulletMarker]}>
            {`${block.index}.`}
          </Text>
          <Text selectable={selectable} style={[baseStyle, styles.listText]}>
            {renderInlineSpans(block.spans, baseStyle, `o-${index}`, selectable)}
          </Text>
        </View>
      );
    case 'code':
      return (
        <View key={`code-${index}`} style={styles.codeBlock}>
          <Text selectable={selectable} style={[baseStyle, styles.codeBlockText]}>
            {block.text}
          </Text>
        </View>
      );
    case 'paragraph':
    default:
      return (
        <Text key={`p-${index}`} selectable={selectable} style={[baseStyle, styles.paragraph]}>
          {renderInlineSpans(block.spans, baseStyle, `p-${index}`, selectable)}
        </Text>
      );
  }
}

export default function ChatFormattedText({
  text,
  style,
  variant = 'assistant',
  selectable = true,
  testID = 'chat-message-body',
}: ChatFormattedTextProps) {
  const baseStyle = useMemo(
    () => StyleSheet.flatten([styles.body, variant === 'user' ? styles.userText : styles.assistantText, style]),
    [style, variant],
  );

  const blocks = useMemo(() => parseFormattedBlocks(text), [text]);
  const useFormatted = variant !== 'user' && hasFormattedMarkdown(text) && blocks.length > 0;

  if (!useFormatted) {
    return (
      <Text style={baseStyle} selectable={selectable} testID={testID}>
        {text}
      </Text>
    );
  }

  return (
    <View testID={testID} accessibilityLabel={text.slice(0, 120)}>
      {blocks.map((block, index) => renderBlock(block, index, baseStyle, variant, selectable))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  assistantText: {
    color: colors.text,
  },
  userText: {
    color: colors.userBubbleText,
  },
  paragraph: {
    marginBottom: 2,
  },
  spacer: {
    height: 8,
  },
  heading1: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 6,
    color: colors.text,
  },
  heading2: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 4,
    color: colors.text,
  },
  heading3: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 2,
    color: colors.textSecondary,
  },
  detailHeading: {
    marginTop: 10,
  },
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
  inlineCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    backgroundColor: 'rgba(148, 163, 184, 0.14)',
    color: colors.accent,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
    paddingRight: 4,
  },
  bulletMarker: {
    width: 18,
    color: colors.textMuted,
    fontWeight: '700',
  },
  listText: {
    flex: 1,
  },
  codeBlock: {
    marginVertical: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  codeBlockText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
});
