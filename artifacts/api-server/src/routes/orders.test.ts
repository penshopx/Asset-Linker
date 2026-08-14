/**
 * API tests for order routes.
 *
 * All Supabase calls are mocked — no real network or DB connections are made.
 * Tests cover:
 *   1. POST /api/konfirmasi-pesanan uses the atomic `create_order_idempotent`
 *      RPC and never writes directly to status_history.
 *   2. PATCH /admin/orders/:id/status never writes directly to status_history.
 *   3. GET /api/pesanan/:id includes the history array returned by the DB.
 *   4. GET /api/pesanan/:id returns 500 when the history query fails.
 *   5. GET /api/pesanan/:id returns 404 when the order is not found.
 *   6. DB-backed idempotency via the RPC:
 *      a. Duplicate key (within TTL) → 200 with existing order_id.
 *      b. Expired key (> 10 min) → 201 with a fresh order_id.
 *      c. First request (no key in DB) → 201 with new order_id.
 *      d. Cross-process race (23505 on key insert) → retry succeeds → 200.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: null } }),
      }),
    },
  },
}));

// ── Mailer mock ───────────────────────────────────────────────────────────────
vi.mock('../lib/mailer', () => ({
  sendOrderNotification: vi.fn().mockResolvedValue(undefined),
  sendBuyerConfirmation: vi.fn().mockResolvedValue(undefined),
  sendStatusUpdate: vi.fn().mockResolvedValue(undefined),
}));

// Import app AFTER mocks are registered.
const { default: app } = await import('../app');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const FAKE_ORDER = {
  id: 'order-uuid-123',
  nama_perusahaan: 'PT Test',
  nama_pic: 'Budi',
  email: 'budi@test.com',
  whatsapp: '08123456789',
  produk: 'Layanan A',
  catatan: null,
  status: 'baru',
  bukti_url: null,
  bukti_filename: null,
  buyer_email_sent: false,
  buyer_email_error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const FAKE_HISTORY = [
  { status: 'baru', changed_at: new Date().toISOString() },
];

/** RPC result rows for a brand-new order (is_duplicate = false). */
function rpcNewOrder(orderId = FAKE_ORDER.id) {
  return { data: [{ order_id: orderId, is_duplicate: false }], error: null };
}

/** RPC result rows for a duplicate order (is_duplicate = true). */
function rpcDuplicate(orderId = FAKE_ORDER.id) {
  return { data: [{ order_id: orderId, is_duplicate: true }], error: null };
}

/**
 * Build a chainable Supabase query stub that resolves to `resolveWith`.
 * Chaining methods (.select, .eq, .order, etc.) return the same stub.
 * .single() and .maybeSingle() return a Promise resolving to `resolveWith`.
 * Awaiting the stub itself (for list queries) also resolves to `resolveWith`.
 */
function buildQueryStub(resolveWith: { data?: unknown; error?: unknown }) {
  const stub: Record<string, unknown> = {};
  const chain = () => stub;
  stub['select'] = chain;
  stub['insert'] = chain;
  stub['update'] = chain;
  stub['upsert'] = chain;
  stub['delete'] = chain;
  stub['eq'] = chain;
  stub['gte'] = chain;
  stub['order'] = chain;
  stub['maybeSingle'] = vi.fn().mockResolvedValue(resolveWith);
  stub['single'] = vi.fn().mockResolvedValue(resolveWith);
  Object.defineProperty(stub, 'then', {
    value: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolveWith).then(resolve),
  });
  return stub;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/pesanan/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns order data with the history array when both queries succeed', async () => {
    mockFrom
      .mockReturnValueOnce(buildQueryStub({ data: { ...FAKE_ORDER }, error: null }))
      .mockReturnValueOnce(buildQueryStub({ data: FAKE_HISTORY, error: null }));

    const res = await request(app).get('/api/pesanan/order-uuid-123');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('order-uuid-123');
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].status).toBe('baru');
  });

  it('returns 500 when the history query fails — does not silently return []', async () => {
    mockFrom
      .mockReturnValueOnce(buildQueryStub({ data: { ...FAKE_ORDER }, error: null }))
      .mockReturnValueOnce(buildQueryStub({ data: null, error: { message: 'DB error' } }));

    const res = await request(app).get('/api/pesanan/order-uuid-123');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/riwayat status/i);
  });

  it('returns 404 when the order is not found', async () => {
    mockFrom
      .mockReturnValueOnce(buildQueryStub({ data: null, error: null }))
      .mockReturnValueOnce(buildQueryStub({ data: [], error: null }));

    const res = await request(app).get('/api/pesanan/nonexistent');

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/orders/:id/status — no direct status_history writes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT write directly to the status_history table (trigger handles it)', async () => {
    mockFrom.mockReturnValue(
      buildQueryStub({ data: { ...FAKE_ORDER, status: 'diproses' }, error: null })
    );

    await request(app)
      .patch('/api/admin/orders/order-uuid-123/status')
      .set('x-admin-passcode', process.env['ADMIN_PASSCODE'] ?? 'test-passcode')
      .send({ status: 'diproses' });

    const directTableWrites = mockFrom.mock.calls.filter(
      ([table]: [string]) => table === 'status_history'
    );
    expect(directTableWrites).toHaveLength(0);
  });

  it('returns 400 for an invalid status value', async () => {
    const res = await request(app)
      .patch('/api/admin/orders/order-uuid-123/status')
      .set('x-admin-passcode', process.env['ADMIN_PASSCODE'] ?? 'test-passcode')
      .send({ status: 'invalid-status' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/konfirmasi-pesanan — no direct status_history writes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the create_order_idempotent RPC and does NOT write to status_history directly', async () => {
    // Order creation goes through the RPC (not from('orders').insert).
    // The only from() calls that should happen are for email tracking (orders.update).
    mockRpc.mockResolvedValue(rpcNewOrder());
    mockFrom.mockReturnValue(buildQueryStub({ data: null, error: null }));

    await request(app)
      .post('/api/konfirmasi-pesanan')
      .field('nama_perusahaan', 'PT Test')
      .field('nama_pic', 'Budi')
      .field('email', 'budi@test.com')
      .field('whatsapp', '08123456789')
      .field('produk', 'Layanan A');

    // RPC must have been called once
    expect(mockRpc).toHaveBeenCalledWith(
      'create_order_idempotent',
      expect.objectContaining({ p_nama_perusahaan: 'PT Test' })
    );

    // No direct writes to status_history
    const directTableWrites = mockFrom.mock.calls.filter(
      ([table]: [string]) => table === 'status_history'
    );
    expect(directTableWrites).toHaveLength(0);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/konfirmasi-pesanan')
      .field('nama_perusahaan', 'PT Test');
    // missing nama_pic, email, whatsapp, produk

    expect(res.status).toBe(400);
  });
});

