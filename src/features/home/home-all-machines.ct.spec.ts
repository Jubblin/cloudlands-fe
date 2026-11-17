import type { Page } from '@playwright/test';
import { test, expect } from '../../test/ct-test';
import Preview from './home-all-machines.preview.svelte';

const scene = (state: 'mixed' | 'all-empty' | 'web') => ({
  hooksConfig: { previewScene: { scene: 'home-all-machines', state } },
});

/** Workspace rows and cards both carry the machine-qualified id. */
const rows = (page: Page) => page.locator('[data-home-workspace]');
const opened = (page: Page) => () =>
  page.evaluate(
    () =>
      (window as unknown as { __openedWorkspaces: Array<[string, string | undefined]> })
        .__openedWorkspaces,
  );

test('lists every machine in one grouped list, tagging each row with its machine', async ({
  mount,
  page,
}, testInfo) => {
  await mount(Preview, scene('mixed'));
  await expect(rows(page)).toHaveCount(4);
  // Two machines reuse the workspace id "amber-forest": both stay visible as separate rows.
  await expect(page.getByText('Add dark mode support')).toBeVisible();
  await expect(page.getByText('Draft release notes')).toBeVisible();
  await expect(page.locator('[data-home-machine]')).toHaveText([
    'Mac Studio',
    'This machine',
    'This machine',
    'Mac Studio',
  ]);
  // Grouped like Home's list: needs you, then running, then done & idle.
  await expect(page.locator('[data-home-group]')).toHaveText([
    'Needs you',
    'Running',
    'Done & idle',
  ]);
  await page.screenshot({ path: testInfo.outputPath('home-all-machines-list.png') });
});

test('machines that did not answer get their own notice and the others still list', async ({
  mount,
  page,
}) => {
  await mount(Preview, scene('mixed'));
  await expect(page.getByText('Build server took too long to answer.')).toBeVisible();
  await expect(page.getByText(/Travel laptop isn't connected/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(2);
  await expect(rows(page)).toHaveCount(4);
});

test('uses the same filters and search as This machine', async ({ mount, page }) => {
  await mount(Preview, scene('mixed'));
  const statusFilters = page.getByRole('group', { name: 'Status' });
  await statusFilters.getByRole('button', { name: /^Running/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByText('Fix login bug')).toBeVisible();

  await statusFilters.getByRole('button', { name: /^All/ }).click();
  await page.getByPlaceholder('Search workspaces…').fill('cloudlands');
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByText('Refactor sidebar')).toBeVisible();

  await page.getByPlaceholder('Search workspaces…').fill('no such workspace');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText('No matching workspaces')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(rows(page)).toHaveCount(4);
});

test('the Archived chip also lists archived and retired workspaces from every machine', async ({
  mount,
  page,
}) => {
  await mount(Preview, scene('mixed'));
  await expect(rows(page)).toHaveCount(4);
  await expect(page.getByText('Old spike')).toHaveCount(0);

  await page
    .getByRole('group', { name: 'Status' })
    .getByRole('button', { name: /^Archived/ })
    .click();
  // The retired workspace is only fetched once the chip is on.
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByText('Old spike')).toBeVisible();
  await expect(page.getByText('Purged experiment')).toBeVisible();
  await expect(page.locator('[data-home-machine]')).toHaveText(['This machine', 'Mac Studio']);
});

test('shows the same board as This machine, tagged with machines', async ({
  mount,
  page,
}, testInfo) => {
  await mount(Preview, scene('mixed'));
  await page.getByRole('button', { name: 'Board view' }).click();
  await expect(rows(page)).toHaveCount(4);
  await expect(page.locator('[data-home-machine]')).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath('home-all-machines-board.png') });
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(rows(page)).toHaveCount(4);
});

test('rows of other machines have no pin, set-aside or menu actions', async ({ mount, page }) => {
  await mount(Preview, scene('mixed'));
  await expect(rows(page)).toHaveCount(4);
  await expect(page.locator('[data-home-set-aside-action]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Workspace actions' })).toHaveCount(0);
});

test('selecting a workspace, by click or keyboard, opens it on its own machine', async ({
  mount,
  page,
}) => {
  await mount(Preview, scene('mixed'));
  await page.locator('[data-home-workspace="studio::amber-forest"]').click();
  await expect.poll(opened(page)).toEqual([['studio', 'amber-forest']]);

  await page
    .getByRole('option')
    .filter({ has: page.locator('[data-home-workspace="local::amber-forest"]') })
    .focus();
  await page.keyboard.press('Enter');
  await expect.poll(opened(page)).toEqual([
    ['studio', 'amber-forest'],
    ['local', 'amber-forest'],
  ]);

  await page.getByRole('button', { name: 'Board view' }).click();
  await page.locator('[data-home-workspace="studio::quiet-harbor"]').click();
  await expect.poll(opened(page)).toEqual([
    ['studio', 'amber-forest'],
    ['local', 'amber-forest'],
    ['studio', 'quiet-harbor'],
  ]);
});

test('refresh is keyboard reachable with a visible focus ring', async ({ mount, page }) => {
  await mount(Preview, scene('mixed'));
  const refresh = page.getByRole('button', { name: 'Refresh' });
  await expect(refresh).toBeEnabled();
  await refresh.focus();
  await expect(refresh).toBeFocused();
  const ring = await refresh.evaluate((el) => {
    const style = getComputedStyle(el);
    return `${style.outlineStyle}|${style.boxShadow}`;
  });
  expect(ring).not.toBe('none|none');
});

test('stays within the viewport at narrow width', async ({ mount, page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await mount(Preview, scene('mixed'));
  // The controls wrap onto a second line instead of scrolling sideways out of reach.
  await expect(page.getByRole('button', { name: 'Board view' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByPlaceholder('Search workspaces…')).toBeInViewport({ ratio: 1 });
  const title = page.getByText('Fix login bug');
  await expect(title).toBeVisible();
  // A short title keeps its full text next to the machine pill on a phone-width list.
  expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('home-all-machines-narrow.png') });
});

test('says so when the connected machines have no workspaces', async ({ mount, page }) => {
  await mount(Preview, scene('all-empty'));
  await expect(page.getByText('No workspaces on your connected machines.')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
});

test('the web build explains it needs the desktop app and lists nothing', async ({
  mount,
  page,
}) => {
  await mount(Preview, scene('web'));
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Refresh' })).toHaveCount(0);
});
