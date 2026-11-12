import { test, expect } from '../../test/ct-test';
import Preview from './home-all-machines.preview.svelte';

const scene = (state: 'mixed' | 'all-empty' | 'web') => ({
  hooksConfig: { previewScene: { scene: 'home-all-machines', state } },
});

test('lists every machine, marks this window, and keeps failures local to their machine', async ({
  mount,
  page,
}, testInfo) => {
  await mount(Preview, scene('mixed'));
  await expect(page.getByRole('heading', { name: /This machine \(local\)/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Mac Studio/ })).toBeVisible();
  await expect(page.getByText('This window')).toHaveCount(1);
  await expect(page.getByText('Fix login bug')).toBeVisible();
  await expect(page.getByText('Agent running')).toBeVisible();
  await expect(page.getByRole('listbox', { name: /This machine \(local\)/ })).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(3);
  await expect(page.getByText('Draft release notes')).toBeVisible();
  await expect(page.getByText('This machine took too long to answer.')).toBeVisible();
  await expect(page.getByText(/Not connected\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('home-all-machines-mixed.png') });
});

test('refresh and retry are keyboard reachable with a visible focus ring', async ({
  mount,
  page,
}) => {
  await mount(Preview, scene('mixed'));
  const refresh = page.getByRole('button', { name: 'Refresh' });
  await expect(refresh).toBeEnabled();
  await page.keyboard.press('Tab');
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
  await expect(page.getByText('Fix login bug')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('home-all-machines-narrow.png') });
});

test('shows an empty line for machines with no workspaces', async ({ mount, page }) => {
  await mount(Preview, scene('all-empty'));
  await expect(page.getByText('No workspaces on this machine.')).toHaveCount(4);
});

test('the web build explains it needs the desktop app and offers no refresh', async ({
  mount,
  page,
}) => {
  await mount(Preview, scene('web'));
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Mac Studio/ })).toHaveCount(0);
});
