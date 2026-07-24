import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import LeashCommonToolsSection from '../components/LeashCommonToolsSection';

describe('LeashCommonToolsSection', () => {
  it('renders common tools default-on and toggles require-approval', () => {
    const onChangeApprovalRequiredIds = jest.fn();
    const onChangeCustomTools = jest.fn();
    const { getByTestId, getByText } = render(
      <LeashCommonToolsSection
        approvalRequiredIds={[]}
        customTools={[]}
        onChangeApprovalRequiredIds={onChangeApprovalRequiredIds}
        onChangeCustomTools={onChangeCustomTools}
      />,
    );

    expect(getByTestId('leash-common-tools')).toBeTruthy();
    expect(getByText('Common tools')).toBeTruthy();
    expect(getByTestId('leash-tool-switch-terminal').props.value).toBe(true);

    fireEvent(getByTestId('leash-tool-switch-terminal'), 'valueChange', false);
    expect(onChangeApprovalRequiredIds).toHaveBeenCalledWith(['terminal']);
  });

  it('adds a custom tool from the input', () => {
    const onChangeCustomTools = jest.fn();
    const { getByTestId } = render(
      <LeashCommonToolsSection
        approvalRequiredIds={[]}
        customTools={[]}
        onChangeApprovalRequiredIds={jest.fn()}
        onChangeCustomTools={onChangeCustomTools}
      />,
    );

    fireEvent.changeText(getByTestId('leash-custom-tool-input'), 'Docker');
    fireEvent.press(getByTestId('leash-custom-tool-add'));
    expect(onChangeCustomTools).toHaveBeenCalledWith([
      { id: 'custom_docker', label: 'Docker' },
    ]);
  });
});
