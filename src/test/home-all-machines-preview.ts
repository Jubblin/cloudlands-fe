import { store } from '$store/renderer/store';
import { registerMockIpcHandler } from '$shared/ipc-mock-router';
import { installMockElectronBridge } from './ct-mock-electron-bridge';
import { connectionsListReceived } from '$store/renderer/slices/connections/connections-slice';
import { selectConnections } from '$store/renderer/slices/connections/connections-selectors';
import { homeAllMachinesSaga } from '$features/home/home-all-machines-saga';
import {
  CONNECTION_CHANNELS,
  type ConnectionRecord,
  type ListAllWorkspacesResult,
  type MachineWorkspaceSummary,
} from '$shared/types/connections';

export type HomeAllMachinesScenario = 'mixed' | 'all-empty';

const NOW = Date.parse('2026-11-11T12:00:00Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const row = (
  id: string,
  title: string,
  extra: Partial<MachineWorkspaceSummary> = {},
): MachineWorkspaceSummary => ({
  id,
  title,
  branch: id,
  status: 'active',
  repositoryName: 'intent',
  lastActivityAt: ago(30),
  ...extra,
});

const remote = (id: string, label: string, host: string): ConnectionRecord => ({
  id,
  label,
  host,
  port: 5181,
  fingerprint: 'AB',
  isLocal: false,
  status: 'connected',
});

const connections: ConnectionRecord[] = [
  {
    id: 'local',
    label: 'This machine',
    host: null,
    port: null,
    fingerprint: null,
    isLocal: true,
    status: 'connected',
  },
  remote('studio', 'Mac Studio', '192.0.2.10'),
  remote('build', 'Build server', '192.0.2.11'),
  remote('laptop', 'Travel laptop', '192.0.2.12'),
];

function result(scenario: HomeAllMachinesScenario): ListAllWorkspacesResult {
  if (scenario === 'all-empty')
    return {
      machines: connections.map((c) => ({ id: c.id, ok: true, workspaces: [] })),
    };
  return {
    machines: [
      {
        id: 'local',
        ok: true,
        workspaces: [
          row('fix-login-bug', 'Fix login bug', {
            activity: 'agent_running',
            lastActivityAt: ago(2),
          }),
          row('dark-mode', 'Add dark mode support', {
            displayStatus: 'in_review',
            lastActivityAt: ago(95),
          }),
        ],
      },
      {
        id: 'studio',
        ok: true,
        workspaces: [
          row('release-notes', 'Draft release notes', {
            repositoryName: 'cloudlands-fe',
            lastActivityAt: ago(60 * 26),
          }),
        ],
      },
      { id: 'build', ok: false, reason: 'timeout' },
      { id: 'laptop', ok: false, reason: 'not-connected' },
    ],
  };
}

export function setupHomeAllMachinesFixture(scenario: HomeAllMachinesScenario) {
  const before = store.state;
  const previousConnections = selectConnections.select(before);
  const previousApi = window.electronAPI;
  installMockElectronBridge({});
  registerMockIpcHandler(CONNECTION_CHANNELS.LIST_ALL_WORKSPACES, async () => result(scenario));
  store.dispatch(
    connectionsListReceived({ connections, activeId: 'local', windowBackendId: 'local' }),
  );
  const stop = store.runSaga(homeAllMachinesSaga);
  return () => {
    stop();
    window.electronAPI = previousApi;
    registerMockIpcHandler(
      CONNECTION_CHANNELS.LIST_ALL_WORKSPACES,
      async (): Promise<ListAllWorkspacesResult> => ({ machines: [] }),
    );
    store.dispatch(
      connectionsListReceived({
        connections: previousConnections,
        activeId: before.connections.activeId,
        windowBackendId: before.connections.windowBackendId,
      }),
    );
  };
}
