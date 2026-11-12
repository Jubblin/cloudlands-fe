<script module lang="ts">
  import { definePreview } from '$lib/component-catalog/preview-definition';
  import { setupHomeAllMachinesFixture as setup } from '../../test/home-all-machines-preview';
  export const preview = definePreview({
    id: 'home-all-machines',
    title: 'Home all machines',
    defaultState: 'mixed',
    states: {
      mixed: { props: { scenario: 'mixed' }, setup: () => setup('mixed') },
      'all-empty': { props: { scenario: 'all-empty' }, setup: () => setup('all-empty') },
      web: { props: { scenario: 'mixed', desktop: false }, setup: () => setup('mixed') },
    },
    captureReadiness: { selector: 'button:not(:disabled)' },
  });
</script>

<script lang="ts">
  import HomeAllMachines from './HomeAllMachines.svelte';
  let {
    scenario = 'mixed',
    desktop = true,
  }: { scenario?: 'mixed' | 'all-empty'; desktop?: boolean } = $props();
</script>

<div
  class="flex h-[480px] w-full min-w-0 flex-col bg-background text-foreground"
  data-scenario={scenario}
>
  <HomeAllMachines {desktop} />
</div>
