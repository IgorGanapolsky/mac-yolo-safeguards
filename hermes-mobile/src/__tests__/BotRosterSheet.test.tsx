import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BotRosterSheet from '../components/BotRosterSheet';
import { DEFAULT_BOT_PERSONAS } from '../services/grokBotService';

describe('BotRosterSheet Component', () => {
  it('renders all bot personas when visible', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();

    const { getByText } = render(
      <BotRosterSheet
        visible={true}
        activePersonaId="chief-of-staff"
        onSelectPersona={onSelect}
        onClose={onClose}
      />
    );

    expect(getByText('Bot Roster')).toBeTruthy();
    expect(getByText('Chief of Staff')).toBeTruthy();
    expect(getByText('QA Tester')).toBeTruthy();
    expect(getByText('Ship & PR Engineer')).toBeTruthy();
    expect(getByText('Inbox Manager')).toBeTruthy();
  });

  it('handles persona selection and calls callback', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();

    const { getByText } = render(
      <BotRosterSheet
        visible={true}
        activePersonaId="chief-of-staff"
        onSelectPersona={onSelect}
        onClose={onClose}
      />
    );

    const qaCard = getByText('QA Tester');
    fireEvent.press(qaCard);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'qa-tester', name: 'QA Tester' })
    );
    expect(onClose).toHaveBeenCalled();
  });
});
