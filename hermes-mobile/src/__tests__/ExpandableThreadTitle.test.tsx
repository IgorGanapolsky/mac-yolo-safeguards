import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ExpandableThreadTitle, {
  EXPANDED_THREAD_TITLE_MAX_LINES,
  likelyTruncatedTitle,
} from '../components/ExpandableThreadTitle';

describe('likelyTruncatedTitle', () => {
  it('flags titles longer than the collapsed line budget', () => {
    expect(likelyTruncatedTitle('Short title', 1)).toBe(false);
    expect(
      likelyTruncatedTitle('Choosing the Right Body of Water for Your Next Adventure', 1),
    ).toBe(true);
  });
});

describe('ExpandableThreadTitle', () => {
  const longTitle =
    'Choosing the Right Body of Water for Your Next Adventure and Fishing Trip';

  it('renders truncated title collapsed by default', () => {
    const { getByTestId } = render(
      <ExpandableThreadTitle title={longTitle} collapsedLines={1} testID="thread-title" />,
    );

    const text = getByTestId('thread-title-text');
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.children).toBe(longTitle);
    expect(text.props.accessibilityLabel).toBe(longTitle);
  });

  it('expands to multiple lines when pressed', () => {
    const { getByTestId } = render(
      <ExpandableThreadTitle title={longTitle} collapsedLines={1} testID="thread-title" />,
    );

    fireEvent.press(getByTestId('thread-title'));
    const text = getByTestId('thread-title-text');
    expect(text.props.numberOfLines).toBe(EXPANDED_THREAD_TITLE_MAX_LINES);
  });

  it('collapses when pressed again', () => {
    const { getByTestId } = render(
      <ExpandableThreadTitle title={longTitle} collapsedLines={1} testID="thread-title" />,
    );

    fireEvent.press(getByTestId('thread-title'));
    fireEvent.press(getByTestId('thread-title'));
    expect(getByTestId('thread-title-text').props.numberOfLines).toBe(1);
  });

  it('resets expansion when the title changes', () => {
    const { getByTestId, rerender } = render(
      <ExpandableThreadTitle title={longTitle} collapsedLines={1} testID="thread-title" />,
    );

    fireEvent.press(getByTestId('thread-title'));
    expect(getByTestId('thread-title-text').props.numberOfLines).toBe(
      EXPANDED_THREAD_TITLE_MAX_LINES,
    );

    rerender(
      <ExpandableThreadTitle
        title="A different thread title that is also quite long for the header"
        collapsedLines={1}
        testID="thread-title"
      />,
    );
    expect(getByTestId('thread-title-text').props.numberOfLines).toBe(1);
  });

  it('skips expand affordance for short titles', () => {
    const { queryByTestId, getByText } = render(
      <ExpandableThreadTitle title="Short" collapsedLines={1} testID="thread-title" />,
    );

    expect(queryByTestId('thread-title')).toBeNull();
    expect(getByText('Short').props.accessibilityLabel).toBe('Short');
  });

  it('applies active styles to the title text', () => {
    const { getByTestId } = render(
      <ExpandableThreadTitle
        title={longTitle}
        collapsedLines={2}
        style={{ color: 'white' }}
        activeStyle={{ fontWeight: '800' }}
        testID="thread-title"
      />,
    );

    const text = getByTestId('thread-title-text');
    expect(text.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: 'white' }), { fontWeight: '800' }]),
    );
  });
});
