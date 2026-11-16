import {
  buildRepoPathLookup,
  groupWorkspacesByRepository,
} from '$lib/components/workspace/utils/workspace-grouping';
import { m } from '$shared/paraglide/messages.js';
import type { Workspace } from '$shared/types';
import { compareHomeActivityDesc, getHomeActivityTime } from './home-activity';
import {
  getHomeTriageGroup,
  homeTriageGroupLabel,
  matchesHomeFilter,
  needsAttention,
  type HomeFilter,
} from './home-model';
import { buildHomeListGroups, type HomeListGroup } from './home-workspace-labels';
import { groupHomeWorkspacesByStatus } from './home-workspace-status-groups';
import type { HomeWorkspacesState } from './home-workspaces-slice';

/**
 * The one place Home decides which workspaces a view shows and how they are
 * ordered and grouped: the date range, status filter, search, sort order and
 * every grouping. Home's own list (This machine) and the combined All machines
 * list both call it, so the two cannot drift apart.
 */

type RepositoryGroup = ReturnType<typeof groupWorkspacesByRepository>[number];
type KnownRepos = Parameters<typeof groupWorkspacesByRepository>[0]['knownRepos'];

/** Repositories of `workspaces`, most recently active first. */
export function groupHomeRepositories(
  workspaces: readonly Workspace[],
  knownRepos: KnownRepos,
  includeKnownRepos: boolean,
): RepositoryGroup[] {
  return groupWorkspacesByRepository({
    workspaces: [...workspaces],
    knownRepos,
    repoPathLookup: buildRepoPathLookup([...workspaces], knownRepos),
    includeKnownRepos,
  }).sort(
    (a, b) =>
      Math.max(0, ...b.workspaces.map(getHomeActivityTime)) -
        Math.max(0, ...a.workspaces.map(getHomeActivityTime)) || a.label.localeCompare(b.label),
  );
}

const TRIAGE_ORDER = ['needs-you', 'running', 'waiting', 'inactive'] as const;

type ViewState = Pick<
  HomeWorkspacesState,
  'filter' | 'query' | 'updatedWithin' | 'groupBy' | 'expandedGroups'
>;

export interface HomeWorkspaceViewInput {
  /** The workspaces in scope (a repository or organisation selection already applied). */
  workspaces: readonly Workspace[];
  /** Repositories to group by, from {@link groupHomeRepositories}. */
  repositoryGroups: readonly RepositoryGroup[];
  view: ViewState;
  /** The current time, for the updated-within range. */
  now: number;
  /** Pinned, set-aside, labelled and selected work exists only on the connected machine. */
  pinnedIds?: readonly string[];
  asideIds?: ReadonlySet<string>;
  selectedId?: string | null;
  labels?: readonly string[];
  labelsSupported?: boolean;
  pinnedLabel?: string;
}

export interface HomeWorkspaceView {
  /** Matching workspaces in display order, set-aside work excluded. */
  filtered: Workspace[];
  /** Matching set-aside workspaces, most recent first. */
  aside: Workspace[];
  /** Status-filter chips with their counts. */
  filters: { id: HomeFilter; label: string; count: number }[];
  listGroups: HomeListGroup[];
  boardGroups: { id: string; label: string; items: Workspace[] }[] | undefined;
}

export function buildHomeWorkspaceView(input: HomeWorkspaceViewInput): HomeWorkspaceView {
  const { view, now, repositoryGroups } = input;
  const pinnedIds = input.pinnedIds ?? [];
  const asideIds = input.asideIds ?? new Set<string>();
  const selectedId = input.selectedId ?? null;
  const pinned = new Set(pinnedIds);

  const range = view.updatedWithin ?? 'all';
  const dateScoped = input.workspaces.filter((workspace) => {
    if (range === 'all') return true;
    const days = range === 'day' ? 1 : range === 'week' ? 7 : 30;
    const time = getHomeActivityTime(workspace);
    return time > 0 && time <= now && time >= now - days * 86_400_000;
  });

  const filters = (
    [
      { id: 'all', label: m.home_integrations_all() },
      { id: 'attention', label: m.home_filter_attention() },
      { id: 'running', label: m.home_filter_running() },
      { id: 'waiting', label: m.home_filter_waiting() },
    ] as const
  ).map((item) => ({
    ...item,
    count: dateScoped.filter(
      (workspace) => matchesHomeFilter(workspace, item.id) && !asideIds.has(workspace.id),
    ).length,
  }));

  const query = view.query.trim().toLocaleLowerCase();
  const matched = dateScoped
    .filter(
      (workspace) =>
        matchesHomeFilter(workspace, view.filter) &&
        (!query ||
          [
            workspace.title,
            workspace.repositoryName,
            workspace.repositoryOwner,
            workspace.branch,
            workspace.statusMessage,
          ].some((value) => value?.toLocaleLowerCase().includes(query))),
    )
    .sort(
      (a, b) =>
        Number(pinned.has(b.id)) - Number(pinned.has(a.id)) ||
        Number(needsAttention(b)) - Number(needsAttention(a)) ||
        compareHomeActivityDesc(a, b),
    );
  // Archived is its own view; set-aside work has a separate collection.
  const filtered =
    view.filter === 'archived'
      ? matched
      : matched.filter((workspace) => !asideIds.has(workspace.id));
  const aside =
    view.filter === 'archived'
      ? []
      : matched.filter((workspace) => asideIds.has(workspace.id)).sort(compareHomeActivityDesc);

  const repositorySections = repositoryGroups.flatMap((repo) => {
    const items = filtered.filter((workspace) =>
      repo.workspaces.some((candidate) => candidate.id === workspace.id),
    );
    return items.length ? [{ id: repo.key, label: repo.label, items }] : [];
  });
  const statusGroups = groupHomeWorkspacesByStatus(filtered);
  // Grouping is only meaningful on the unfiltered list; a status filter already
  // names the group, and archived rows have no live triage state.
  const triageGroups =
    view.filter === 'all' && view.groupBy === 'status'
      ? TRIAGE_ORDER.flatMap((id) => {
          const items = filtered.filter((workspace) => {
            const group = getHomeTriageGroup(workspace);
            return (
              (group === 'blocked'
                ? 'needs-you'
                : group === 'done' || group === 'idle'
                  ? 'inactive'
                  : group) === id
            );
          });
          return items.length ? [{ id, label: homeTriageGroupLabel(id), items }] : [];
        })
      : [];

  const listGroups = buildHomeListGroups({
    groupBy: view.groupBy,
    filter: view.filter,
    baseGroups:
      view.groupBy === 'repository'
        ? repositorySections
        : view.groupBy === 'workspace-status'
          ? statusGroups
          : triageGroups,
    workspaces: filtered,
    pinnedIds,
    labels: input.labels ?? [],
    labelsSupported: input.labelsSupported ?? false,
    pinnedLabel: input.pinnedLabel ?? '',
    expandedGroups: view.expandedGroups,
    selectedId,
  });
  const boardGroups =
    view.groupBy === 'repository'
      ? repositorySections
      : view.groupBy === 'none'
        ? [{ id: 'all', label: m.home_filter_all(), items: filtered }]
        : undefined;
  return { filtered, aside, filters, listGroups, boardGroups };
}
