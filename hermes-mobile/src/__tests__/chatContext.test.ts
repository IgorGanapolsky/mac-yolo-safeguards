import type { GatewayHealthSnapshot } from '../types/gateway';
import type { ChatProjectState } from '../types/chatProject';
import { resolveChatMachineLabel, resolveChatProject } from '../utils/chatContext';

const sampleHealth = (partial: Partial<GatewayHealthSnapshot>): GatewayHealthSnapshot => ({
  level: 'green',
  checkedAt: '2026-06-18T12:00:00.000Z',
  ...partial,
});

describe('chatContext', () => {
  const projectState: ChatProjectState = {
    projects: [
      {
        id: 'proj-1',
        name: 'mac-yolo-safeguards',
        workspacePath: '~/workspace/git/igor/mac-yolo-safeguards',
        sessionIds: ['sess-a'],
        activeSessionId: 'sess-a',
      },
    ],
    sessionProjectMap: { 'sess-a': 'proj-1' },
    sessionLabels: {},
    activeProjectId: null,
  };

  it('prefers saved gateway profile label for machine display', () => {
    const label = resolveChatMachineLabel(
      'http://192.168.12.208:8642',
      sampleHealth({ hostname: 'Mac-Pro.local', localIp: '192.168.12.208' }),
      {
        id: 'mac_192_168_12_208',
        label: 'Mac Pro',
        gatewayUrl: 'http://192.168.12.208:8642',
        localIp: '192.168.12.208',
        addedAt: '2026-06-18T00:00:00Z',
      },
    );
    expect(label).toBe('Mac Pro (192.168.12.208)');
  });

  it('falls back to health hostname when profile missing', () => {
    const label = resolveChatMachineLabel(
      'http://192.168.12.208:8642',
      sampleHealth({ hostname: 'igor-mac-mini.local', localIp: '192.168.12.50' }),
      null,
    );
    expect(label).toBe('igor-mac-mini (192.168.12.50)');
  });

  it('uses hostname from saved profile when label is only an IP', () => {
    const label = resolveChatMachineLabel(
      'http://192.168.12.138:8642',
      null,
      null,
      [
        {
          id: 'mac_192_168_12_138',
          label: '192.168.12.138',
          gatewayUrl: 'http://192.168.12.138:8642',
          hostname: 'Igor-Mac-Mini',
          localIp: '192.168.12.138',
          addedAt: '2026-06-18T00:00:00Z',
        },
      ],
    );
    expect(label).toBe('Igor-Mac-Mini (192.168.12.138)');
  });

  it('resolves project from session binding when no active project chip', () => {
    const project = resolveChatProject(projectState, 'sess-a');
    expect(project?.name).toBe('mac-yolo-safeguards');
    expect(project?.workspacePath).toContain('mac-yolo-safeguards');
  });

  it('prefers active project chip over session binding', () => {
    const state: ChatProjectState = {
      ...projectState,
      activeProjectId: 'proj-1',
    };
    const project = resolveChatProject(state, 'other-session');
    expect(project?.id).toBe('proj-1');
  });

  it('uses per-computer active project when profile id is provided', () => {
    const state: ChatProjectState = {
      ...projectState,
      activeProjectId: null,
      activeProjectByComputer: { mac_mini: 'proj-1' },
    };
    const project = resolveChatProject(state, 'other-session', 'mac_mini');
    expect(project?.id).toBe('proj-1');
  });
});
