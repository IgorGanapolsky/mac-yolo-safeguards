import React from 'react';
import { render, screen } from '@testing-library/react-native';
import WorkingActivityBar from '../components/WorkingActivityBar';

describe('WorkingActivityBar', () => {
  it('renders nothing when not working', () => {
    render(<WorkingActivityBar visible={false} />);
    expect(screen.queryByTestId('working-activity-bar')).toBeNull();
  });

  it('renders pulse track when working', () => {
    render(<WorkingActivityBar visible />);
    expect(screen.getByTestId('working-activity-bar')).toBeTruthy();
    expect(screen.getByTestId('working-activity-pulse')).toBeTruthy();
  });
});
