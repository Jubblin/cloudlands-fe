import { call, takeLatest, put, cancelled, type SagaGenerator } from 'typed-redux-saga';
import { IPC_CHANNELS } from '$shared/ipc-registry';
import type { ListAllWorkspacesResult } from '$shared/types/connections';
import { parseListAllWorkspacesResult } from './home-all-machines';
import { listAllMachinesWorkspacesRequested } from './home-workspaces-slice';

async function invokeListAllWorkspaces(): Promise<ListAllWorkspacesResult> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (!api) throw new Error('electronAPI is not available');
  return parseListAllWorkspacesResult(
    await api.invoke(IPC_CHANNELS.CONNECTIONS.LIST_ALL_WORKSPACES),
  );
}

function* listAllMachines(
  action: ReturnType<typeof listAllMachinesWorkspacesRequested>,
): SagaGenerator<void> {
  let settled = false;
  try {
    const result = yield* call(invokeListAllWorkspaces);
    yield* put(action.success(result));
    settled = true;
  } catch (error) {
    yield* put(action.failure(error instanceof Error ? error : new Error(String(error))));
    settled = true;
  } finally {
    if (!settled && (yield* cancelled()))
      yield* put(action.failure(new Error('Machine workspace list was cancelled')));
  }
}

export function* homeAllMachinesSaga(): SagaGenerator<void> {
  yield* takeLatest(listAllMachinesWorkspacesRequested, listAllMachines);
}
