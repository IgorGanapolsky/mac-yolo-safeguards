import React from 'react';
import { render } from '@testing-library/react-native';
import VaultProjectPickerChip from '../components/VaultProjectPickerChip';

describe('VaultProjectPickerChip', () => {
  it('uses non-blocking copy when no project is selected', () => {
    const { getByTestId } = render(<VaultProjectPickerChip onPress={jest.fn()} />);

    expect(getByTestId('vault-project-picker-chip')).toBeTruthy();
    expect(getByTestId('vault-project-optional-hint').props.children).toBe(
      'Optional — tells ThumbGate which folder on your Mac to use',
    );
  });

  it('shows the active project name and handoff when selected', () => {
    const { getByTestId, queryByTestId } = render(
      <VaultProjectPickerChip
        projectName="Hermes Mobile"
        handoffSummary="Ship vault picker polish"
        onPress={jest.fn()}
      />,
    );

    expect(getByTestId('vault-project-picker-chip')).toBeTruthy();
    expect(getByTestId('vault-project-handoff-hint').props.children).toBe(
      'Ship vault picker polish',
    );
    expect(queryByTestId('vault-project-optional-hint')).toBeNull();
  });
});
