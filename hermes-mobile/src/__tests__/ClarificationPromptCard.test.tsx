import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ClarificationPromptCard from '../components/ClarificationPromptCard';

describe('ClarificationPromptCard', () => {
  it('renders question and option buttons', () => {
    const onSelectOption = jest.fn();
    const { getByTestId, getByText } = render(
      <ClarificationPromptCard
        clarification={{
          question: 'Which Mac should Hermes use?',
          options: [
            { id: 'mini', label: 'Mac mini' },
            { id: 'mbp', label: 'MacBook Pro' },
          ],
          partial: false,
        }}
        onSelectOption={onSelectOption}
      />,
    );

    expect(getByTestId('clarification-question').props.children).toBe(
      'Which Mac should Hermes use?',
    );
    expect(getByText('Mac mini')).toBeTruthy();
    fireEvent.press(getByTestId('clarification-option-mini'));
    expect(onSelectOption).toHaveBeenCalledWith({ id: 'mini', label: 'Mac mini' });
  });

  it('shows partial-stream hint when options are still loading', () => {
    const { getByTestId } = render(
      <ClarificationPromptCard
        clarification={{
          question: 'Which path should I take?',
          options: [],
          partial: true,
        }}
        onSelectOption={jest.fn()}
      />,
    );

    expect(getByTestId('clarification-partial-hint')).toBeTruthy();
  });
});
