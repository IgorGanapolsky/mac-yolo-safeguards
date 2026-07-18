import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { render } from '@testing-library/react-native';
import RunProgressBanner from '../components/RunProgressBanner';
import { EMPTY_REPLY_FAILURE_REASON } from '../utils/emptyStreamReplyRecovery';
import { RUN_PROGRESS_DETAILS_EXPANDED_KEY } from '../utils/runProgressDetailsPreference';

describe('RunProgressBanner', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('shows delivering copy before a run id exists', () => {
    const { getByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'sending',
          startedAtMs: Date.now() - 1200,
          detail: 'Delivering your message…',
        }}
      />,
    );
    expect(getByTestId('run-progress-banner')).toBeTruthy();
    expect(getByTestId('run-progress-detail').props.children).toBe('Delivering your message…');
  });

  it('shows live streaming copy while tokens stream', () => {
    const { getByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 3000,
          detail: '   ',
          runId: 'run-1',
        }}
      />,
    );
    expect(getByTestId('run-progress-detail').props.children).toBe('Live streaming from your computer');
  });

  it('shows stop chip while run is active', () => {
    const onStop = jest.fn();
    const { getByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 5000,
          detail: 'Running tests',
          runId: 'run-1',
        }}
        onStop={onStop}
      />,
    );

    fireEvent.press(getByTestId('run-progress-stop'));
    expect(onStop).toHaveBeenCalled();
  });

  it('hides hermes-agent model name', () => {
    const { queryByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 5000,
          detail: 'Running tests',
          runId: 'run-1',
          model: 'hermes-agent',
        }}
        showTechnicalStats={true}
      />,
    );
    expect(queryByText('hermes-agent')).toBeNull();
  });

  it('shows real model names as short human names', () => {
    const { getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 5000,
          detail: 'Running tests',
          runId: 'run-1',
          model: 'gemini-2.5-flash',
        }}
        showTechnicalStats={true}
      />,
    );
    expect(getByText('Gemini 2.5 Flash')).toBeTruthy();
  });

  it('explains when the Mac has not emitted token usage yet', () => {
    const { getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'sending',
          startedAtMs: Date.now() - 5000,
          detail: 'Delivering your message…',
          model: 'qwen3.5:9b-hermes',
        }}
      />,
    );
    expect(getByText('Qwen3.5 9B Hermes')).toBeTruthy();
    expect(getByText('Counting after reply…')).toBeTruthy();
  });

  it('explains unavailable usage after a terminal run', () => {
    const { getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'completed',
          startedAtMs: Date.now() - 5000,
          detail: 'Done',
          model: 'qwen3.5:9b-hermes',
        }}
      />,
    );
    expect(getByText('Usage unavailable from Mac')).toBeTruthy();
  });

  it('shows token counts during active runs without showTechnicalStats', () => {
    const { getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 3000,
          detail: 'Hermes is thinking…',
          inputTokens: 89041,
          outputTokens: 1989,
        }}
      />,
    );
    expect(getByText('In: 89041 | Out: 1989')).toBeTruthy();
  });

  it('shows live model from tool.progress during active runs', () => {
    const { getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'working',
          startedAtMs: Date.now() - 2000,
          detail: 'Hermes is working on your computer…',
          runId: 'run_live',
          model: 'hermes-local-fast',
          inputTokens: 66476,
          outputTokens: 535,
          streamUsageLive: true,
        }}
      />,
    );
    expect(getByText('Hermes Local Fast')).toBeTruthy();
    expect(getByText('In: 66476 | Out: 535')).toBeTruthy();
  });

  it('uses fallbackModel when progress model is a gateway platform label', () => {
    const { getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'working',
          startedAtMs: Date.now() - 1000,
          detail: 'Hermes is thinking…',
          model: 'hermes-agent',
        }}
        fallbackModel="google/gemini-2.5-flash"
      />,
    );
    expect(getByText('Gemini 2.5 Flash')).toBeTruthy();
  });

  it('shows routed session model live during a run (grok/glm short names)', () => {
    const { getByText, rerender } = render(
      <RunProgressBanner
        progress={{
          phase: 'working',
          startedAtMs: Date.now() - 2000,
          detail: 'Hermes is working on your computer…',
          model: 'grok-4.5',
          inputTokens: 310,
          outputTokens: 79,
        }}
      />,
    );
    expect(getByText('Grok 4.5')).toBeTruthy();

    rerender(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 4000,
          detail: 'streaming',
          model: 'z-ai/glm-5.2',
          inputTokens: 900,
          outputTokens: 120,
        }}
      />,
    );
    expect(getByText('GLM 5.2')).toBeTruthy();
  });

  it('hides the model stat entirely when the model is unknown', () => {
    const { getByText, queryByTestId, queryByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'working',
          startedAtMs: Date.now() - 2000,
          detail: 'Hermes is working on your computer…',
          inputTokens: 12,
          outputTokens: 3,
        }}
      />,
    );
    expect(getByText('In: 12 | Out: 3')).toBeTruthy();
    expect(queryByTestId('run-progress-stats')).toBeTruthy();
    expect(queryByText('MODEL')).toBeNull();
  });

  it('splits long connectivity failures so timer does not overlap text', () => {
    const detail =
      "Your phone can't reach that local computer link. Join the same Wi‑Fi, add a tunnel URL in Settings, or use relay for approvals only.";
    const { getByTestId, getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'failed',
          startedAtMs: Date.now() - 229000,
          detail,
        }}
      />,
    );
    expect(getByTestId('run-progress-detail').props.children).toBe("Couldn't reach your computer");
    expect(getByTestId('run-progress-failed-detail').props.children).toBe(detail);
    expect(getByText('3m 49s')).toBeTruthy();
  });

  it('shows spinner and Starting label while start-fresh is in flight', () => {
    const onStartFreshChat = jest.fn();
    const { getByTestId, getByText, queryByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'working',
          startedAtMs: Date.now() - 2000,
          detail: 'Delivering your message…',
        }}
        megaSessionWarning="Chat too large — start a fresh chat"
        onStartFreshChat={onStartFreshChat}
        isStartingFreshChat
      />,
    );
    expect(getByTestId('run-progress-start-fresh-spinner')).toBeTruthy();
    expect(getByText('Starting…')).toBeTruthy();
    expect(queryByText('Start fresh chat')).toBeNull();
  });

  it('shows stale hint and emphasized stop after warn threshold', () => {
    const onStop = jest.fn();
    const { getByTestId, getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'working',
          startedAtMs: Date.now() - 16 * 60 * 1000,
          detail: 'Agent working…',
          runId: 'run-stale',
        }}
        onStop={onStop}
      />,
    );
    expect(getByTestId('run-progress-stale-hint').props.children).toContain(
      'Taking longer than expected',
    );
    expect(getByText('Stop stuck run')).toBeTruthy();
  });

  it('expands model and token stats by default', () => {
    const { getByTestId, getByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 2000,
          detail: 'Delivering your message…',
          model: 'google/gemini-2.5-flash',
          inputTokens: 120,
          outputTokens: 45,
        }}
      />,
    );
    expect(getByTestId('run-progress-toggle')).toBeTruthy();
    expect(getByTestId('run-progress-stats')).toBeTruthy();
    expect(getByText('Gemini 2.5 Flash')).toBeTruthy();
    expect(getByText('In: 120 | Out: 45')).toBeTruthy();
  });

  it('collapses model and token stats while keeping status header', () => {
    const { getByTestId, getByText, queryByTestId, queryByText } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 2000,
          detail: 'Delivering your message…',
          model: 'google/gemini-2.5-flash',
          inputTokens: 120,
          outputTokens: 45,
        }}
      />,
    );

    fireEvent.press(getByTestId('run-progress-toggle'));

    expect(getByTestId('run-progress-detail').props.children).toBe('Delivering your message…');
    expect(queryByTestId('run-progress-stats')).toBeNull();
    expect(queryByText('Gemini 2.5 Flash')).toBeNull();
    expect(queryByText('In: 120 | Out: 45')).toBeNull();
  });

  it('toggles details when tapping the header row', () => {
    const { getByTestId, queryByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'working',
          startedAtMs: Date.now() - 1000,
          detail: 'Hermes is thinking…',
          inputTokens: 10,
          outputTokens: 2,
        }}
      />,
    );

    expect(getByTestId('run-progress-stats')).toBeTruthy();
    fireEvent.press(getByTestId('run-progress-header'));
    expect(queryByTestId('run-progress-stats')).toBeNull();
    fireEvent.press(getByTestId('run-progress-header'));
    expect(getByTestId('run-progress-stats')).toBeTruthy();
  });

  it('does not show collapse toggle when there are no detail rows', () => {
    const { queryByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'sending',
          startedAtMs: Date.now() - 500,
          detail: 'Delivering your message…',
        }}
      />,
    );
    expect(queryByTestId('run-progress-toggle')).toBeNull();
  });

  it('shows Refresh chip wired for empty-reply recovery', () => {
    const onRefreshRun = jest.fn();
    const { getByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'failed',
          startedAtMs: Date.now() - 60_000,
          detail: EMPTY_REPLY_FAILURE_REASON,
        }}
        onRefreshRun={onRefreshRun}
      />,
    );

    fireEvent.press(getByTestId('run-progress-refresh'));
    expect(onRefreshRun).toHaveBeenCalledTimes(1);
  });

  it('collapses MODEL/TOKENS details in compact (keyboard) mode by default', () => {
    const { queryByTestId, getByTestId } = render(
      <RunProgressBanner
        compact
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 5000,
          detail: 'Hermes is working on your computer…',
          model: 'qwen3.5:9b-hermes',
          inputTokens: 10,
          outputTokens: 2,
        }}
      />,
    );

    expect(getByTestId('run-progress-banner')).toBeTruthy();
    expect(queryByTestId('run-progress-stats')).toBeNull();
  });

  it('expands details again when leaving compact mode without a user preference', () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <RunProgressBanner
        compact
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 5000,
          detail: 'Hermes is working on your computer…',
          model: 'qwen3.5:9b-hermes',
          inputTokens: 10,
          outputTokens: 2,
        }}
      />,
    );
    expect(queryByTestId('run-progress-stats')).toBeNull();

    rerender(
      <RunProgressBanner
        compact={false}
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 5000,
          detail: 'Hermes is working on your computer…',
          model: 'qwen3.5:9b-hermes',
          inputTokens: 10,
          outputTokens: 2,
        }}
      />,
    );
    expect(getByTestId('run-progress-stats')).toBeTruthy();
  });

  it('keeps collapsed details after leaving compact once the user collapsed', async () => {
    const startedAtMs = Date.now() - 5000;
    const { getByTestId, queryByTestId, rerender } = render(
      <RunProgressBanner
        compact={false}
        progress={{
          phase: 'streaming',
          startedAtMs,
          detail: 'Delivering your message…',
          model: 'qwen3.5:9b-hermes',
          inputTokens: 0,
          outputTokens: 0,
        }}
        onStop={() => undefined}
        terminalToolName="terminal"
        terminalPreview="lsof -i :9222"
      />,
    );

    expect(getByTestId('run-progress-stats')).toBeTruthy();
    fireEvent.press(getByTestId('run-progress-toggle'));
    expect(queryByTestId('run-progress-stats')).toBeNull();
    expect(queryByTestId('operator-terminal-preview')).toBeNull();
    expect(getByTestId('run-progress-detail').props.children).toBe('Delivering your message…');
    expect(getByTestId('run-progress-stop')).toBeTruthy();
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(RUN_PROGRESS_DETAILS_EXPANDED_KEY)).toBe('0');
    });

    rerender(
      <RunProgressBanner
        compact
        progress={{
          phase: 'streaming',
          startedAtMs,
          detail: 'Delivering your message…',
          model: 'qwen3.5:9b-hermes',
          inputTokens: 0,
          outputTokens: 0,
        }}
        onStop={() => undefined}
        terminalToolName="terminal"
        terminalPreview="lsof -i :9222"
      />,
    );
    expect(queryByTestId('run-progress-stats')).toBeNull();

    rerender(
      <RunProgressBanner
        compact={false}
        progress={{
          phase: 'streaming',
          startedAtMs,
          detail: 'Delivering your message…',
          model: 'qwen3.5:9b-hermes',
          inputTokens: 12,
          outputTokens: 3,
        }}
        onStop={() => undefined}
        terminalToolName="terminal"
        terminalPreview="lsof -i :9222 + 1 command"
      />,
    );
    expect(queryByTestId('run-progress-stats')).toBeNull();
    expect(queryByTestId('operator-terminal-preview')).toBeNull();
    expect(getByTestId('run-progress-detail').props.children).toBe('Delivering your message…');
    expect(getByTestId('run-progress-stop')).toBeTruthy();
  });

  it('does not re-expand on token or terminal poll updates after collapse', () => {
    const startedAtMs = Date.now() - 2000;
    const { getByTestId, queryByTestId, rerender } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs,
          detail: 'Delivering your message…',
          inputTokens: 0,
          outputTokens: 0,
        }}
        onStop={() => undefined}
        terminalPreview="echo start"
      />,
    );

    fireEvent.press(getByTestId('run-progress-toggle'));
    expect(queryByTestId('run-progress-stats')).toBeNull();

    rerender(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs,
          detail: 'Delivering your message…',
          inputTokens: 40,
          outputTokens: 8,
        }}
        onStop={() => undefined}
        terminalToolName="terminal"
        terminalPreview="lsof -i :9222 2>/dev/null + 1 command"
      />,
    );

    expect(queryByTestId('run-progress-stats')).toBeNull();
    expect(queryByTestId('operator-terminal-preview')).toBeNull();
    expect(getByTestId('run-progress-stop')).toBeTruthy();
  });

  it('restores persisted collapsed preference on mount', async () => {
    await AsyncStorage.setItem(RUN_PROGRESS_DETAILS_EXPANDED_KEY, '0');
    const { queryByTestId, getByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 3000,
          detail: 'Delivering your message…',
          inputTokens: 10,
          outputTokens: 2,
        }}
        onStop={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(queryByTestId('run-progress-stats')).toBeNull();
    });
    expect(getByTestId('run-progress-detail').props.children).toBe('Delivering your message…');
    expect(getByTestId('run-progress-stop')).toBeTruthy();
  });

  it('never auto-reexpands on a new send after the user collapsed', async () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <RunProgressBanner
        progress={{
          phase: 'streaming',
          startedAtMs: Date.now() - 4000,
          detail: 'Delivering your message…',
          inputTokens: 1,
          outputTokens: 0,
        }}
        onStop={() => undefined}
      />,
    );

    fireEvent.press(getByTestId('run-progress-toggle'));
    expect(queryByTestId('run-progress-stats')).toBeNull();

    await act(async () => {
      rerender(
        <RunProgressBanner
          progress={{
            phase: 'sending',
            startedAtMs: Date.now(),
            detail: 'Delivering your message…',
            inputTokens: 0,
            outputTokens: 0,
          }}
          onStop={() => undefined}
          terminalPreview="new tool line"
        />,
      );
    });

    expect(queryByTestId('run-progress-stats')).toBeNull();
    expect(queryByTestId('operator-terminal-preview')).toBeNull();
    expect(getByTestId('run-progress-stop')).toBeTruthy();
  });

  it('shows Agent Conf stall investigation after long delivering on weak model', () => {
    jest.useFakeTimers();
    const { getByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'sending',
          startedAtMs: Date.now() - 60_000,
          detail: 'Delivering your message…',
          model: 'qwen3.5:9b-hermes-64k',
          outputTokens: 0,
        }}
        fallbackModel="qwen3.5:9b-hermes-64k"
        sessionTokens={5000}
        macHttpOk
        onSwitchMac={jest.fn()}
        onStartFreshChat={jest.fn()}
      />,
    );
    expect(getByTestId('run-progress-investigation').props.children).toMatch(/weak local model/i);
    expect(getByTestId('run-progress-switch-mac')).toBeTruthy();
    jest.useRealTimers();
  });

  it('hides stall investigation rows while details stay collapsed', () => {
    jest.useFakeTimers();
    const { getByTestId, queryByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'sending',
          startedAtMs: Date.now() - 60_000,
          detail: 'Delivering your message…',
          model: 'qwen3.5:9b-hermes-64k',
          outputTokens: 0,
          inputTokens: 1,
        }}
        fallbackModel="qwen3.5:9b-hermes-64k"
        sessionTokens={5000}
        macHttpOk
        onStop={() => undefined}
        onSwitchMac={jest.fn()}
        onStartFreshChat={jest.fn()}
      />,
    );
    expect(getByTestId('run-progress-investigation')).toBeTruthy();
    fireEvent.press(getByTestId('run-progress-toggle'));
    expect(queryByTestId('run-progress-investigation')).toBeNull();
    expect(queryByTestId('run-progress-switch-mac')).toBeNull();
    expect(getByTestId('run-progress-detail').props.children).toBe('Delivering your message…');
    expect(getByTestId('run-progress-stop')).toBeTruthy();
    jest.useRealTimers();
  });

  it('shows actionable completed copy instead of ready-on-your-computer', () => {
    const { getByTestId, queryByText, queryByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'completed',
          startedAtMs: Date.now() - 16_000,
          detail: 'Reply ready on your computer',
          duration: 16,
        }}
        onDismiss={() => {}}
      />,
    );
    expect(getByTestId('run-progress-detail').props.children).toBe('Done');
    expect(queryByText(/on your computer/i)).toBeNull();
    expect(queryByTestId('run-progress-reply-snippet')).toBeNull();
  });

  it('shows Reply ready title plus reply snippet on completed banner', () => {
    const { getByTestId } = render(
      <RunProgressBanner
        progress={{
          phase: 'completed',
          startedAtMs: Date.now() - 8_000,
          detail: 'Reply ready',
          replyPreview: 'Here is the revenue plan for today.',
          duration: 8,
        }}
        onDismiss={() => {}}
      />,
    );
    expect(getByTestId('run-progress-detail').props.children).toBe('Reply ready');
    expect(getByTestId('run-progress-reply-snippet').props.children).toBe(
      'Here is the revenue plan for today.',
    );
  });
});
