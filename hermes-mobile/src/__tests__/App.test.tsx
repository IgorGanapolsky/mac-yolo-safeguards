import React from 'react';
import { render } from '@testing-library/react-native';
import TabBarIcon from '../components/TabBarIcon';

describe('TabBarIcon', () => {
  it('renders Hermes tab icon without exposing ionicon name strings', () => {
    const { toJSON, queryByText } = render(
      <TabBarIcon routeName="Chat" focused color="#6366F1" size={22} />,
    );

    expect(toJSON()).toBeTruthy();
    expect(queryByText('chatbubble-ellipses-outline')).toBeNull();
    expect(queryByText('chatbubble-ellipses')).toBeNull();
  });

  it('renders Leash and Settings icons', () => {
    const leash = render(<TabBarIcon routeName="Leash" focused color="#6366F1" />);
    const settings = render(<TabBarIcon routeName="Settings" focused={false} color="#9CA3AF" />);

    expect(leash.toJSON()).toBeTruthy();
    expect(settings.toJSON()).toBeTruthy();
  });
});
