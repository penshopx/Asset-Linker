import { afterEach, describe, expect, it } from 'vitest';
import {
  clearOrderSummary,
  clearOrderSummaryAfterSuccessfulLookup,
  getOrderStatusUrl,
  ORDER_SUMMARY_STORAGE_KEY,
  readOrderSummary,
  readOrderSummaryForId,
  saveOrderSummary,
} from './orderSummaryStorage';

const originalSessionStorage = globalThis.sessionStorage;

function createSessionStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
}

afterEach(() => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: originalSessionStorage,
  });
});

describe('order summary session storage', () => {
  it('saves and reads the order ID and product', () => {
    const storage = createSessionStorage();
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });

    expect(saveOrderSummary({ orderId: ' order-123 ', produk: ' Paket SKK ' })).toBe(true);
    expect(storage.getItem(ORDER_SUMMARY_STORAGE_KEY)).toBe(
      JSON.stringify({ orderId: ' order-123 ', produk: ' Paket SKK ' }),
    );
    expect(readOrderSummary()).toEqual({ orderId: 'order-123', produk: 'Paket SKK' });
  });

  it('ignores malformed or incomplete values', () => {
    const storage = createSessionStorage();
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
    storage.setItem(ORDER_SUMMARY_STORAGE_KEY, JSON.stringify({ orderId: 'order-123' }));

    expect(readOrderSummary()).toBeNull();
    expect(saveOrderSummary({ orderId: '', produk: 'Paket SKK' })).toBe(false);
  });

  it('clears the saved summary after it has been consumed', () => {
    const storage = createSessionStorage();
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
    saveOrderSummary({ orderId: 'order-123', produk: 'Paket SKK' });

    clearOrderSummary();

    expect(readOrderSummary()).toBeNull();
  });

  it('builds the status destination used to restore a summary after reload', () => {
    expect(getOrderStatusUrl('/simulator/', 'order/id 123')).toBe(
      '/simulator/cek-pesanan?id=order%2Fid%20123',
    );
  });

  it('keeps the summary across reloads and unavailable status lookups', () => {
    const storage = createSessionStorage();
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
    saveOrderSummary({ orderId: 'order-123', produk: 'Paket SKK' });

    // A new page instance can restore the same summary from sessionStorage.
    expect(readOrderSummaryForId('order-123')).toEqual({
      orderId: 'order-123',
      produk: 'Paket SKK',
    });
    // A failed/not-found lookup must not consume the fallback, so another reload
    // can still restore it.
    expect(readOrderSummaryForId('order-123')).toEqual({
      orderId: 'order-123',
      produk: 'Paket SKK',
    });
  });

  it('clears the fallback only after the matching order is loaded successfully', () => {
    const storage = createSessionStorage();
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
    saveOrderSummary({ orderId: 'order-123', produk: 'Paket SKK' });

    clearOrderSummaryAfterSuccessfulLookup('another-order');
    expect(readOrderSummary()).not.toBeNull();

    clearOrderSummaryAfterSuccessfulLookup('order-123');
    expect(readOrderSummary()).toBeNull();
  });
});