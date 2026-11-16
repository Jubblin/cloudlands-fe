import { store } from '$store/renderer/store';
import { registerMockIpcHandler } from '$shared/ipc-mock-router';
import { installMockElectronBridge } from './ct-mock-electron-bridge';
import { connectionsListReceived } from '$store/renderer/slices/connections/connections-slice';
import { selectConnections } from '$store/renderer/slices/connections/connections-selectors';
import { homeAllMachinesSaga } from '$features/home/home-all-machines-saga';
import { resetHomeWorkspaceView } from '$features/home/home-workspaces-slice';
import { openConnectionRequested } from '$store/renderer/slices/connections/connections-slice';
import { put, takeEvery } from 'typed-redux-saga';
import {
  CONNECTION_CHANNELS,
  type ConnectionRecord,
  type ListAllWorkspacesParams,
  type ListAllWorkspacesResult,
  type MachineWorkspaceRow,
} from '$shared/types/connections';

export type HomeAllMachinesScenario = 'mixed' | 'all-empty';

const NOW = Date.parse('2026-11-11T12:00:00Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const row = (
  id: string,
  title: string,
  extra: Record<string, unknown> = {},
): MachineWorkspaceRow => ({
  id,
  title,
  branch: id,
  status: 'active',
  repositoryName: 'intent',
  repositoryOwner: 'intent-hq',
  createdAt: ago(60 * 24 * 3),
  lastContentActivity: ago(30),
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

function result(
  scenario: HomeAllMachinesScenario,
  includeRetired: boolean,
): ListAllWorkspacesResult {
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
          row('swift-otter', 'Fix login bug', {
            activity: 'agent_running',
            displayStatus: 'in_progress',
            lastContentActivity: ago(2),
            statusMessage: 'Reproducing the redirect loop',
          }),
          // The same workspace id as on the other machine: they must stay distinct rows.
          row('dusty-attic', 'Old spike', {
            status: 'archived',
            lastContentActivity: ago(60 * 24 * 20),
          }),
          row('amber-forest', 'Add dark mode support', {
            displayStatus: 'pr_open',
            lastContentActivity: ago(95),
          }),
        ],
      },
      {
        id: 'studio',
        ok: true,
        workspaces: [
          row('amber-forest', 'Draft release notes', {
            repositoryName: 'cloudlands-fe',
            displayStatus: 'needs_attention',
            attention: 'review_required',
            lastContentActivity: ago(60 * 26),
          }),
          row('quiet-harbor', 'Refactor sidebar', {
            repositoryName: 'cloudlands-fe',
            displayStatus: 'idle',
            lastContentActivity: ago(60 * 24 * 2),
          }),
          // Archived with its folder purged: only listed when asked for.
          ...(includeRetired
            ? [
                row('mossy-cellar', 'Purged experiment', {
                  status: 'retired',
                  lastContentActivity: ago(60 * 24 * 30),
                }),
              ]
            : []),
        ],
      },
      { id: 'build', ok: false, reason: 'timeout' },
      { id: 'laptop', ok: false, reason: 'not-connected' },
    ],
  };
}

export function setupHomeAllMachinesFixture(scenario: HomeAllMachinesScenario) {
  const before = store.state;
  store.dispatch(resetHomeWorkspaceView());
  const previousConnections = selectConnections.select(before);
  const previousApi = window.electronAPI;
  installMockElectronBridge({});
  registerMockIpcHandler(CONNECTION_CHANNELS.LIST_ALL_WORKSPACES, async (arg) =>
    result(scenario, (arg as ListAllWorkspacesParams | undefined)?.includeRetired === true),
  );
  store.dispatch(
    connectionsListReceived({ connections, activeId: 'local', windowBackendId: 'local' }),
  );
  const stop = store.runSaga(homeAllMachinesSaga);
  // Stands in for the connections saga: records each open request and settles it.
  const opened: Array<[string, string | undefined]> = [];
  (window as unknown as { __openedWorkspaces?: typeof opened }).__openedWorkspaces = opened;
  const stopOpen = store.runSaga(function* () {
    yield* takeEvery(openConnectionRequested, function* (action) {
      opened.push([action.payload[0], action.payload[1]]);
      yield* put(action.success({ status: 'opened', id: action.payload[0] }));
    });
  });
  return () => {
    stop();
    stopOpen();
    store.dispatch(resetHomeWorkspaceView());
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
