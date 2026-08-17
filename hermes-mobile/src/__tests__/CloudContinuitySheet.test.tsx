import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CloudContinuitySheet from '../components/CloudContinuitySheet';

describe('CloudContinuitySheet Component', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('renders VPS sandbox endpoint inputs and continuity toggle', () => {
    const onClose = jest.fn();

    const { getByText, getByPlaceholderText } = render(
      <CloudContinuitySheet visible={true} onClose={onClose} />
    );

    expect(getByText(/Cloud Continuity & VPS Hub/i)).toBeTruthy();
    expect(getByText('Session Continuity')).toBeTruthy();
    expect(getByPlaceholderText('e.g. vps.local:8799 or 100.x.y.z')).toBeTruthy();
    expect(getByText('Save & Connect Cloud Sandbox')).toBeTruthy();
  });

  it('saves VPS host and API key to storage on submit', async () => {
    const onClose = jest.fn();

    const { getByPlaceholderText, getByText } = render(
      <CloudContinuitySheet visible={true} onClose={onClose} />
    );

    const hostInput = getByPlaceholderText('e.g. vps.local:8799 or 100.x.y.z');
    fireEvent.changeText(hostInput, 'vps.mycloud.net:8799');

    const keyInput = getByPlaceholderText('Paste cloud pairing key');
    fireEvent.changeText(keyInput, 'sk-cloud-vps-test');

    const saveBtn = getByText('Save & Connect Cloud Sandbox');
    fireEvent.press(saveBtn);

    await waitFor(async () => {
      const savedHost = await AsyncStorage.getItem('@hermes_cloud_vps_host_v1');
      const savedKey = await AsyncStorage.getItem('@hermes_cloud_vps_api_key_v1');
      expect(savedHost).toBe('vps.mycloud.net:8799');
      expect(savedKey).toBe('sk-cloud-vps-test');
    });
  });
});
