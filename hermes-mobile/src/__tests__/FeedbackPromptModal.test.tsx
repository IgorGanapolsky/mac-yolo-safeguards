import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import FeedbackPromptModal from '../components/FeedbackPromptModal';

describe('FeedbackPromptModal', () => {
  it('shows optional details copy for thumbs-down', () => {
    const { getByText, getByTestId } = render(
      <FeedbackPromptModal
        visible
        signal="down"
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    expect(getByText('Add details (optional)')).toBeTruthy();
    expect(getByText(/saved your thumbs down/i)).toBeTruthy();
    expect(getByTestId('feedback-prompt-input')).toBeTruthy();
  });

  it('skip closes without submitting details', () => {
    const onClose = jest.fn();
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <FeedbackPromptModal visible signal="up" onClose={onClose} onSubmit={onSubmit} />,
    );

    fireEvent.press(getByTestId('feedback-prompt-skip'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submit sends trimmed explanation when text is entered', () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <FeedbackPromptModal visible signal="down" onClose={onClose} onSubmit={onSubmit} />,
    );

    fireEvent.changeText(getByTestId('feedback-prompt-input'), '  Wrong tool suggested  ');
    fireEvent.press(getByTestId('feedback-prompt-submit'));

    expect(onSubmit).toHaveBeenCalledWith('Wrong tool suggested');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps submit disabled until the user enters text', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <FeedbackPromptModal visible signal="up" onClose={jest.fn()} onSubmit={onSubmit} />,
    );

    const submit = getByTestId('feedback-prompt-submit');
    expect(submit.props.accessibilityState?.disabled ?? submit.props.disabled).toBe(true);

    fireEvent.press(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears input when reopened', () => {
    const { getByTestId, rerender } = render(
      <FeedbackPromptModal visible signal="up" onClose={jest.fn()} onSubmit={jest.fn()} />,
    );

    fireEvent.changeText(getByTestId('feedback-prompt-input'), 'first note');
    rerender(
      <FeedbackPromptModal visible={false} signal="up" onClose={jest.fn()} onSubmit={jest.fn()} />,
    );
    rerender(
      <FeedbackPromptModal visible signal="up" onClose={jest.fn()} onSubmit={jest.fn()} />,
    );

    expect(getByTestId('feedback-prompt-input').props.value).toBe('');
  });
});
