import { call, takeLatest, put, cancelled, type SagaGenerator } from 'typed-redux-saga';
import { CONNECTION_CHANNELS, type ListAllWorkspacesResult } from '$shared/types/connections';
import { listAllMachinesWorkspacesRequested } from './home-workspaces-slice';

async function invokeListAllWorkspaces(): Promise<ListAllWorkspacesResult> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (!api) throw new Error('electronAPI is not available');
  return (await api.invoke(CONNECTION_CHANNELS.LIST_ALL_WORKSPACES)) as ListAllWorkspacesResult;
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
