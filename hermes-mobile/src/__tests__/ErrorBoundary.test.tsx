import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import ErrorBoundary from '../components/ErrorBoundary';

function Boom(): React.ReactElement {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>OK</Text>
      </ErrorBoundary>,
    );
    expect(getByText('OK')).toBeTruthy();
  });

  it('shows fallback UI and recovers on retry', () => {
    let shouldThrow = true;
    function MaybeBoom() {
      if (shouldThrow) throw new Error('boom');
      return <Text>Recovered</Text>;
    }

    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <MaybeBoom />
      </ErrorBoundary>,
    );

    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText('boom')).toBeTruthy();

    shouldThrow = false;
    fireEvent.press(getByText('TRY AGAIN'));
    expect(queryByText('Recovered')).toBeTruthy();
  });
});
