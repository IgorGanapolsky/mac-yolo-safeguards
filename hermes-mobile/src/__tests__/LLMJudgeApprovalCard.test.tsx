import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LLMJudgeApprovalCard from '../components/LLMJudgeApprovalCard';
import { evaluateToolSafety } from '../services/grokBotService';

describe('LLMJudgeApprovalCard Component', () => {
  it('renders high risk assessment with warning details', () => {
    const assessment = evaluateToolSafety('run_command', 'git push origin main --force');
    const onApprove = jest.fn();
    const onDeny = jest.fn();

    const { getByText, getAllByText } = render(
      <LLMJudgeApprovalCard
        assessment={assessment}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );

    expect(getByText('LLM Judge Decision Gate')).toBeTruthy();
    expect(getByText(/HIGH RISK/i)).toBeTruthy();
    expect(getByText('git push origin main --force')).toBeTruthy();
    expect(
      getAllByText(/Destructive branch overwrite forbidden without review/i).length
    ).toBeGreaterThan(0);
  });

  it('triggers onApprove and onDeny actions', () => {
    const assessment = evaluateToolSafety('run_command', 'git push origin main --force');
    const onApprove = jest.fn();
    const onDeny = jest.fn();

    const { getByText } = render(
      <LLMJudgeApprovalCard
        assessment={assessment}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );

    const approveBtn = getByText('Allow Once');
    fireEvent.press(approveBtn);
    expect(onApprove).toHaveBeenCalledWith(assessment.id);

    const denyBtn = getByText('Deny Action');
    fireEvent.press(denyBtn);
    expect(onDeny).toHaveBeenCalledWith(assessment.id);
  });
});
