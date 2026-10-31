import { test, expect, type Locator, type Page } from '@playwright/test';

const orderId = 'browser/order ?&';
const fixture = {
  id: orderId,
  status: 'diproses',
  produk: 'LKUT Uji Browser',
  nama_perusahaan: 'Perusahaan Fiktif Uji Keyboard',
  nama_pic: 'PIC Uji Browser',
  created_at: '2026-01-01T08:00:00Z',
  updated_at: '2026-01-02T08:00:00Z',
  history: [],
};
const successMessage = 'Tautan status pesanan berhasil disalin.';
const failureMessage = 'Tautan gagal disalin otomatis. Salin secara manual dari kolom di bawah.';
const apiActivity = new WeakMap<Page, { reads: number; unexpected: string[] }>();

async function tabTo(page: Page, target: Locator) {
  // Never use focus() or click(): the control must be reachable in tab order.
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(element => element === document.activeElement)) return;
  }
  throw new Error('Tombol salin tidak dapat dicapai dengan Tab');
}

async function expectVisibleKeyboardFocus(target: Locator) {
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();
  expect(await target.evaluate(element => element.matches(':focus-visible'))).toBe(true);
  // Check rendered CSS, not just the presence of Tailwind class names.
  const focusStyle = await target.evaluate(element => {
    const style = getComputedStyle(element);
    // Computed colors normalize percentages (54.6% -> 0.546); custom
    // properties preserve their authored text, so normalize via a real color.
    const probe = document.createElement('span');
    probe.style.color = style.getPropertyValue('--color-blue-600').trim();
    document.body.append(probe);
    const blue = getComputedStyle(probe).color;
    probe.remove();
    return {
      shadow: style.boxShadow,
      blue,
    };
  });
  expect(focusStyle.blue).not.toBe('');
  expect(focusStyle.shadow).not.toBe('none');
  expect(focusStyle.shadow).toContain(focusStyle.blue);
  // A 2px ring plus the button's 2px offset produces a 4px outer spread.
  expect(focusStyle.shadow).toMatch(/ [24]px/);
}

test.beforeEach(async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const activity = { reads: 0, unexpected: [] as string[] };
  apiActivity.set(page, activity);
  // Fail closed: no API request can reach real order data or cause writes.
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.includes('/api/')) return route.continue();
    const expectedPath = new URL(`api/pesanan/${encodeURIComponent(orderId)}`, baseURL).pathname;
    if (request.method() === 'GET' && url.pathname === expectedPath) {
      activity.reads++;
      return route.fulfill({ json: fixture });
    }
    activity.unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await page.goto(`cek-pesanan?id=${encodeURIComponent(orderId)}`);
  await expect(page.getByText(fixture.nama_perusahaan, { exact: true })).toBeVisible();
  expect(activity.reads).toBe(1);
  // Avoid passing because an earlier test left the expected URL on the clipboard.
  await page.evaluate(() => navigator.clipboard.writeText('not-an-order-link'));
});

test.afterEach(async ({ page }) => {
  const activity = apiActivity.get(page)!;
  expect(activity.unexpected, 'Only the intercepted fixture may access the API').toEqual([]);
  expect(activity.reads, 'Copying must not submit the lookup form again').toBe(1);
});

for (const key of ['Enter', 'Space']) {
  test(`clipboard diizinkan: Tab lalu ${key}, fokus dan pengumuman berhasil`, async ({ page }) => {
    const button = page.getByRole('button', { name: 'Salin tautan status pesanan', exact: true });
    const announcement = button.locator('..').getByRole('status');
    await expect(announcement).toHaveAttribute('aria-live', 'polite');
    await expect(announcement).toHaveAttribute('aria-atomic', 'true');
    await expect(announcement).toBeEmpty();
    await tabTo(page, button);
    await expectVisibleKeyboardFocus(button);
    await page.keyboard.press(key);
    await expect(announcement).toHaveText(successMessage);
    await expect(button).toBeEnabled();
    await expect(button).toBeFocused();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
    await expect(page.getByRole('textbox', { name: 'Tautan status pesanan', exact: true })).toHaveCount(0);
  });

  test(`clipboard ditolak: ${key}, pengumuman gagal, salin manual dan coba lagi`, async ({ page, context }) => {
    const expectedUrl = page.url();
    const cdp = await context.newCDPSession(page);
    const { targetInfo } = await cdp.send('Target.getTargetInfo');
    // Real Chromium permission denial; navigator.clipboard is never mocked.
    for (const allowWithoutSanitization of [false, true]) {
      await cdp.send('Browser.setPermission', {
        origin: new URL(expectedUrl).origin,
        browserContextId: targetInfo.browserContextId,
        permission: { name: 'clipboard-write', allowWithoutSanitization },
        setting: 'denied',
      });
    }
    expect(await page.evaluate(async () =>
      (await navigator.permissions.query({ name: 'clipboard-write' as PermissionName })).state,
    )).toBe('denied');
    const button = page.getByRole('button', { name: 'Salin tautan status pesanan', exact: true });
    const announcement = button.locator('..').getByRole('status');
    await expect(announcement).toHaveAttribute('aria-live', 'polite');
    await expect(announcement).toHaveAttribute('aria-atomic', 'true');
    await tabTo(page, button);
    await expectVisibleKeyboardFocus(button);
    await page.keyboard.press(key);
    await expect(announcement).toHaveText(failureMessage);
    await expect(button).toBeEnabled();

    const manualLink = page.getByRole('textbox', { name: 'Tautan status pesanan', exact: true });
    await expect(manualLink).toHaveValue(expectedUrl);
    await expect(manualLink).toHaveAttribute('readonly', '');
    await page.keyboard.press('Tab');
    await expectVisibleKeyboardFocus(manualLink);
    expect(await manualLink.evaluate((element: HTMLInputElement) => ({
      start: element.selectionStart, end: element.selectionEnd,
    }))).toEqual({ start: 0, end: expectedUrl.length });

    // Native keyboard copy/paste must still work when the async API is denied.
    await page.keyboard.press('ControlOrMeta+c');
    const search = page.getByPlaceholder('Masukkan Order ID…');
    await search.fill('');
    await search.press('ControlOrMeta+v');
    await expect(search).toHaveValue(expectedUrl);

    // A successful retry must replace the failure and remove the fallback.
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(expectedUrl).origin,
    });
    await tabTo(page, button);
    await page.keyboard.press(key);
    await expect(announcement).toHaveText(successMessage);
    await expect(manualLink).toHaveCount(0);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expectedUrl);
    await cdp.detach();
  });
}
