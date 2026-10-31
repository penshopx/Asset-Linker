import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { OrderStatusActions } from './OrderStatusActions';
import CekPesanan from '@/pages/CekPesanan';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer;
const orderId = 'order/id ?&';

afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function renderActions(share: unknown, base = '/') {
  vi.stubEnv('BASE_URL', base);
  vi.stubGlobal('window', { location: { origin: 'https://example.test' } });
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { share, clipboard: { writeText } });
  await act(async () => {
    renderer = TestRenderer.create(<OrderStatusActions orderId={orderId} />);
  });
  return { buttons: renderer.root.findAllByType('button'), writeText };
}

describe('order status sharing', () => {
  it.each(['/', '/apps/lkut/'])('shares the encoded absolute link at base %s and keeps copy available', async base => {
    const share = vi.fn().mockResolvedValue(undefined);
    const { buttons, writeText } = await renderActions(share, base);
    expect(buttons).toHaveLength(2);
    expect(buttons[0].props.type).toBe('button');
    await act(async () => buttons[0].props.onClick());
    const url = `https://example.test${base}cek-pesanan?id=order%2Fid%20%3F%26`;
    expect(share).toHaveBeenCalledWith({ title: 'Status Pesanan', url });
    await act(async () => buttons[1].props.onClick());
    expect(writeText).toHaveBeenCalledWith(url);
  });

  it('keeps copy available when native sharing is unavailable', async () => {
    const { buttons, writeText } = await renderActions(undefined);
    expect(buttons).toHaveLength(1);
    await act(async () => buttons[0].props.onClick());
    expect(writeText).toHaveBeenCalledOnce();
  });

  it('does not report cancellation as an error and allows another attempt', async () => {
    const share = vi.fn().mockRejectedValue({ name: 'AbortError' });
    const { buttons } = await renderActions(share);
    await act(async () => buttons[0].props.onClick());
    expect(buttons[0].props.disabled).toBe(false);
    expect(renderer.root.findAllByProps({ role: 'status' }).map(node => node.children.join('')))
      .toEqual(['', '']);
    await act(async () => buttons[0].props.onClick());
    expect(share).toHaveBeenCalledTimes(2);
  });

  it('explains real failures and clears the error when retrying', async () => {
    const share = vi.fn().mockRejectedValue(new Error('Not allowed'));
    const { buttons } = await renderActions(share);
    await act(async () => buttons[0].props.onClick());
    expect(renderer.root.findAllByProps({ role: 'status' })[0].children.join(''))
      .toContain('Gunakan tombol Salin tautan');
    share.mockResolvedValue(undefined);
    await act(async () => buttons[0].props.onClick());
    expect(renderer.root.findAllByProps({ role: 'status' })[0].children).toHaveLength(0);
  });

  it('disables only sharing while the native menu is pending', async () => {
    let finish!: () => void;
    const share = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const { buttons } = await renderActions(share);
    let pending!: Promise<void>;
    await act(async () => { pending = buttons[0].props.onClick(); });
    expect(buttons[0].props.disabled).toBe(true);
    expect(buttons[1].props.disabled).toBe(false);
    await act(async () => { finish(); await pending; });
    expect(buttons[0].props.disabled).toBe(false);
  });

  it('shares the displayed order, not unsubmitted input or a previously viewed order', async () => {
    vi.stubEnv('BASE_URL', '/apps/lkut/');
    vi.stubGlobal('window', {
      location: { origin: 'https://example.test', search: '?id=first-order' },
    });
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    vi.stubGlobal('sessionStorage', undefined);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        id: decodeURIComponent(url.split('/').pop()!),
        status: 'baru',
        produk: 'Paket SKK',
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
        history: [],
      }),
    })));
    await act(async () => { renderer = TestRenderer.create(<CekPesanan />); });
    const shareButton = () => renderer.root.findAllByType('button')
      .find(button => button.children.includes('Bagikan'))!;
    await act(async () => {
      renderer.root.findByType('input').props.onChange({ target: { value: 'second/order' } });
    });
    await act(async () => shareButton().props.onClick());
    expect(share).toHaveBeenLastCalledWith({
      title: 'Status Pesanan',
      url: 'https://example.test/apps/lkut/cek-pesanan?id=first-order',
    });
    await act(async () => {
      await renderer.root.findByType('form').props.onSubmit({ preventDefault() {} });
    });
    await act(async () => shareButton().props.onClick());
    expect(share).toHaveBeenLastCalledWith({
      title: 'Status Pesanan',
      url: 'https://example.test/apps/lkut/cek-pesanan?id=second%2Forder',
    });
  });
});
