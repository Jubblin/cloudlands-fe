import { describe, expect, it } from 'vitest';
import type { ConnectionRecord, MachineWorkspacesEntry } from '$shared/types/connections';
import { buildMachineSections, statusText } from './home-all-machines';

const conn = (id: string, isLocal = false) => ({ id, isLocal }) as unknown as ConnectionRecord;
const ws = (id: string, lastActivityAt: string | null) => ({
  id,
  title: id,
  branch: 'b',
  status: 'active',
  lastActivityAt,
});

describe('buildMachineSections', () => {
  const connections = [conn('local', true), conn('zeta'), conn('alpha')];
  const entries: MachineWorkspacesEntry[] = [
    { id: 'local', ok: true, workspaces: [ws('old', '2026-01-01T00:00:00Z'), ws('new', '2026-02-01T00:00:00Z')] },
    { id: 'zeta', ok: false, reason: 'timeout' },
  ];
  const sections = buildMachineSections(connections, entries, 'zeta', (c) => c.id);

  it('puts the current window first, then local, then alphabetical', () => {
    expect(sections.map((s) => s.id)).toEqual(['zeta', 'local', 'alpha']);
  });
  it('sorts workspaces newest first', () => {
    expect(sections[1].workspaces?.map((w) => w.id)).toEqual(['new', 'old']);
  });
  it('keeps failed and unreported machines visible with a reason', () => {
    expect(sections[0]).toMatchObject({ workspaces: null, failure: 'timeout', isCurrent: true });
    expect(sections[2]).toMatchObject({ workspaces: null, failure: 'not-connected' });
  });
});

describe('statusText', () => {
  it('humanises daemon tokens', () => {
    expect(statusText('in_progress')).toBe('in progress');
  });
});
