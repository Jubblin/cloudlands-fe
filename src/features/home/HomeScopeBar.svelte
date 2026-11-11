<script lang="ts">
  /**
   * HomeScopeBar — the Workspaces controls row with a This machine / All
   * machines switch. The per-machine controls (search, filters, view) only
   * apply to this machine's list, so they render only in that scope.
   */
  import type { Snippet } from 'svelte';
  import * as ToggleGroup from '$lib/components/ui/toggle-group';
  import { m } from '$shared/paraglide/messages.js';

  export type HomeScope = 'machine' | 'all';
  let { scope = $bindable('machine'), children }: { scope?: HomeScope; children: Snippet } =
    $props();
</script>

<div class="flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto px-6 py-4">
  <ToggleGroup.Root
    type="single"
    variant="outline"
    size="sm"
    aria-label={m.home_scope_label()}
    value={scope}
    onValueChange={(value: string) => {
      if (value === 'machine' || value === 'all') scope = value;
    }}
  >
    <ToggleGroup.Item value="machine">{m.home_scope_thisMachine()}</ToggleGroup.Item>
    <ToggleGroup.Item value="all">{m.home_scope_allMachines()}</ToggleGroup.Item>
  </ToggleGroup.Root>
  {#if scope === 'machine'}{@render children()}{/if}
</div>
