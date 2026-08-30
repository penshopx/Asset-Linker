import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import Simulator from './Simulator';
import CekPesanan from './CekPesanan';
import {
  ORDER_SUMMARY_STORAGE_KEY,
  readOrderSummary,
  saveOrderSummary,
} from '@/lib/orderSummaryStorage';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div' },
}));

vi.mock('@/components/simulator/StepIndicator', () => ({
  StepIndicator: () => null,
}));

vi.mock('@/components/simulator/steps/Step1Keuangan', () => ({
  Step1Keuangan: () => null,
}));

vi.mock('@/components/simulator/steps/Step2Organisasi', () => ({
  Step2Organisasi: () => null,
}));

vi.mock('@/components/simulator/steps/Step3ProyekStep', () => ({
  Step3ProyekStep: () => null,
}));

vi.mock('@/components/simulator/steps/Step4Hasil', () => ({
  Step4Hasil: () => null,
}));

const originalFetch = globalThis.fetch;
const originalSessionStorage = globalThis.sessionStorage;
const originalWindow = globalThis.window;

function createSessionStorage() {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  return storage;
}

function setBrowser(search = '') {
  const replace = vi.fn();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { replace, search } },
  });
  return { replace };
}

async function renderPage(element: React.ReactElement): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(element);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return renderer!;
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: originalSessionStorage,
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
});

describe('order summary refresh flow', () => {
  it('redirects a refreshed simulator success session to its saved status summary', async () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: createSessionStorage(),
    });
    const { replace } = setBrowser();
    saveOrderSummary({ orderId: 'order/id 123', produk: 'Paket SKK' });

    const renderer = await renderPage(<Simulator />);

    expect(replace).toHaveBeenCalledWith('/cek-pesanan?id=order%2Fid%20123');
    expect(readOrderSummary()).toEqual({
      orderId: 'order/id 123',
      produk: 'Paket SKK',
    });
    renderer.unmount();
  });

  it('restores the fallback again after a failed status lookup and another refresh', async () => {
    const storage = createSessionStorage();
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
    setBrowser('?id=order-123');
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Layanan belum tersedia' }),
      }),
    });
    saveOrderSummary({ orderId: 'order-123', produk: 'Paket SKK' });

    const firstRender = await renderPage(<CekPesanan />);
    expect(JSON.stringify(firstRender.toJSON())).toContain('Paket SKK');
    expect(storage.getItem(ORDER_SUMMARY_STORAGE_KEY)).not.toBeNull();
    firstRender.unmount();

    const refreshedRender = await renderPage(<CekPesanan />);
    expect(JSON.stringify(refreshedRender.toJSON())).toContain('Paket SKK');
    expect(storage.getItem(ORDER_SUMMARY_STORAGE_KEY)).not.toBeNull();
    refreshedRender.unmount();
  });

  it('clears the fallback after the authoritative order loads successfully', async () => {
    const storage = createSessionStorage();
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
    setBrowser('?id=order-123');
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'order-123',
          status: 'baru',
          produk: 'Paket SKK',
          created_at: '2026-08-30T00:00:00.000Z',
          updated_at: '2026-08-30T00:00:00.000Z',
          history: [],
        }),
      }),
    });
    saveOrderSummary({ orderId: 'order-123', produk: 'Paket SKK' });

    const renderer = await renderPage(<CekPesanan />);

    expect(JSON.stringify(renderer.toJSON())).toContain('Status Pesanan');
    expect(storage.getItem(ORDER_SUMMARY_STORAGE_KEY)).toBeNull();
    renderer.unmount();
  });
});