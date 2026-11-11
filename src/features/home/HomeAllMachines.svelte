<script lang="ts">
  /**
   * HomeAllMachines — read-only list of the workspaces on every connected
   * machine, grouped per machine. Each machine is fetched independently by
   * main (`connections:list-all-workspaces`), so an offline or slow machine
   * shows its own error with a retry instead of hiding the others.
   */
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import RelativeTime from '$lib/components/ui/RelativeTime.svelte';
  import { EmptyState, ErrorState } from '$lib/components/patterns/screen';
  import { formatConnectionLabel } from '$lib/utils/connection-label';
  import {
    selectConnections,
    selectCurrentConnectionId,
  } from '$store/renderer/slices/connections/connections-selectors';
  import {
    CONNECTION_CHANNELS,
    LOCAL_CONNECTION_ID,
    type ListAllWorkspacesResult,
    type MachineWorkspacesEntry,
  } from '$shared/types/connections';
  import { formatInteger } from '$lib/i18n/format';
  import { m } from '$shared/paraglide/messages.js';
  import { activityTime, buildMachineSections, statusText } from './home-all-machines';

  const connections$ = selectConnections();
  const currentId$ = selectCurrentConnectionId();

  let entries = $state<MachineWorkspacesEntry[]>([]);
  let loading = $state(true);
  let failed = $state(false);
  let requestSerial = 0;

  async function load() {
    const serial = ++requestSerial;
    loading = true;
    failed = false;
    try {
      const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
      if (!api) throw new Error('electronAPI is not available');
      const result = (await api.invoke(
        CONNECTION_CHANNELS.LIST_ALL_WORKSPACES,
      )) as ListAllWorkspacesResult;
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
    void load();
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
  <div class="flex shrink-0 items-center justify-between gap-3 px-6 py-2">
    <p class="type-caption text-muted-foreground">{m.home_allMachines_readOnly()}</p>
    <Button variant="outline" size="sm" disabled={loading} onclick={() => void load()}>
      {loading ? m.home_allMachines_refreshing() : m.home_allMachines_refresh()}
    </Button>
  </div>

  {#if failed}
    <ErrorState retryLabel={m.home_retry()} onRetry={() => void load()}>
      {#snippet message()}{m.home_allMachines_failed()}{/snippet}
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
              <span class="type-caption rounded-full border border-border px-2 text-muted-foreground"
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
            <p class="type-caption py-3 text-muted-foreground">{m.home_allMachines_noWorkspaces()}</p>
          {:else if section.workspaces}
            <ul class="m-0 list-none p-0">
              {#each section.workspaces as workspace (workspace.id)}
                <li class="flex items-center gap-3 border-b border-border py-2 last:border-b-0">
                  <div class="min-w-0 flex-1">
                    <p class="type-body truncate font-medium">{workspace.title}</p>
                    <p class="type-caption truncate text-muted-foreground">
                      {[workspace.repositoryName, workspace.branch].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span class="type-caption shrink-0 text-muted-foreground">
                    {workspace.activity === 'agent_running'
                      ? m.home_allMachines_agentRunning()
                      : statusText(workspace.displayStatus ?? workspace.status)}
                  </span>
                  <span class="type-caption w-16 shrink-0 text-right text-muted-foreground">
                    {#if activityTime(workspace) > 0}<RelativeTime
                        date={activityTime(workspace)}
                        compact
                      />{:else}<span aria-hidden="true">—</span>{/if}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
    </div>
  {/if}
</div>
