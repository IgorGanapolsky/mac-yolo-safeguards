import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import ChatFormattedText from '../components/ChatFormattedText';

describe('ChatFormattedText', () => {
  it('renders plain assistant text as selectable', () => {
    const { UNSAFE_getByType } = render(
      <ChatFormattedText text="Plain assistant reply." testID="plain-body" />,
    );
    const rootText = UNSAFE_getByType(Text);
    expect(rootText.props.selectable).toBe(true);
    expect(rootText.props.testID).toBe('plain-body');
  });

  it('renders formatted markdown blocks as selectable text nodes', () => {
    const { UNSAFE_getAllByType } = render(
      <ChatFormattedText
        text={'## Summary\n\n- First item\n\n```\ncode()\n```\n\nDone with **bold**.'}
        testID="formatted-body"
      />,
    );
    const textNodes = UNSAFE_getAllByType(Text);
    expect(textNodes.length).toBeGreaterThan(0);
    expect(textNodes.every((node) => node.props.selectable === true)).toBe(true);
  });

  it('respects selectable=false for plain text', () => {
    const { UNSAFE_getByType } = render(
      <ChatFormattedText text="Not copyable." selectable={false} />,
    );
    expect(UNSAFE_getByType(Text).props.selectable).toBe(false);
  });

  it('respects selectable=false for formatted markdown', () => {
    const { UNSAFE_getAllByType } = render(
      <ChatFormattedText text="## Heading\n\nParagraph." selectable={false} />,
    );
    const textNodes = UNSAFE_getAllByType(Text);
    expect(textNodes.length).toBeGreaterThan(0);
    expect(textNodes.every((node) => node.props.selectable === false)).toBe(true);
  });

  it('keeps user variant on plain path even with markdown-like characters', () => {
    const { UNSAFE_getByType } = render(
      <ChatFormattedText text="Use `npm test` on **your** machine." variant="user" />,
    );
    const rootText = UNSAFE_getByType(Text);
    expect(rootText.props.selectable).toBe(true);
    expect(rootText.props.children).toBe('Use `npm test` on **your** machine.');
  });
});
