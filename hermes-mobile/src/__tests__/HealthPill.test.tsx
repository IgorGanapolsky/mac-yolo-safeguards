import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import HealthPill from '../components/HealthPill';

describe('HealthPill', () => {
  it('shrinks and truncates long connection detail instead of pushing sibling controls away', () => {
    const { getByTestId } = render(
      <HealthPill level="green" detail="Direct link OK · relay not paired" />,
    );

    const detail = getByTestId('health-pill-detail');
    expect(detail.props.numberOfLines).toBe(1);
    expect(detail.props.ellipsizeMode).toBe('tail');
    expect(StyleSheet.flatten(detail.props.style)).toMatchObject({
      flexShrink: 1,
      minWidth: 0,
    });
  });
});
