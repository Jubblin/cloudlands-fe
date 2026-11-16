import { describe, expect, it } from 'vitest';
import { WorkspaceStatus } from '$shared/types';
import type {
  ConnectionRecord,
  MachineWorkspaceRow,
  MachineWorkspacesEntry,
} from '$shared/types/connections';
import {
  combineMachineWorkspaces,
  machineWorkspaceKey,
  parseListAllWorkspacesResult,
} from './home-all-machines';

const NOW = Date.parse('2026-11-11T12:00:00Z');
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

const conn = (id: string, isLocal = false) => ({ id, isLocal }) as unknown as ConnectionRecord;
const row = (id: string, extra: Record<string, unknown> = {}): MachineWorkspaceRow => ({
  id,
  title: id,
  branch: `branch-${id}`,
  status: 'active',
  createdAt: ago(1),
  ...extra,
});

describe('combineMachineWorkspaces', () => {
  const connections = [conn('local', true), conn('studio'), conn('build'), conn('laptop')];
  const entries: MachineWorkspacesEntry[] = [
    { id: 'local', ok: true, workspaces: [row('main-one', { title: 'Local main' })] },
    { id: 'studio', ok: true, workspaces: [row('main-one', { title: 'Studio main' })] },
    { id: 'build', ok: false, reason: 'timeout' },
  ];
  const combined = combineMachineWorkspaces(connections, entries, (c) => c.id.toUpperCase());

  it('keeps two machines that reuse a workspace id apart', () => {
    expect(combined.workspaces.map((w) => [w.id, w.title])).toEqual([
      [machineWorkspaceKey('local', 'main-one'), 'Local main'],
      [machineWorkspaceKey('studio', 'main-one'), 'Studio main'],
    ]);
    expect(new Set(combined.workspaces.map((w) => w.id)).size).toBe(2);
  });

  it('remembers which machine and workspace each row stands for', () => {
    expect(combined.refs.get(machineWorkspaceKey('studio', 'main-one'))).toEqual({
      machineId: 'studio',
      machineLabel: 'STUDIO',
      workspaceId: 'main-one',
    });
  });

  it('normalises rows like the connected machine does (status and defaults)', () => {
    const [first] = combined.workspaces;
    expect(first.status).toBe(WorkspaceStatus.Active);
    expect(first.changesets).toEqual([]);
  });

  it('lists machines that did not answer, in connection order, with why', () => {
    expect(combined.unavailable).toEqual([
      { id: 'build', label: 'BUILD', reason: 'timeout' },
      { id: 'laptop', label: 'LAPTOP', reason: 'not-connected' },
    ]);
  });
});

describe('parseListAllWorkspacesResult', () => {
  it('accepts a result carrying a machines list', () => {
    expect(parseListAllWorkspacesResult({ machines: [] })).toEqual({ machines: [] });
  });
  it.each([undefined, null, {}, { machines: 'x' }, { success: true, data: [] }])(
    'rejects a response without a machines list: %j',
    (raw) => {
      expect(() => parseListAllWorkspacesResult(raw)).toThrow();
    },
  );
});
