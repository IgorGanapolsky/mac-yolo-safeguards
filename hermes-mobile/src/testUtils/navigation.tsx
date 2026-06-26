import React from 'react';
import { render, type RenderOptions } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const Tab = createBottomTabNavigator();

type TabRoute = 'Leash' | 'Chat' | 'Settings';

function DummyScreen() {
  return null;
}

function TabHarness({
  screen,
  route,
}: {
  screen: React.ComponentType;
  route: TabRoute;
}) {
  const screens: TabRoute[] = ['Leash', 'Chat', 'Settings'];
  return (
    <NavigationContainer>
      <Tab.Navigator initialRouteName={route} screenOptions={{ headerShown: false }}>
        {screens.map((name) => (
          <Tab.Screen
            key={name}
            name={name}
            component={name === route ? screen : DummyScreen}
          />
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export function renderWithTabNavigation(
  screen: React.ComponentType,
  route: TabRoute,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(<TabHarness screen={screen} route={route} />, options);
}

/** Alias for older test imports */
export const renderInTabNavigator = renderWithTabNavigation;
