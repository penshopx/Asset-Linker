import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import AdminPesanan from './AdminPesanan';

// AccountGate has separate session-boundary tests. Render the real dashboard,
// rows and timeline with an authorized account fixture here.
vi.mock('@/components/AdminAccount', () => ({
  default: ({ children }: any) => children(
    { id: 'user_rina', name: 'Admin Rina', email: 'rina@example.test' }, vi.fn(),
  ),
  adminFetch: (url: string, init?: RequestInit) => fetch(url, init),
}));
const LIST_URL = '/api/admin/orders';
const ORIGINAL_ERROR = 'Provider temporarily unavailable';
const LATEST_ERROR = 'Gagal mengirim email: Mailbox rejected';

function order(id: string, extra = {}) {
  return {
    id,
    created_at: '2026-10-01T10:00:00.000Z',
    nama_perusahaan: `PT ${id}`,
    nama_pic: 'Test Buyer',
    email: `${id}@example.test`,
    whatsapp: '62000000000',
    produk: 'Paket SKK',
    status: 'baru',
    buyer_email_sent: false,
    buyer_email_error: null as string | null,
    ...extra,
  };
}

type OrderFixture = ReturnType<typeof order>;
let serverOrders: OrderFixture[];
let renderer: ReactTestRenderer | undefined;
let retryResponse: { status: number; body: object };
let fetchMock: ReturnType<typeof vi.fn>;

function text(node: ReactTestInstance | string): string {
  return typeof node === 'string' ? node : node.children.map(text).join('');
}

function button(label: string) {
  const matches = renderer!.root.findAllByType('button').filter(node => text(node).trim() === label);
  expect(matches, `button "${label}"`).toHaveLength(1);
  return matches[0];
}

async function click(label: string) {
  await act(async () => {
    await button(label).props.onClick();
  });
}

async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(<AdminPesanan />);
  });
}

function visibleText() {
  return text(renderer!.root);
}

function expectFailureCount(count: number) {
  const banners = renderer!.root.findAll(
    node => node.props.role === 'alert' && node.props['aria-live'] === 'polite',
  );
  expect(banners).toHaveLength(count > 0 ? 1 : 0);
  if (count > 0) {
    expect(text(banners[0])).toContain(`${count} email konfirmasi perlu perhatian`);
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('sessionStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
  vi.stubGlobal('window', {
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
  });
  serverOrders = [
    order('failed', { buyer_email_error: ORIGINAL_ERROR }),
    order('sent', { buyer_email_sent: true }),
    order('pending'),
    order('legacy', { buyer_email_sent: undefined }),
    order('status-only', { status_email_error: 'Status email failed' }),
  ];
  retryResponse = { status: 200, body: { ok: true, message: 'Email konfirmasi berhasil dikirim ulang.' } };
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    expect(init?.headers).toBeUndefined();
    if (url === LIST_URL && !init?.method) {
      // Use a wire-like snapshot so mutation of server fixtures cannot update
      // the UI without a real list request or the page's mutation handler.
      const snapshot = structuredClone(serverOrders);
      return { ok: true, status: 200, json: async () => snapshot };
    }
    if (url === `${LIST_URL}/failed` && !init?.method) {
      const snapshot = structuredClone(serverOrders.find(current => current.id === 'failed'));
      return { ok: true, status: 200, json: async () => ({ ...snapshot, history: [] }) };
    }
    if (url === `${LIST_URL}/failed/retry-buyer-email` && init?.method === 'POST') {
      const { status, body } = retryResponse;
      serverOrders = serverOrders.map(current => current.id === 'failed' && status !== 409
        ? {
            ...current,
            buyer_email_sent: status === 200,
            // The backend persists the provider error; the HTTP error includes
            // the "Gagal mengirim email" prefix.
            buyer_email_error: status === 200 ? null : 'Mailbox rejected',
          }
        : current);
      return { ok: status === 200, status, json: async () => body };
    }
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer!.unmount());
    renderer = undefined;
  }
  vi.unstubAllGlobals();
});

