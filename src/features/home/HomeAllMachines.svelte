<script lang="ts">
  /**
   * HomeAllMachines — the workspaces of every connected machine in one list,
   * with the same controls, rows, cards, grouping and filters as Home's own
   * list. Each machine is fetched independently by main
   * (`connections:list-all-workspaces`), so an offline or slow machine shows its
   * own notice while the others still list. Selecting a workspace opens it in
   * its machine's window; the actions that belong to this machine (pin,
   * set aside, menus, labels) are left out.
   */
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { EmptyState, ErrorState } from '$lib/components/patterns/screen';
  import { isElectronPlatform } from '$lib/utils/platform-capabilities';
  import { formatConnectionLabel } from '$lib/utils/connection-label';
  import { selectConnections } from '$store/renderer/slices/connections/connections-selectors';
  import { openConnectionRequested } from '$store/renderer/slices/connections/connections-slice';
  import { LOCAL_CONNECTION_ID, type MachineWorkspacesEntry } from '$shared/types/connections';
  import { store } from '$store/renderer/store';
  import { m } from '$shared/paraglide/messages.js';
  import HomeScopeBar, { type HomeScope } from './HomeScopeBar.svelte';
  import HomeWorkspaceBoard from './HomeWorkspaceBoard.svelte';
  import HomeWorkspaceControls from './HomeWorkspaceControls.svelte';
  import HomeWorkspaceList from './HomeWorkspaceList.svelte';
  import HomeWorkspaceSettings from './HomeWorkspaceSettings.svelte';
  import { combineMachineWorkspaces } from './home-all-machines';
  import { buildHomeWorkspaceView, groupHomeRepositories } from './home-workspace-view';
  import type { HomeFilter } from './home-model';
  import { createHomeDoubleClickOpener } from './home-workspace-opening';
  import { selectHomeWorkspaceView } from './home-workspaces-selectors';
  import {
    listAllMachinesWorkspacesRequested,
    updateHomeWorkspaceView,
  } from './home-workspaces-slice';

  /** Only the desktop app's main process can reach other machines. */
  let {
    desktop = isElectronPlatform(),
    scope = $bindable('all'),
  }: { desktop?: boolean; scope?: HomeScope } = $props();

  const connections$ = selectConnections();
  const view$ = selectHomeWorkspaceView();

  let entries = $state<MachineWorkspacesEntry[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let requestSerial = 0;
  /** Machines whose last open attempt failed; cleared on the next attempt. */
  let openErrors = $state<Record<string, boolean>>({});
  let now = $state(Date.now());

  async function load() {
    const serial = ++requestSerial;
    loading = true;
    failed = false;
    try {
      const result = await store.dispatch(listAllMachinesWorkspacesRequested());
      if (serial !== requestSerial) return;
      entries = result.machines;
    } catch {
      if (serial !== requestSerial) return;
      failed = true;
    } finally {
      if (serial === requestSerial) loading = false;
    }
  }

  onMount(() => {
    if (desktop) void load();
    // The date range is relative to now.
    const timer = setInterval(() => (now = Date.now()), 60_000);
    return () => {
      clearInterval(timer);
      requestSerial++;
    };
  });

  const combined = $derived(
    combineMachineWorkspaces($connections$, entries, (connection) =>
      connection.isLocal || connection.id === LOCAL_CONNECTION_ID
        ? m.layout_daemonStatus_localConnection_label()
        : formatConnectionLabel(connection),
    ),
  );
  const model = $derived(
    buildHomeWorkspaceView({
      workspaces: combined.workspaces,
      repositoryGroups: groupHomeRepositories(combined.workspaces, [], false),
      view: $view$,
      now,
    }),
  );
  const machineLabel = (workspace: { id: string }) => combined.refs.get(workspace.id)?.machineLabel;
  const labelOf = (id: string) => $connections$.find((connection) => connection.id === id);

  function updateView(changes: Parameters<typeof updateHomeWorkspaceView>[0]) {
    store.dispatch(updateHomeWorkspaceView(changes));
  }

  /** Open (or focus) the machine's own window and show the workspace there. */
  async function openWorkspace(key: string | null) {
    const ref = key ? combined.refs.get(key) : undefined;
    if (!ref) return;
    openErrors = { ...openErrors, [ref.machineId]: false };
    try {
      const result = await store.dispatch(openConnectionRequested(ref.machineId, ref.workspaceId));
      if (result.status !== 'opened') openErrors = { ...openErrors, [ref.machineId]: true };
    } catch {
      openErrors = { ...openErrors, [ref.machineId]: true };
    }
  }

  // Selecting opens straight away: there is no preview pane for another machine.
  const doubleClick = createHomeDoubleClickOpener(() => {});

  function unavailableText(machine: (typeof combined.unavailable)[number]) {
    if (machine.reason === 'not-connected')
      return m.home_allMachines_notConnected({ machine: machine.label });
    if (machine.reason === 'timeout') return m.home_allMachines_timeout({ machine: machine.label });
    return m.home_allMachines_failed({ machine: machine.label });
  }
  const openFailed = $derived(Object.entries(openErrors).filter(([, hasError]) => hasError));
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  {#if !desktop}
    <HomeScopeBar bind:scope children={noControls} />
    <EmptyState class="flex-1" emphasis="prominent">
      {#snippet title()}<h2>{m.home_allMachines_desktopOnly_title()}</h2>{/snippet}
      {#snippet description()}<p>{m.home_allMachines_desktopOnly_description()}</p>{/snippet}
    </EmptyState>
  {:else}
    <HomeScopeBar bind:scope children={controls} />
    {#if failed}
      <ErrorState retryLabel={m.home_retry()} onRetry={() => void load()}>
        {#snippet message()}{m.home_allMachines_loadFailed()}{/snippet}
      </ErrorState>
    {:else}
      {#if combined.unavailable.length > 0 || openFailed.length > 0}
        <div
          class="shrink-0 px-6 pb-2"
          role="group"
          aria-label={m.home_allMachines_notices_label()}
        >
          {#each combined.unavailable as machine (machine.id)}
            <div class="flex items-center justify-between gap-3 py-1" role="status">
              <span class="type-caption text-muted-foreground">{unavailableText(machine)}</span>
              <Button variant="outline" size="sm" disabled={loading} onclick={() => void load()}
                >{m.home_retry()}</Button
              >
            </div>
          {/each}
          {#each openFailed as [machineId] (machineId)}
            <p class="py-1 type-caption text-danger" role="alert">
              {m.home_allMachines_openFailed({
                machine: labelOf(machineId)?.label ?? machineId,
              })}
            </p>
          {/each}
        </div>
      {/if}
      {#if $connections$.length === 0}
        <EmptyState class="flex-1" emphasis="prominent">
          {#snippet title()}<h2>{m.home_allMachines_empty()}</h2>{/snippet}
        </EmptyState>
      {:else if model.filtered.length === 0}
        <EmptyState class="flex-1" emphasis="prominent">
          {#snippet title()}<h2>
              {combined.workspaces.length === 0
                ? m.home_allMachines_noWorkspaces()
                : m.home_no_matches()}
            </h2>{/snippet}
          {#snippet description()}
            {#if combined.workspaces.length > 0}<p>{m.home_no_matches_description()}</p>{/if}
          {/snippet}
          {#snippet actions()}
            {#if combined.workspaces.length > 0}
              <Button
                variant="outline"
                onclick={() => updateView({ query: '', filter: 'all', updatedWithin: 'all' })}
                >{m.home_clear_filters()}</Button
              >
            {/if}
          {/snippet}
        </EmptyState>
      {:else if $view$.view === 'board'}
        <HomeWorkspaceBoard
          workspaces={model.filtered}
          groups={model.boardGroups}
          selectedIds={[]}
          onselect={(key) => void openWorkspace(key)}
          ontoggleselect={() => {}}
          onrangeselect={() => {}}
          onopen={(key) => void openWorkspace(key)}
          {doubleClick}
          archived={$view$.filter === 'archived'}
          {machineLabel}
        />
      {:else}
        <HomeWorkspaceList
          workspaces={model.filtered}
          groups={model.listGroups}
          aside={[]}
          asideExpanded={false}
          pinnedIds={[]}
          selectedIds={[]}
          showRepository={true}
          showRepositoryOwner={true}
          menu={() => []}
          onopen={() => {}}
          onmenu={() => {}}
          onselect={(key) => void openWorkspace(key)}
          ongroupexpanded={(group, expanded) =>
            updateView({ expandedGroups: { ...$view$.expandedGroups, [group]: expanded } })}
          onasideexpanded={() => {}}
          ontoggleaside={() => {}}
          readonly
          {machineLabel}
        />
      {/if}
    {/if}
  {/if}
</div>

{#snippet noControls()}{/snippet}

{#snippet controls()}
  <HomeWorkspaceControls
    query={$view$.query}
    filter={$view$.filter}
    view={$view$.view}
    filters={model.filters}
    onquery={(query) => updateView({ query })}
    onfilter={(filter: HomeFilter) => updateView({ filter })}
    onview={(view) => updateView({ view })}
    settings={workspaceSettings}
  />
  <Button variant="outline" size="sm" disabled={loading} onclick={() => void load()}>
    {loading ? m.home_allMachines_refreshing() : m.home_allMachines_refresh()}
  </Button>
{/snippet}

{#snippet workspaceSettings()}
  <HomeWorkspaceSettings view={$view$} onchange={updateView} />
{/snippet}
