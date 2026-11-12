<script lang="ts">
  /**
   * HomeAllMachines — read-only list of the workspaces on every connected
   * machine, grouped per machine. Each machine is fetched independently by
   * main (`connections:list-all-workspaces`), so an offline or slow machine
   * shows its own error with a retry instead of hiding the others.
   */
  import { onMount } from 'svelte';
  import { isElectronPlatform } from '$lib/utils/platform-capabilities';
  import { Button } from '$lib/components/ui/button';
  import { ListRow, ListView } from '$lib/components/patterns/collection';
  import RelativeTime from '$lib/components/ui/RelativeTime.svelte';
  import { EmptyState, ErrorState } from '$lib/components/patterns/screen';
  import { formatConnectionLabel } from '$lib/utils/connection-label';
  import {
    selectConnections,
    selectCurrentConnectionId,
  } from '$store/renderer/slices/connections/connections-selectors';
  import {
    LOCAL_CONNECTION_ID,
    type MachineWorkspaceSummary,
    type MachineWorkspacesEntry,
  } from '$shared/types/connections';
  import { store } from '$store/renderer/store';
  import { listAllMachinesWorkspacesRequested } from './home-workspaces-slice';
  import { openConnectionRequested } from '$store/renderer/slices/connections/connections-slice';
  import { formatInteger } from '$lib/i18n/format';
  import { m } from '$shared/paraglide/messages.js';
  import {
    activityTime,
    buildMachineSections,
    statusText,
    type MachineSection,
  } from './home-all-machines';

  /** Only the desktop app's main process can reach other machines. */
  let { desktop = isElectronPlatform() }: { desktop?: boolean } = $props();

  const connections$ = selectConnections();
  const currentId$ = selectCurrentConnectionId();

  let entries = $state<MachineWorkspacesEntry[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let requestSerial = 0;
  /** Machines whose last open attempt failed; cleared on the next attempt. */
  let openErrors = $state<Record<string, boolean>>({});

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

  /** Open (or focus) the machine's own window and show the workspace there. */
  async function openWorkspace(section: MachineSection, workspace: MachineWorkspaceSummary) {
    openErrors = { ...openErrors, [section.id]: false };
    try {
      const result = await store.dispatch(openConnectionRequested(section.id, workspace.id));
      if (result.status !== 'opened') openErrors = { ...openErrors, [section.id]: true };
    } catch {
      openErrors = { ...openErrors, [section.id]: true };
    }
  }

  onMount(() => {
    if (desktop) void load();
    return () => {
      requestSerial++;
    };
  });

  const sections = $derived(
    buildMachineSections($connections$, entries, $currentId$, (connection) =>
      connection.isLocal || connection.id === LOCAL_CONNECTION_ID
        ? m.layout_daemonStatus_localConnection_label()
        : formatConnectionLabel(connection),
    ),
  );

  function failureText(reason: NonNullable<(typeof sections)[number]['failure']>) {
    if (reason === 'not-connected') return m.home_allMachines_notConnected();
    if (reason === 'timeout') return m.home_allMachines_timeout();
    return m.home_allMachines_failed();
  }
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  {#if !desktop}
    <EmptyState class="flex-1" emphasis="prominent">
      {#snippet title()}<h2>{m.home_allMachines_desktopOnly_title()}</h2>{/snippet}
      {#snippet description()}<p>{m.home_allMachines_desktopOnly_description()}</p>{/snippet}
    </EmptyState>
  {:else}
    <div class="flex shrink-0 items-center justify-between gap-3 px-6 py-2">
      <p class="type-caption text-muted-foreground">{m.home_allMachines_caption()}</p>
      <Button variant="outline" size="sm" disabled={loading} onclick={() => void load()}>
        {loading ? m.home_allMachines_refreshing() : m.home_allMachines_refresh()}
      </Button>
    </div>
    {#if failed}
      <ErrorState retryLabel={m.home_retry()} onRetry={() => void load()}>
        {#snippet message()}{m.home_allMachines_loadFailed()}{/snippet}
      </ErrorState>
    {:else if sections.length === 0}
      <EmptyState class="flex-1" emphasis="prominent">
        {#snippet title()}<h2>{m.home_allMachines_empty()}</h2>{/snippet}
      </EmptyState>
    {:else}
      <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-6" aria-busy={loading}>
        {#each sections as section (section.id)}
          <section class="mt-4 first:mt-0" aria-labelledby={`all-machines-${section.id}`}>
            <h2
              id={`all-machines-${section.id}`}
              class="type-body flex items-center gap-2 border-b border-border pb-2 font-medium"
            >
              <span class="truncate">{section.label}</span>
              {#if section.isCurrent}
                <span
                  class="type-caption rounded-full border border-border px-2 text-muted-foreground"
                  >{m.home_allMachines_thisWindow()}</span
                >
              {/if}
              {#if section.workspaces}
                <span class="type-caption ml-auto text-muted-foreground"
                  >{formatInteger(section.workspaces.length)}</span
                >
              {/if}
            </h2>
            {#if section.failure}
              <div class="flex items-center justify-between gap-3 py-3" role="status">
                <p class="type-caption text-muted-foreground">{failureText(section.failure)}</p>
                <Button variant="outline" size="sm" disabled={loading} onclick={() => void load()}
                  >{m.home_retry()}</Button
                >
              </div>
            {:else if section.workspaces && section.workspaces.length === 0}
              <p class="type-caption py-3 text-muted-foreground">
                {m.home_allMachines_noWorkspaces()}
              </p>
            {:else if section.workspaces}
              <ListView
                items={section.workspaces}
                getKey={(workspace) => workspace.id}
                getText={(workspace) => workspace.title}
                ariaLabel={section.label}
                virtualize={false}
                selectable="single"
                selectedKeys={[]}
                onActivate={(workspace) => void openWorkspace(section, workspace)}
              >
                {#snippet row({ item: workspace })}
                  <ListRow>
                    {#snippet title()}{workspace.title}{/snippet}
                    {#snippet description()}
                      <span class="block truncate"
                        >{[workspace.repositoryName, workspace.branch]
                          .filter(Boolean)
                          .join(' · ')}</span
                      >
                    {/snippet}
                    {#snippet trailing()}
                      <span>
                        {workspace.activity === 'agent_running'
                          ? m.home_allMachines_agentRunning()
                          : statusText(workspace.displayStatus ?? workspace.status)}
                      </span>
                      <span class="w-16 text-right">
                        {#if activityTime(workspace) > 0}<RelativeTime
                            date={activityTime(workspace)}
                            compact
                          />{:else}<span aria-hidden="true">—</span>{/if}
                      </span>
                    {/snippet}
                  </ListRow>
                {/snippet}
              </ListView>
              {#if openErrors[section.id]}
                <p class="type-caption py-2 text-danger" role="alert">
                  {m.home_allMachines_openFailed({ machine: section.label })}
                </p>
              {/if}
            {/if}
          </section>
        {/each}
      </div>
    {/if}
  {/if}
</div>
