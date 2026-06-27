import type { HermesMessage } from '../types/chat';

type FeedbackPromptState = {
  message: HermesMessage;
  signal: 'up' | 'down';
} | null;

type SubmitFn = (
  message: HermesMessage,
  signal: 'up' | 'down',
  explanation?: string,
) => Promise<boolean>;

/** Mirrors ChatScreen two-step feedback flow for unit testing. */
export function createChatOutputFeedbackFlow(submit: SubmitFn) {
  let prompt: FeedbackPromptState = null;
  const setPrompt = (next: FeedbackPromptState) => {
    prompt = next;
  };

  const handleTap = (message: HermesMessage, signal: 'up' | 'down') => {
    void submit(message, signal);
    setPrompt({ message, signal });
  };

  const handlePromptSubmit = (explanation?: string) => {
    if (prompt && explanation?.trim()) {
      void submit(prompt.message, prompt.signal, explanation.trim());
    }
    setPrompt(null);
  };

  const handleClose = () => setPrompt(null);

  return {
    get prompt() {
      return prompt;
    },
    handleTap,
    handlePromptSubmit,
    handleClose,
  };
}

describe('chat output feedback flow', () => {
  const assistantMessage: HermesMessage = {
    id: 'msg-42',
    role: 'assistant',
    content: 'Run npm test before shipping.',
  };

  it('captures signal immediately on thumb tap and opens optional prompt', async () => {
    const submit = jest.fn().mockResolvedValue(true);
    const flow = createChatOutputFeedbackFlow(submit);

    flow.handleTap(assistantMessage, 'down');

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(assistantMessage, 'down');
    expect(flow.prompt).toEqual({ message: assistantMessage, signal: 'down' });
  });

  it('skip closes prompt without a second capture', () => {
    const submit = jest.fn().mockResolvedValue(true);
    const flow = createChatOutputFeedbackFlow(submit);

    flow.handleTap(assistantMessage, 'up');
    flow.handleClose();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(flow.prompt).toBeNull();
  });

  it('submit with details sends a follow-up capture with explanation', () => {
    const submit = jest.fn().mockResolvedValue(true);
    const flow = createChatOutputFeedbackFlow(submit);

    flow.handleTap(assistantMessage, 'down');
    flow.handlePromptSubmit('Should have opened Leash approval instead.');

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenLastCalledWith(
      assistantMessage,
      'down',
      'Should have opened Leash approval instead.',
    );
    expect(flow.prompt).toBeNull();
  });

  it('submit without text does not send a follow-up capture', () => {
    const submit = jest.fn().mockResolvedValue(true);
    const flow = createChatOutputFeedbackFlow(submit);

    flow.handleTap(assistantMessage, 'up');
    flow.handlePromptSubmit(undefined);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(flow.prompt).toBeNull();
  });
});