// ── DB-backed idempotency tests ───────────────────────────────────────────────
// The SECURITY DEFINER Postgres function `create_order_idempotent` owns the
// idempotency logic.  The RPC mock simulates all paths the DB function can take.

describe('POST /api/konfirmasi-pesanan — DB-backed idempotency via RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default from() stub for async email-tracking calls that run in background
    mockFrom.mockReturnValue(buildQueryStub({ data: null, error: null }));
  });

  it('returns the existing order (200) when the RPC reports is_duplicate=true — simulates post-restart replay', async () => {
    // The DB function found a non-expired key and returned the existing order.
    mockRpc.mockResolvedValue(rpcDuplicate(FAKE_ORDER.id));

    const res = await request(app)
      .post('/api/konfirmasi-pesanan')
      .set('x-idempotency-key', 'test-key-restart-001')
      .field('nama_perusahaan', 'PT Test')
      .field('nama_pic', 'Budi')
      .field('email', 'budi@test.com')
      .field('whatsapp', '08123456789')
      .field('produk', 'Layanan A');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.order_id).toBe(FAKE_ORDER.id);

    // RPC called exactly once; no emails triggered for a duplicate.
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('creates a fresh order (201) when the RPC reports is_duplicate=false — expired key is cleaned up inside the DB function', async () => {
    // The DB function deleted the expired key and created a new order atomically.
    const FRESH_ORDER_ID = 'fresh-order-uuid-456';
    mockRpc.mockResolvedValue(rpcNewOrder(FRESH_ORDER_ID));

    const res = await request(app)
      .post('/api/konfirmasi-pesanan')
      .set('x-idempotency-key', 'test-key-expired-001')
      .field('nama_perusahaan', 'PT Test')
      .field('nama_pic', 'Budi')
      .field('email', 'budi@test.com')
      .field('whatsapp', '08123456789')
      .field('produk', 'Layanan A');

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.order_id).toBe(FRESH_ORDER_ID);
  });

  it('creates a new order (201) when there is no existing key in the DB (first request)', async () => {
    mockRpc.mockResolvedValue(rpcNewOrder());

    const res = await request(app)
      .post('/api/konfirmasi-pesanan')
      .set('x-idempotency-key', 'test-key-new-001')
      .field('nama_perusahaan', 'PT Test')
      .field('nama_pic', 'Budi')
      .field('email', 'budi@test.com')
      .field('whatsapp', '08123456789')
      .field('produk', 'Layanan A');

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.order_id).toBe(FAKE_ORDER.id);
  });

  it('resolves a cross-process race: retries on 23505 and returns the winner (200)', async () => {
    // First RPC call: the key insert inside the DB function raises a unique_violation
    // which rolls back the entire transaction (order + key). The app retries.
    // Second RPC call: winner's key is now in the table; DB function returns duplicate.
    const WINNER_ID = 'winner-order-uuid-789';
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key' } })
      .mockResolvedValueOnce(rpcDuplicate(WINNER_ID));

    const res = await request(app)
      .post('/api/konfirmasi-pesanan')
      .set('x-idempotency-key', 'test-key-race-001')
      .field('nama_perusahaan', 'PT Test')
      .field('nama_pic', 'Budi')
      .field('email', 'budi@test.com')
      .field('whatsapp', '08123456789')
      .field('produk', 'Layanan A');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.order_id).toBe(WINNER_ID);

    // The race-recovery retry must have fired (2 RPC calls total).
    expect(mockRpc).toHaveBeenCalledTimes(2);

    // No emails sent for a duplicate.
    const { sendOrderNotification, sendBuyerConfirmation } = await import('../lib/mailer');
    // Give background promises a tick to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(sendOrderNotification).not.toHaveBeenCalled();
    expect(sendBuyerConfirmation).not.toHaveBeenCalled();
  });

  it('returns 500 when the RPC fails with a non-race error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'DB unavailable' } });

    const res = await request(app)
      .post('/api/konfirmasi-pesanan')
      .set('x-idempotency-key', 'test-key-dberr-001')
      .field('nama_perusahaan', 'PT Test')
      .field('nama_pic', 'Budi')
      .field('email', 'budi@test.com')
      .field('whatsapp', '08123456789')
      .field('produk', 'Layanan A');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/gagal/i);
  });
});
