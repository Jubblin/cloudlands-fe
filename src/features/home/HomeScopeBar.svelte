<script lang="ts" module>
  export type HomeScope = 'machine' | 'all';
</script>

<script lang="ts">
  /**
   * HomeScopeBar — the Workspaces controls row with a This machine / All
   * machines switch. Each scope supplies its own controls (search, filters,
   * view), which sit beside the switch.
   */
  import type { Snippet } from 'svelte';
  import * as ToggleGroup from '$lib/components/ui/toggle-group';
  import { m } from '$shared/paraglide/messages.js';

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
  {@render children()}
</div>
