import { normalizeWorkspace } from '$lib/client/live/live-workspaces-client';
import type { Workspace } from '$shared/types';
import { WorkspaceId } from '$shared/types/branded-ids';
import type {
  ConnectionRecord,
  ListAllWorkspacesResult,
  MachineWorkspacesEntry,
} from '$shared/types/connections';

/** Which machine, and which of its workspaces, a combined-list row stands for. */
export interface MachineWorkspaceRef {
  machineId: string;
  machineLabel: string;
  workspaceId: string;
}

/** A machine that could not contribute its workspaces to the combined list. */
export interface UnavailableMachine {
  id: string;
  label: string;
  reason: 'not-connected' | 'timeout' | 'failed';
}

/**
 * Ids only need to be unique across machines, which can reuse the same workspace id.
 * @internal Exported so tests can name a row without repeating the key format.
 */
export function machineWorkspaceKey(machineId: string, workspaceId: string): string {
  return `${machineId}::${workspaceId}`;
}

/** Validate the IPC result: only a main process that fans out serves `machines`. */
export function parseListAllWorkspacesResult(raw: unknown): ListAllWorkspacesResult {
  const machines = (raw as { machines?: unknown } | null | undefined)?.machines;
  if (!Array.isArray(machines)) throw new Error('Unexpected all-machines workspace response');
  return { machines: machines as ListAllWorkspacesResult['machines'] };
}

/**
 * Every machine's workspaces as ordinary `Workspace` records, normalised exactly
 * like the machine this window is connected to, with a machine-qualified id so
 * two machines can never collide. Machines that could not answer (or have no
 * live connection) are listed separately, in connection order.
 */
export function combineMachineWorkspaces(
  connections: readonly ConnectionRecord[],
  entries: readonly MachineWorkspacesEntry[],
  labelFor: (connection: ConnectionRecord) => string,
): {
  workspaces: Workspace[];
  refs: ReadonlyMap<string, MachineWorkspaceRef>;
  unavailable: UnavailableMachine[];
} {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const workspaces: Workspace[] = [];
  const refs = new Map<string, MachineWorkspaceRef>();
  const unavailable: UnavailableMachine[] = [];
  for (const connection of connections) {
    const label = labelFor(connection);
    const entry = byId.get(connection.id);
    if (!entry) {
      unavailable.push({ id: connection.id, label, reason: 'not-connected' });
      continue;
    }
    if (!entry.ok) {
      unavailable.push({ id: connection.id, label, reason: entry.reason });
      continue;
    }
    for (const row of entry.workspaces) {
      let normalized: Workspace;
      try {
        normalized = normalizeWorkspace(row);
      } catch {
        // One malformed row (for example an id outside the workspace id format) must
        // not hide the rest of that machine's workspaces.
        continue;
      }
      // The machine-qualified id is internal to this list, so it skips the workspace-id format check.
      const key = machineWorkspaceKey(connection.id, row.id);
      workspaces.push({ ...normalized, id: WorkspaceId(key) });
      refs.set(key, { machineId: connection.id, machineLabel: label, workspaceId: row.id });
    }
  }
  return { workspaces, refs, unavailable };
}
