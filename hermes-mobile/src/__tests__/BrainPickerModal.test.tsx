import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BrainPickerModal from '../components/BrainPickerModal';
import { BRAIN_MODELS } from '../services/grokBotService';

describe('BrainPickerModal Component', () => {
  it('renders all brain models and their cost labels', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();

    const { getByText } = render(
      <BrainPickerModal
        visible={true}
        activeModelId="ollama-local"
        onSelectModel={onSelect}
        onClose={onClose}
      />
    );

    expect(getByText(/Mixture of Experts/i)).toBeTruthy();
    expect(getByText('Ollama Llama 3.3 (Local)')).toBeTruthy();
    expect(getByText('Z.AI GLM-5.3 (Coding Plan)')).toBeTruthy();
    expect(getByText('Alibaba Qwen 3.8 Max')).toBeTruthy();
    expect(getByText('$0.00 / 100% Local')).toBeTruthy();
  });

  it('handles model selection', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();

    const { getByText } = render(
      <BrainPickerModal
        visible={true}
        activeModelId="ollama-local"
        onSelectModel={onSelect}
        onClose={onClose}
      />
    );

    const glmCard = getByText('Z.AI GLM-5.3 (Coding Plan)');
    fireEvent.press(glmCard);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'zai-glm53' })
    );
    expect(onClose).toHaveBeenCalled();
  });
});