describe('admin buyer email warning integration', () => {
  it('counts only confirmed buyer email failures and filters the actual order rows', async () => {
    await mount();
    expectFailureCount(1);
    for (const current of serverOrders) {
      expect(visibleText()).toContain(current.nama_perusahaan);
    }

    await click('Tampilkan yang gagal');

    expect(visibleText()).toContain('PT failed');
    expect(visibleText()).toContain(ORIGINAL_ERROR);
    expect(renderer!.root.findAllByType('button').filter(node => text(node) === 'Coba kirim ulang')).toHaveLength(1);
    for (const id of ['sent', 'pending', 'legacy', 'status-only']) {
      expect(visibleText()).not.toContain(`PT ${id}`);
    }
    await click('Tampilkan semua pesanan');
    expect(visibleText()).toContain('PT pending');
    expectFailureCount(1);
  });

  it('immediately removes a successful retry from the count and filtered list, including after refresh', async () => {
    serverOrders.push(order('other-failed', { buyer_email_error: 'Another failure' }));
    await mount();
    expectFailureCount(2);
    await click('Tampilkan yang gagal');
    // Select the failed order's row rather than retrying the other failure.
    const retries = renderer!.root.findAllByType('button')
      .filter(node => text(node).trim() === 'Coba kirim ulang');
    expect(retries).toHaveLength(2);
    const retry = retries[0]; // First fixture is the order whose endpoint is mocked.
    await act(async () => { await retry.props.onClick(); });

    expect(fetchMock).toHaveBeenCalledWith(`${LIST_URL}/failed/retry-buyer-email`, {
      method: 'POST',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // No refresh needed for the update.
    expectFailureCount(1);
    expect(visibleText()).not.toContain('PT failed');
    expect(visibleText()).toContain('PT other-failed');

    await click('Refresh');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expectFailureCount(1);
    expect(visibleText()).not.toContain('PT failed');
    expect(visibleText()).not.toContain('PT sent'); // Failure-only filter survives refresh.
    expect(visibleText()).toContain('PT other-failed');
    await click('Tampilkan semua pesanan');
    expect(visibleText()).toContain('PT failed');
    expect(visibleText()).not.toContain(ORIGINAL_ERROR);
  });

  it('keeps a failed retry visible with the latest error and reloads the persisted failure', async () => {
    retryResponse = { status: 502, body: { error: LATEST_ERROR } };
    await mount();
    await click('Tampilkan yang gagal');
    await click('Coba kirim ulang');

    expectFailureCount(1);
    expect(visibleText()).toContain('PT failed');
    expect(visibleText()).toContain(LATEST_ERROR);
    expect(visibleText()).not.toContain(ORIGINAL_ERROR);
    expect(button('Coba kirim ulang').props.disabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await click('Refresh');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expectFailureCount(1);
    expect(visibleText()).toContain('PT failed');
    expect(visibleText()).toContain('Mailbox rejected');
    expect(visibleText()).not.toContain(ORIGINAL_ERROR);
    expect(visibleText()).not.toContain('PT pending');
  });

  it('reconciles an already-sent conflict and clears the last warning and failure filter', async () => {
    const conflict = 'Email konfirmasi sudah berhasil terkirim sebelumnya.';
    retryResponse = { status: 409, body: { error: conflict } };
    await mount();
    await click('Tampilkan yang gagal');
    serverOrders = serverOrders.map(current => current.id === 'failed'
      ? { ...current, buyer_email_sent: true, buyer_email_error: null }
      : current);

    await click('Coba kirim ulang');

    expect(fetchMock).toHaveBeenLastCalledWith(`${LIST_URL}/failed`, undefined);
    expectFailureCount(0);
    expect(visibleText()).not.toContain(ORIGINAL_ERROR);
    expect(visibleText()).not.toContain(conflict);
    expect(visibleText()).not.toContain('Email konfirmasi pembeli gagal terkirim');
    for (const current of serverOrders) {
      expect(visibleText()).toContain(current.nama_perusahaan);
    }
    await click('Refresh');
    expectFailureCount(0);
    expect(visibleText()).not.toContain(ORIGINAL_ERROR);
  });

  it('removes an already-sent conflict from the failure-only list while other failures remain', async () => {
    serverOrders.push(order('other-failed', { buyer_email_error: 'Another failure' }));
    retryResponse = { status: 409, body: { error: 'Already sent' } };
    await mount();
    await click('Tampilkan yang gagal');
    serverOrders[0] = { ...serverOrders[0], buyer_email_sent: true, buyer_email_error: null };
    const retry = renderer!.root.findAllByType('button')
      .find(node => text(node).trim() === 'Coba kirim ulang')!;
    await act(async () => { await retry.props.onClick(); });

    expectFailureCount(1);
    expect(visibleText()).not.toContain('PT failed');
    expect(visibleText()).not.toContain('PT pending');
    expect(visibleText()).toContain('PT other-failed');
    await click('Tampilkan semua pesanan');
    expect(visibleText()).toContain('PT failed');
    expect(visibleText()).not.toContain(ORIGINAL_ERROR);
    expect(visibleText()).not.toContain('Already sent');
  });

  it.each([ORIGINAL_ERROR, null])(
    'reconciles an in-progress conflict using the persisted error (%s), not the conflict message',
    async persistedError => {
      const conflict = 'Email sedang dicoba ulang oleh proses lain. Muat ulang dan coba lagi.';
      retryResponse = { status: 409, body: { error: conflict } };
      await mount();
      await click('Tampilkan yang gagal');
      serverOrders[0] = { ...serverOrders[0], buyer_email_error: persistedError };

      await click('Coba kirim ulang');

      expect(fetchMock).toHaveBeenLastCalledWith(`${LIST_URL}/failed`, undefined);
      expectFailureCount(persistedError ? 1 : 0);
      expect(visibleText()).toContain('PT failed');
      expect(visibleText()).not.toContain(conflict);
      if (persistedError) {
        expect(visibleText()).toContain(persistedError);
        expect(visibleText()).not.toContain('PT pending');
        expect(button('Coba kirim ulang').props.disabled).toBe(false);
      } else {
        expect(visibleText()).not.toContain(ORIGINAL_ERROR);
        expect(visibleText()).toContain('PT pending');
        expect(visibleText()).not.toContain('Email konfirmasi pembeli gagal terkirim');
      }
    },
  );

  it.each(['network', 'server', 'invalid'])(
    'preserves the last known failure when reconciliation fails (%s) without recording a false delivery error',
    async failure => {
      const conflict = 'Email konfirmasi sudah berhasil terkirim sebelumnya.';
      retryResponse = { status: 409, body: { error: conflict } };
      const defaultFetch = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => unknown;
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === `${LIST_URL}/failed`) {
          if (failure === 'network') throw new Error('Network unavailable');
          return {
            ok: failure !== 'server',
            status: failure === 'server' ? 500 : 200,
            json: async () => ({ error: 'Unavailable' }),
          };
        }
        return defaultFetch(url, init);
      });
      await mount();
      await click('Tampilkan yang gagal');
      await click('Coba kirim ulang');

      expectFailureCount(1);
      expect(visibleText()).toContain(ORIGINAL_ERROR);
      expect(visibleText()).not.toContain(conflict);
      expect(visibleText()).toContain('Status email terbaru belum dapat dimuat. Klik Refresh');
      expect(visibleText()).not.toContain('PT pending');
      expect(button('Coba kirim ulang').props.disabled).toBe(false);
    },
  );

  it('clears the last failure warning immediately and does not resurrect it on refresh or remount', async () => {
    await mount();
    await click('Tampilkan yang gagal');
    await click('Coba kirim ulang');

    expectFailureCount(0);
    expect(visibleText()).not.toContain(ORIGINAL_ERROR);
    for (const current of serverOrders) {
      expect(visibleText()).toContain(current.nama_perusahaan);
    }
    expect(visibleText()).not.toContain('Belum ada pesanan');
    expect(fetchMock).toHaveBeenCalledTimes(2); // All rows return without reloading.
    await click('Refresh');
    expectFailureCount(0);
    for (const current of serverOrders) {
      expect(visibleText()).toContain(current.nama_perusahaan);
    }

    await act(async () => renderer!.unmount());
    renderer = undefined;
    await mount();
    expectFailureCount(0);
    expect(visibleText()).toContain('PT failed');
    expect(visibleText()).not.toContain(ORIGINAL_ERROR);
    expect(renderer!.root.findAllByType('button').filter(node => text(node) === 'Coba kirim ulang')).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('leaves the email failure filter after Refresh resolves the last failure, preserving the status filter', async () => {
    serverOrders.push(order('in-progress', { status: 'diproses', buyer_email_sent: true }));
    await mount();
    await click('5Baru');
    await click('Tampilkan yang gagal');
    expect(visibleText()).toContain('PT failed');
    expect(visibleText()).not.toContain('PT pending');

    serverOrders = serverOrders.map(current => current.id === 'failed'
      ? { ...current, buyer_email_sent: true, buyer_email_error: null }
      : current);
    await click('Refresh');

    expectFailureCount(0);
    for (const current of serverOrders.filter(current => current.status === 'baru')) {
      expect(visibleText()).toContain(current.nama_perusahaan);
    }
    expect(visibleText()).not.toContain('PT in-progress');
    expect(visibleText()).not.toContain('Belum ada pesanan');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('admin identity and timeline', () => {
  it('shows the verified account without editable identity fields', async () => {
    await mount();
    expect(visibleText()).toContain('Admin Rina · rina@example.test (akun terverifikasi)');
    expect(renderer!.root.findAllByProps({ type: 'password' })).toHaveLength(0);
    expect(button('Keluar / Ganti admin')).toBeTruthy();
  });

  it('sends only status and refreshes the open timeline after a change', async () => {
    const current = order('one');
    serverOrders = [current];
    let changed = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === LIST_URL) return { ok: true, json: async () => serverOrders };
      if (init?.method === 'PATCH') {
        expect(JSON.parse(init.body as string)).toEqual({ status: 'diproses' });
        expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
        changed = true;
        return { ok: true, json: async () => ({ ...current, status: 'diproses' }) };
      }
      return {
        ok: true,
        json: async () => ({
          ...current,
          history: [
            { status: 'baru', changed_at: current.created_at, changed_by: null },
            ...(changed ? [{ status: 'diproses', changed_at: current.created_at, changed_by: 'Admin Rina', changed_by_verified: true }] : []),
          ],
        }),
      };
    });
    await mount();
    await click('Lihat riwayat status');
    expect(visibleText()).toContain('Identitas belum tercatat');
    await act(async () => {
      await renderer!.root.findByType('select').props.onChange({ target: { value: 'diproses' } });
    });
    expect(visibleText()).toContain('Oleh: Admin Rina');
    expect(visibleText()).toContain('Identitas belum tercatat');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('shows a rejected status change instead of claiming it was saved', async () => {
    serverOrders = [order('one')];
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'PATCH'
      ? { ok: false, json: async () => ({ error: 'Nama admin wajib diisi.' }) }
      : { ok: true, json: async () => serverOrders });
    await mount();
    await act(async () => {
      await renderer!.root.findByType('select').props.onChange({ target: { value: 'diproses' } });
    });
    expect(visibleText()).toContain('Nama admin wajib diisi.');
    expect(renderer!.root.findByType('select').props.value).toBe('baru');
  });
});
