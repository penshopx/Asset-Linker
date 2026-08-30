export const ORDER_SUMMARY_STORAGE_KEY = 'lkut:last-order-summary';

export interface OrderSummary {
  orderId: string;
  produk: string;
}

export function getOrderStatusUrl(basePath: string, orderId: string): string {
  const normalizedBasePath = basePath.replace(/\/$/, '');
  return `${normalizedBasePath}/cek-pesanan?id=${encodeURIComponent(orderId)}`;
}

function getSessionStorage(): Storage | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage;
}

function isOrderSummary(value: unknown): value is OrderSummary {
  if (!value || typeof value !== 'object') return false;

  const summary = value as Partial<OrderSummary>;
  return (
    typeof summary.orderId === 'string' &&
    summary.orderId.trim().length > 0 &&
    typeof summary.produk === 'string' &&
    summary.produk.trim().length > 0
  );
}

export function saveOrderSummary(summary: OrderSummary): boolean {
  if (!isOrderSummary(summary)) return false;

  try {
    const storage = getSessionStorage();
    if (!storage) return false;
    storage.setItem(ORDER_SUMMARY_STORAGE_KEY, JSON.stringify(summary));
    return true;
  } catch {
    // Storage can be unavailable or full; the order itself has already succeeded.
    return false;
  }
}

export function readOrderSummary(): OrderSummary | null {
  try {
    const raw = getSessionStorage()?.getItem(ORDER_SUMMARY_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    return isOrderSummary(parsed)
      ? { orderId: parsed.orderId.trim(), produk: parsed.produk.trim() }
      : null;
  } catch {
    return null;
  }
}

export function readOrderSummaryForId(orderId: string): OrderSummary | null {
  const summary = readOrderSummary();
  return summary?.orderId === orderId ? summary : null;
}

export function clearOrderSummary(): void {
  try {
    getSessionStorage()?.removeItem(ORDER_SUMMARY_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures; sessionStorage is only a convenience fallback.
  }
}

export function clearOrderSummaryAfterSuccessfulLookup(orderId: string): void {
  if (readOrderSummaryForId(orderId)) clearOrderSummary();
}