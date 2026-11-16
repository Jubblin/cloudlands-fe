import { describe, expect, it } from 'vitest';
import type { ConnectionRecord, MachineWorkspaceRow } from '$shared/types/connections';
import { combineMachineWorkspaces, machineWorkspaceKey } from './home-all-machines';
import { buildHomeWorkspaceView, groupHomeRepositories } from './home-workspace-view';

const NOW = Date.parse('2026-11-11T12:00:00Z');
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

const conn = (id: string) => ({ id, isLocal: false }) as unknown as ConnectionRecord;
const row = (id: string, extra: Record<string, unknown> = {}): MachineWorkspaceRow => ({
  id,
  title: id,
  branch: `branch-${id}`,
  status: 'active',
  createdAt: ago(1),
  ...extra,
});

const view = {
  filter: 'all' as const,
  query: '',
  updatedWithin: 'all' as const,
  groupBy: 'status' as const,
  expandedGroups: {},
};

const { workspaces } = combineMachineWorkspaces(
  [conn('a'), conn('b')],
  [
    {
      id: 'a',
      ok: true,
      workspaces: [
        row('old-idle', {
          createdAt: ago(24 * 40),
          repositoryName: 'alpha',
          repositoryOwner: 'acme',
        }),
        row('busy-run', {
          activity: 'agent_running',
          displayStatus: 'in_progress',
          lastContentActivity: ago(2),
          repositoryName: 'alpha',
          repositoryOwner: 'acme',
        }),
      ],
    },
    {
      id: 'b',
      ok: true,
      workspaces: [
        row('needs-you', {
          displayStatus: 'needs_attention',
          attention: 'review_required',
          lastContentActivity: ago(30),
          repositoryName: 'beta',
          repositoryOwner: 'acme',
        }),
        row('recent-idle', {
          lastContentActivity: ago(5),
          repositoryName: 'beta',
          repositoryOwner: 'acme',
          label: 'Q4',
        }),
      ],
    },
  ],
  (c) => c.id,
);
const id = (machine: string, workspace: string) => machineWorkspaceKey(machine, workspace);
const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);
const build = (overrides: Partial<Parameters<typeof buildHomeWorkspaceView>[0]> = {}) =>
  buildHomeWorkspaceView({
    workspaces,
    repositoryGroups: groupHomeRepositories(workspaces, [], false),
    view,
    now: NOW,
    ...overrides,
  });

describe('buildHomeWorkspaceView', () => {
  it('puts work that needs you first, then the most recent activity', () => {
    expect(ids(build().filtered)).toEqual([
      id('b', 'needs-you'),
      id('a', 'busy-run'),
      id('b', 'recent-idle'),
      id('a', 'old-idle'),
    ]);
  });

  it('groups by activity like Home does, skipping empty groups', () => {
    expect(build().listGroups.map((group) => [group.id, ids(group.items)])).toEqual([
      ['needs-you', [id('b', 'needs-you')]],
      ['running', [id('a', 'busy-run')]],
      ['inactive', [id('b', 'recent-idle'), id('a', 'old-idle')]],
    ]);
  });

  it('counts each status filter over the date-scoped workspaces', () => {
    const counts = Object.fromEntries(build().filters.map((f) => [f.id, f.count]));
    expect(counts).toEqual({ all: 4, attention: 1, running: 1, waiting: 0 });
  });

  it('narrows by status filter, and a status filter needs no activity groups', () => {
    const result = build({ view: { ...view, filter: 'running' } });
    expect(ids(result.filtered)).toEqual([id('a', 'busy-run')]);
    expect(result.listGroups).toEqual([]);
  });

  it('searches title, repository, owner and branch, ignoring case', () => {
    expect(ids(build({ view: { ...view, query: ' BETA ' } }).filtered)).toEqual([
      id('b', 'needs-you'),
      id('b', 'recent-idle'),
    ]);
    expect(ids(build({ view: { ...view, query: 'branch-old-idle' } }).filtered)).toEqual([
      id('a', 'old-idle'),
    ]);
  });

  it('limits to the updated-within range, dropping work older than the range', () => {
    const week = build({ view: { ...view, updatedWithin: 'week' } });
    expect(ids(week.filtered)).toEqual([
      id('b', 'needs-you'),
      id('a', 'busy-run'),
      id('b', 'recent-idle'),
    ]);
  });

  it('groups by repository, and by nothing', () => {
    const byRepo = build({ view: { ...view, groupBy: 'repository' } });
    expect(byRepo.listGroups.map((group) => ids(group.items))).toEqual([
      [id('a', 'busy-run'), id('a', 'old-idle')],
      [id('b', 'needs-you'), id('b', 'recent-idle')],
    ]);
    expect(byRepo.boardGroups?.length).toBe(2);
    const none = build({ view: { ...view, groupBy: 'none' } });
    expect(none.listGroups).toEqual([]);
    expect(none.boardGroups?.map((group) => ids(group.items))).toEqual([ids(none.filtered)]);
  });

  it('honours a collapsed group, unless it holds the selected workspace', () => {
    const collapsed = { ...view, expandedGroups: { running: false } };
    const groups = build({ view: collapsed }).listGroups;
    expect(groups.find((group) => group.id === 'running')?.expanded).toBe(false);
    expect(groups.find((group) => group.id === 'needs-you')?.expanded).toBe(true);
    const withSelection = build({ view: collapsed, selectedId: id('a', 'busy-run') }).listGroups;
    expect(withSelection.find((group) => group.id === 'running')?.expanded).toBe(true);
  });
});

describe('buildHomeWorkspaceView on the connected machine (pinned, set-aside, labels)', () => {
  it('lists pinned work first, in its own group', () => {
    const result = build({
      pinnedIds: [id('a', 'old-idle')],
      pinnedLabel: 'Pinned',
    });
    expect(ids(result.filtered)[0]).toBe(id('a', 'old-idle'));
    expect(result.listGroups[0]).toMatchObject({ id: 'pinned', label: 'Pinned' });
    expect(ids(result.listGroups[0].items)).toEqual([id('a', 'old-idle')]);
    // A pinned row is not repeated in its activity group.
    expect(ids(result.listGroups.flatMap((group) => group.items))).toHaveLength(4);
  });

  it('moves set-aside work to its own collection and out of the counts', () => {
    const result = build({ asideIds: new Set([id('a', 'busy-run')]) });
    expect(ids(result.filtered)).not.toContain(id('a', 'busy-run'));
    expect(ids(result.aside)).toEqual([id('a', 'busy-run')]);
    expect(result.filters.find((f) => f.id === 'running')?.count).toBe(0);
    expect(result.filters.find((f) => f.id === 'all')?.count).toBe(3);
  });

  it('does not split off set-aside work in the archived view', () => {
    const result = build({
      view: { ...view, filter: 'archived' },
      asideIds: new Set([id('a', 'busy-run')]),
    });
    expect(result.aside).toEqual([]);
  });

  it('groups labelled work under its label when the daemon serves labels', () => {
    const withLabels = build({ labels: ['Q4'], labelsSupported: true });
    expect(withLabels.listGroups[0]).toMatchObject({ id: 'label:Q4', label: 'Q4' });
    expect(ids(withLabels.listGroups[0].items)).toEqual([id('b', 'recent-idle')]);
    const without = build({ labels: ['Q4'], labelsSupported: false });
    expect(without.listGroups.map((group) => group.id)).not.toContain('label:Q4');
  });
});
