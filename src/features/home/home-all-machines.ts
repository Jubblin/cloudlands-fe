import { LOCAL_CONNECTION_ID } from '$shared/types/connections';
import type {
  ConnectionRecord,
  MachineWorkspaceSummary,
  MachineWorkspacesEntry,
} from '$shared/types/connections';

export interface MachineSection {
  id: string;
  label: string;
  isCurrent: boolean;
  /** `null` while the machine's result is unavailable. */
  workspaces: MachineWorkspaceSummary[] | null;
  failure: Extract<MachineWorkspacesEntry, { ok: false }>['reason'] | null;
}

export function activityTime(workspace: MachineWorkspaceSummary): number {
  const time = workspace.lastActivityAt ? Date.parse(workspace.lastActivityAt) : NaN;
  return Number.isFinite(time) ? time : 0;
}

/** Humanise a daemon status token (`in_progress` → `in progress`). */
export function statusText(value: string): string {
  return value.replace(/[_-]+/g, ' ').trim();
}

/**
 * Order machines current → local → alphabetical and workspaces newest first.
 * Machines with no live client still get a section so an offline machine is
 * visible rather than silently missing.
 */
export function buildMachineSections(
  connections: readonly ConnectionRecord[],
  entries: readonly MachineWorkspacesEntry[],
  currentId: string,
  labelFor: (connection: ConnectionRecord) => string,
): MachineSection[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const sections: MachineSection[] = connections.map((connection) => {
    const entry = byId.get(connection.id);
    return {
      id: connection.id,
      label: labelFor(connection),
      isCurrent: connection.id === currentId,
      workspaces: entry?.ok ? [...entry.workspaces].sort((a, b) => activityTime(b) - activityTime(a)) : null,
      failure: entry ? (entry.ok ? null : entry.reason) : 'not-connected',
    };
  });
  const rank = (section: MachineSection) =>
    section.isCurrent ? 0 : section.id === LOCAL_CONNECTION_ID ? 1 : 2;
  return sections.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}
