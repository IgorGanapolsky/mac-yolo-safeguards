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

  it('keeps a composer gap so the chip does not crowd the send control', () => {
    const { getByTestId } = render(<VaultProjectPickerChip onPress={jest.fn()} />);
    const chip = getByTestId('vault-project-picker-chip');
    const style = Array.isArray(chip.props.style)
      ? Object.assign({}, ...chip.props.style.filter(Boolean))
      : chip.props.style;
    // Pressable may pass a style function
    const resolved =
      typeof chip.props.style === 'function'
        ? Object.assign({}, ...[].concat(chip.props.style({ pressed: false })).filter(Boolean))
        : style;
    expect(resolved.marginBottom).toBeGreaterThanOrEqual(10);
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
