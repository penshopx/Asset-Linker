/**
 * API tests for order routes.
 *
 * All Supabase calls are mocked — no real network or DB connections are made.
 * Tests cover:
 *   1. POST /api/konfirmasi-pesanan uses the atomic `create_order_idempotent`
 *      RPC and never writes directly to status_history.
 *   2. PATCH /admin/orders/:id/status never writes directly to status_history.
 *   3. GET /api/pesanan/:id includes the public order details and history array
 *      returned by the DB.
 *   4. GET /api/pesanan/:id returns history: [] for orders without history.
 *   5. GET /api/pesanan/:id returns history: [] when the migration is missing.
 *   6. GET /api/pesanan/:id returns 500 when the history query fails otherwise.
 *   7. GET /api/pesanan/:id returns 404 when the order is not found.
 *   8. DB-backed idempotency via the RPC:
 *      a. Duplicate key (within TTL) → 200 with existing order_id AND duplicate:true.
 *      b. Expired key (> 10 min) → 201 with a fresh order_id, no duplicate flag.
 *      c. First request (no key in DB) → 201 with new order_id, no duplicate flag.
 *      d. Cross-process race (23505 on key insert) → retry succeeds → 200 with duplicate:true.
 *   9. In-process in-flight idempotency:
 *      a. Second concurrent request sharing a key → 200 with order_id AND duplicate:true.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { decryptAdminActor, encryptAdminActor } from '../lib/admin-actor';

// ── Supabase mock ─────────────────────────────────────────────────────────────
const mockRpc = vi.fn();
const mockProofRpc = vi.fn();
const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();
const mockStorageUpload = vi.fn();
const mockStorageRemove = vi.fn();
const mockGetPublicUrl = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (name: string, ...args: unknown[]) =>
      name === 'create_order_idempotent' ? mockRpc(name, ...args) : mockProofRpc(name, ...args),
    from: mockFrom,
    storage: { from: mockStorageFrom },
  },
}));
vi.mock('../lib/proof-cleanup-client', () => ({
  getProofCleanupClient: () => ({
    rpc: mockProofRpc,
    storage: { from: mockStorageFrom },
  }),
}));

// ── Mailer mock ───────────────────────────────────────────────────────────────
vi.mock('../lib/mailer', () => ({
  sendOrderNotification: vi.fn().mockResolvedValue(undefined),
  sendBuyerConfirmation: vi.fn().mockResolvedValue(undefined),
  sendBuyerEmailFailureNotification: vi.fn().mockResolvedValue(undefined),
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
  status_email_error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const FAKE_HISTORY = [
  { status: 'baru', changed_at: new Date().toISOString() },
];

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'audit-test-key-only');
  mockProofRpc.mockImplementation((name: string) => ({
    abortSignal: () => Promise.resolve({ data: name === 'claim_proof_cleanup', error: null }),
  }));
  mockStorageUpload.mockResolvedValue({ error: null });
  mockStorageRemove.mockResolvedValue({ error: null });
  mockGetPublicUrl.mockReturnValue({ data: { publicUrl: null } });
  mockStorageFrom.mockReturnValue({
    upload: mockStorageUpload,
    remove: mockStorageRemove,
    getPublicUrl: mockGetPublicUrl,
  });
});

afterEach(() => vi.unstubAllEnvs());

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
  stub['update'] = vi.fn(chain);
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
    expect(res.body.produk).toBe('Layanan A');
    expect(res.body.nama_perusahaan).toBe('PT Test');
    expect(res.body.nama_pic).toBe('Budi');
    expect(res.body.created_at).toBe(FAKE_ORDER.created_at);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].status).toBe('baru');
  });

  it('returns history: [] when the order has no history rows', async () => {
    mockFrom
      .mockReturnValueOnce(buildQueryStub({ data: { ...FAKE_ORDER }, error: null }))
      .mockReturnValueOnce(buildQueryStub({ data: [], error: null }));

    const res = await request(app).get('/api/pesanan/order-uuid-123');

    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
  });

  it('returns history: [] when the status_history migration is not available yet', async () => {
    mockFrom
      .mockReturnValueOnce(buildQueryStub({ data: { ...FAKE_ORDER }, error: null }))
      .mockReturnValueOnce(
        buildQueryStub({
          data: null,
          error: {
            code: 'PGRST205',
            message: "Could not find the table 'public.status_history' in the schema cache",
          },
        })
      );

    const res = await request(app).get('/api/pesanan/order-uuid-123');

    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
  });

  it('returns 500 when the history query fails for an unrelated database error', async () => {
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

describe('GET /api/admin/orders/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the order and status history in chronological order', async () => {
    const history = [
      { status: 'baru', changed_at: '2026-08-30T08:00:00.000Z' },
      { status: 'diproses', changed_at: '2026-08-30T09:00:00.000Z', changed_by: encryptAdminActor('Admin Rina', FAKE_ORDER.id) },
    ];
    const historyQuery = buildQueryStub({ data: history, error: null });
    historyQuery.select = vi.fn(() => historyQuery);
    mockFrom
      .mockReturnValueOnce(buildQueryStub({ data: { ...FAKE_ORDER }, error: null }))
      .mockReturnValueOnce(historyQuery);

    const res = await request(app)
      .get('/api/admin/orders/order-uuid-123')
      .set('x-admin-passcode', process.env['ADMIN_PASSCODE'] ?? 'test-passcode');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(FAKE_ORDER.id);
    expect(res.body.history).toEqual([
      { ...history[0], changed_by: null },
      { ...history[1], changed_by: 'Admin Rina' },
    ]);
    expect(res.body.history[0].status).toBe('baru');
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'orders');
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'status_history');
    expect(mockFrom.mock.results[1].value.select).toHaveBeenCalledWith('status, changed_at, changed_by');
  });

  it('returns 404 when the admin order does not exist', async () => {
    mockFrom
      .mockReturnValueOnce(buildQueryStub({ data: null, error: null }))
      .mockReturnValueOnce(buildQueryStub({ data: [], error: null }));

    const res = await request(app)
      .get('/api/admin/orders/nonexistent')
      .set('x-admin-passcode', process.env['ADMIN_PASSCODE'] ?? 'test-passcode');

    expect(res.status).toBe(404);
  });

  it('never returns an actor name to an unauthenticated request', async () => {
    const res = await request(app).get(`/api/admin/orders/${FAKE_ORDER.id}`);
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('fails explicitly when an encrypted identity cannot be read', async () => {
    mockFrom
      .mockReturnValueOnce(buildQueryStub({ data: { ...FAKE_ORDER }, error: null }))
      .mockReturnValueOnce(buildQueryStub({
        data: [{ status: 'diproses', changed_at: FAKE_ORDER.created_at, changed_by: 'invalid-plaintext' }],
        error: null,
      }));
    const res = await request(app)
      .get(`/api/admin/orders/${FAKE_ORDER.id}`)
      .set('x-admin-passcode', process.env['ADMIN_PASSCODE'] ?? 'test-passcode');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('invalid-plaintext');
  });

  it('returns an empty history when the status-history migration is unavailable', async () => {
    mockFrom
      .mockReturnValueOnce(buildQueryStub({ data: { ...FAKE_ORDER }, error: null }))
      .mockReturnValueOnce(
        buildQueryStub({
          data: null,
          error: {
            code: 'PGRST205',
            message: "Could not find the table 'public.status_history' in the schema cache",
          },
        }),
      );

    const res = await request(app)
      .get('/api/admin/orders/order-uuid-123')
      .set('x-admin-passcode', process.env['ADMIN_PASSCODE'] ?? 'test-passcode');

    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
  });
});

describe('PATCH /api/admin/orders/:id/status — no direct status_history writes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not change the status if the audit encryption key is missing', async () => {
    vi.stubEnv('SESSION_SECRET', '');
    const res = await request(app)
      .patch(`/api/admin/orders/${FAKE_ORDER.id}/status`)
      .set('x-admin-passcode', process.env['ADMIN_PASSCODE'] ?? 'test-passcode')
      .send({ status: 'diproses', changed_by: 'Admin Rina' });
    expect(res.status).toBe(503);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', '   ', 123, 'x'.repeat(81), 'Admin\nRina'])(
    'rejects invalid admin identity %j without touching the database',
    async (changed_by) => {
      const res = await request(app)
        .patch('/api/admin/orders/order-uuid-123/status')
        .set('x-admin-passcode', process.env['ADMIN_PASSCODE'] ?? 'test-passcode')
        .send({ status: 'diproses', changed_by });
      expect(res.status).toBe(400);
      expect(mockFrom).not.toHaveBeenCalled();
    },
  );

  it('rejects an unauthenticated actor before writing', async () => {
    const res = await request(app)
      .patch('/api/admin/orders/order-uuid-123/status')
      .send({ status: 'diproses', changed_by: 'Admin Rina' });
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('updates the order status so the database trigger records the new history row', async () => {
    mockFrom.mockReturnValue(
      buildQueryStub({ data: { ...FAKE_ORDER, status: 'diproses' }, error: null })
    );

    const res = await request(app)
      .patch('/api/admin/orders/order-uuid-123/status')
      .set('x-admin-passcode', process.env['ADMIN_PASSCODE'] ?? 'test-passcode')
      .send({ status: 'diproses', changed_by: '  Admin Rina  ' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('diproses');
    const orderUpdate = (mockFrom.mock.results[0]?.value as Record<string, ReturnType<typeof vi.fn>>)['update'];
    expect(orderUpdate).toHaveBeenCalledWith({ status: 'diproses', status_changed_by: expect.stringMatching(/^enc:v1:/) });
    const envelope = orderUpdate.mock.calls[0][0].status_changed_by;
    expect(envelope).not.toContain('Admin Rina');
    expect(decryptAdminActor(envelope, FAKE_ORDER.id)).toBe('Admin Rina');

    // The trigger owns history insertion; the API must not bypass it with a
    // direct write that would violate the table's RLS policy.
    const directTableWrites = mockFrom.mock.calls.filter(
      ([table]: [string]) => table === 'status_history'
    );
    expect(directTableWrites).toHaveLength(0);
  });

  it('returns 400 for an invalid status value', async () => {
    const res = await request(app)
      .patch('/api/admin/orders/order-uuid-123/status')
      .set('x-admin-passcode', process.env['ADMIN_PASSCODE'] ?? 'test-passcode')
      .send({ status: 'invalid-status', changed_by: 'Admin Rina' });

    expect(res.status).toBe(400);
  });

  it('records a rejected status notification on the order without failing the status update', async () => {
    const { sendStatusUpdate } = await import('../lib/mailer');
    vi.mocked(sendStatusUpdate).mockRejectedValueOnce(new Error('Alamat email tidak valid'));
    const query = buildQueryStub({
      data: { ...FAKE_ORDER, status: 'diproses', status_email_error: null },
      error: null,
    });
    mockFrom.mockReturnValue(query);

    const res = await request(app)
      .patch('/api/admin/orders/order-uuid-123/status')
      .set('x-admin-passcode', process.env['ADMIN_PASSCODE'] ?? 'test-passcode')
      .send({ status: 'diproses', changed_by: 'Admin Rina' });

    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockFrom).toHaveBeenCalledWith('orders');
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(query['update']).toHaveBeenCalledWith({
      status_email_error: 'Alamat email tidak valid',
    });
  });

  it('clears a previous status notification error after a successful send', async () => {
    const { sendStatusUpdate } = await import('../lib/mailer');
    vi.mocked(sendStatusUpdate).mockResolvedValueOnce(undefined);
    const query = buildQueryStub({
      data: { ...FAKE_ORDER, status: 'diproses', status_email_error: 'Previous failure' },
      error: null,
    });
    mockFrom.mockReturnValue(query);

    const res = await request(app)
      .patch('/api/admin/orders/order-uuid-123/status')
      .set('x-admin-passcode', process.env['ADMIN_PASSCODE'] ?? 'test-passcode')
      .send({ status: 'diproses', changed_by: 'Admin Rina' });

    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(query['update']).toHaveBeenCalledWith({ status_email_error: null });
  });
});

describe('POST /api/konfirmasi-pesanan — no direct status_history writes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the atomic order RPC whose insert trigger records the initial baru history row', async () => {
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
      expect.objectContaining({
        p_nama_perusahaan: 'PT Test',
        p_produk: 'Layanan A',
      })
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

describe('POST /api/konfirmasi-pesanan — buyer email failure notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue(buildQueryStub({ data: null, error: null }));
  });

  it('records the failure and notifies the admin without failing the order request', async () => {
    const { sendBuyerConfirmation, sendBuyerEmailFailureNotification } = await import('../lib/mailer');
    vi.mocked(sendBuyerConfirmation).mockRejectedValueOnce(new Error('Alamat email ditolak'));
    mockRpc.mockResolvedValue(rpcNewOrder());

    const res = await request(app)
      .post('/api/konfirmasi-pesanan')
      .field('nama_perusahaan', 'PT Test')
      .field('nama_pic', 'Budi')
      .field('email', 'invalid@example.com')
      .field('whatsapp', '08123456789')
      .field('produk', 'Layanan A');

    expect(res.status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockFrom).toHaveBeenCalledWith('orders');
    expect(sendBuyerEmailFailureNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: FAKE_ORDER.id,
        email: 'invalid@example.com',
        error: 'Alamat email ditolak',
      })
    );
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

  it('returns the existing order (200) with duplicate:true when the RPC reports is_duplicate=true — simulates post-restart replay', async () => {
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
    // Frontend uses this flag to show the "already received" message instead of "success" UI.
    expect(res.body.duplicate).toBe(true);

    // RPC called exactly once; no emails triggered for a duplicate.
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it.each([10, 11])('returns a duplicate before the TTL and creates a fresh order at %i minutes', async (expiryMinutes) => {
    const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
    const START_TIME = Date.parse('2026-08-30T08:00:00.000Z');
    const REUSED_KEY = 'test-key-expiry-boundary-001';
    const FIRST_ORDER_ID = 'first-order-uuid-123';
    const FRESH_ORDER_ID = 'fresh-order-uuid-456';
    let keyCreatedAt: number | undefined;

    // Keep the RPC mock close to the DB function's behavior so this test
    // exercises the complete request flow while controlling the clock:
    // non-expired keys return the original order, while expired keys are
    // replaced as part of creating a new order. The DB uses strict >, so
    // a key exactly 10 minutes old is expired, not a duplicate.
    mockRpc.mockImplementation(
      async (
        _functionName: string,
        params: { p_idempotency_key: string | null },
      ) => {
        const now = Date.now();
        if (
          params.p_idempotency_key === REUSED_KEY &&
          keyCreatedAt !== undefined &&
          keyCreatedAt > now - IDEMPOTENCY_TTL_MS
        ) {
          return rpcDuplicate(FIRST_ORDER_ID);
        }

        keyCreatedAt = now;
        return rpcNewOrder(keyCreatedAt === START_TIME ? FIRST_ORDER_ID : FRESH_ORDER_ID);
      },
    );

    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(START_TIME);
    const submitWithReusedKey = () =>
      request(app)
        .post('/api/konfirmasi-pesanan')
        .set('x-idempotency-key', REUSED_KEY)
        .field('nama_perusahaan', 'PT Test')
        .field('nama_pic', 'Budi')
        .field('email', 'budi@test.com')
        .field('whatsapp', '08123456789')
        .field('produk', 'Layanan A');

    try {
      const first = await submitWithReusedKey();
      expect(first.status).toBe(201);
      expect(first.body.order_id).toBe(FIRST_ORDER_ID);
      expect(first.body.duplicate).toBeUndefined();

      dateNow.mockReturnValue(START_TIME + 9 * 60 * 1000);
      const withinTtl = await submitWithReusedKey();
      expect(withinTtl.status).toBe(200);
      expect(withinTtl.body.order_id).toBe(FIRST_ORDER_ID);
      expect(withinTtl.body.duplicate).toBe(true);

      dateNow.mockReturnValue(START_TIME + expiryMinutes * 60 * 1000);
      const afterTtl = await submitWithReusedKey();
      expect(afterTtl.status).toBe(201);
      expect(afterTtl.body.order_id).toBe(FRESH_ORDER_ID);
      expect(afterTtl.body.duplicate).toBeUndefined();
      expect(mockRpc).toHaveBeenCalledTimes(3);
    } finally {
      dateNow.mockRestore();
    }
  });

  it('creates a new order (201) without duplicate flag when there is no existing key in the DB (first request)', async () => {
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
    expect(res.body.duplicate).toBeUndefined();
  });

  it('resolves a cross-process race: retries on 23505 and returns the winner (200) with duplicate:true', async () => {
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
    // Race-recovery loser is treated as a duplicate — user sees the "already received" message.
    expect(res.body.duplicate).toBe(true);

    // The race-recovery retry must have fired (2 RPC calls total).
    expect(mockRpc).toHaveBeenCalledTimes(2);

    // No emails sent for a duplicate.
    const { sendOrderNotification, sendBuyerConfirmation } = await import('../lib/mailer');
    // Give background promises a tick to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(sendOrderNotification).not.toHaveBeenCalled();
    expect(sendBuyerConfirmation).not.toHaveBeenCalled();
  });

  it('returns 200 with duplicate:true for a concurrent in-process request sharing the same idempotency key', async () => {
    // This tests the inflightMap path: a second request arrives while the first
    // is still awaiting the RPC. The second should coalesce onto the first's
    // promise and return duplicate:true so the user sees the "already received" notice.

    // Use a manually-controlled promise so the first request blocks at the RPC
    // long enough for the second to register and find the inflight entry.
    let resolveRpc!: (v: ReturnType<typeof rpcNewOrder>) => void;
    const blockedRpc = new Promise<ReturnType<typeof rpcNewOrder>>((r) => { resolveRpc = r; });
    mockRpc.mockReturnValueOnce(blockedRpc);

    const SHARED_KEY = `inflight-test-key-${Date.now()}`;
    const post = () =>
      request(app)
        .post('/api/konfirmasi-pesanan')
        .set('x-idempotency-key', SHARED_KEY)
        .field('nama_perusahaan', 'PT Test')
        .field('nama_pic', 'Budi')
        .field('email', 'budi@test.com')
        .field('whatsapp', '08123456789')
        .field('produk', 'Layanan A');

    // SuperTest requests do not fire until awaited / .end() is called.
    // We must call .end() on the first request NOW so it actually hits the
    // server and registers in inflightMap before the second request arrives.
    type SuResponse = import('supertest').Response;
    const firstPromise = new Promise<SuResponse>((resolve, reject) =>
      post().end((err, res) => (err ? reject(err) : resolve(res)))
    );

    // Wait for the first request to pass through multer, enter the route
    // handler, and reach `await supabase.rpc(...)` (its suspension point).
    await new Promise((r) => setTimeout(r, 40));

    // Fire the second request — at this point inflightMap[key] is set.
    const secondPromise = new Promise<SuResponse>((resolve, reject) =>
      post().end((err, res) => (err ? reject(err) : resolve(res)))
    );

    // Give the second request time to find and await the inflight promise.
    await new Promise((r) => setTimeout(r, 10));

    // Resolve the RPC so both requests can complete.
    resolveRpc(rpcNewOrder(FAKE_ORDER.id));

    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    // First request: genuine new order (201, no duplicate flag).
    expect(first.status).toBe(201);
    expect(first.body.ok).toBe(true);
    expect(first.body.order_id).toBe(FAKE_ORDER.id);
    expect(first.body.duplicate).toBeUndefined();

    // Second request: in-flight coalesced duplicate (200, duplicate:true).
    expect(second.status).toBe(200);
    expect(second.body.ok).toBe(true);
    expect(second.body.order_id).toBe(FAKE_ORDER.id);
    expect(second.body.duplicate).toBe(true);

    // RPC called only once — the second request never reached the DB.
    expect(mockRpc).toHaveBeenCalledTimes(1);
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

  it('deletes an uploaded proof when the DB insert fails after storage succeeds', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST301', message: 'DB unavailable' },
    });
    vi.spyOn(Date, 'now').mockReturnValue(1725000000000);

    try {
      const res = await request(app)
        .post('/api/konfirmasi-pesanan')
        .set('x-idempotency-key', 'test-key-upload-cleanup-001')
        .field('nama_perusahaan', 'PT Test')
        .field('nama_pic', 'Budi')
        .field('email', 'budi@test.com')
        .field('whatsapp', '08123456789')
        .field('produk', 'Layanan A')
        .attach('bukti_pembayaran', Buffer.from('proof'), 'proof.pdf');

      expect(res.status).toBe(500);
      expect(mockStorageUpload).toHaveBeenCalledTimes(1);
      expect(mockProofRpc).toHaveBeenCalledWith('register_proof_upload', {
        p_filename: expect.stringMatching(/^1725000000000-[a-z0-9]+\.pdf$/),
      });
      expect(mockProofRpc.mock.invocationCallOrder[0]).toBeLessThan(
        mockStorageUpload.mock.invocationCallOrder[0]!,
      );
      expect(mockStorageRemove).toHaveBeenCalledWith([
        expect.stringMatching(/^1725000000000-[a-z0-9]+\.pdf$/),
      ]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('does not upload or create an order when durable cleanup cannot be registered', async () => {
    mockProofRpc.mockReturnValue({
      abortSignal: () => Promise.resolve({ error: { message: 'DB down' } }),
    });
    const res = await request(app).post('/api/konfirmasi-pesanan')
      .field('nama_perusahaan', 'PT Test').field('nama_pic', 'Budi')
      .field('email', 'budi@test.com').field('whatsapp', '08123456789')
      .field('produk', 'Layanan A')
      .attach('bukti_pembayaran', Buffer.from('proof'), 'proof.pdf');
    expect(res.status).toBe(503);
    expect(mockStorageUpload).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('cleans its own unused upload when another order won the idempotency key', async () => {
    mockRpc.mockResolvedValue(rpcDuplicate());
    const res = await request(app).post('/api/konfirmasi-pesanan')
      .field('nama_perusahaan', 'PT Test').field('nama_pic', 'Budi')
      .field('email', 'budi@test.com').field('whatsapp', '08123456789')
      .field('produk', 'Layanan A')
      .attach('bukti_pembayaran', Buffer.from('proof'), 'proof.pdf');
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(mockStorageRemove).toHaveBeenCalledWith([mockStorageUpload.mock.calls[0]![0]]);
  });
});
