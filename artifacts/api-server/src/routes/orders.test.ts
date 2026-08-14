/**
 * API tests for order status history.
 *
 * All Supabase calls are mocked — no real network or DB connections are made.
 * History is written automatically by a DB trigger on the orders table, so
 * these tests verify that:
 *   1. POST /api/konfirmasi-pesanan never writes directly to status_history.
 *   2. PATCH /admin/orders/:id/status never writes directly to status_history.
 *   3. GET /api/pesanan/:id includes the history array returned by the DB.
 *   4. GET /api/pesanan/:id returns 500 when the history query fails (does NOT
 *      silently swallow the error and return an empty array).
 *   5. GET /api/pesanan/:id returns 404 when the order is not found.
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
  stub['eq'] = chain;
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

  it('does NOT write directly to the status_history table (trigger handles it)', async () => {
    mockFrom.mockReturnValue(
      buildQueryStub({ data: { ...FAKE_ORDER }, error: null })
    );
    mockRpc.mockResolvedValue({ error: null });

    await request(app)
      .post('/api/konfirmasi-pesanan')
      .field('nama_perusahaan', 'PT Test')
      .field('nama_pic', 'Budi')
      .field('email', 'budi@test.com')
      .field('whatsapp', '08123456789')
      .field('produk', 'Layanan A');

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
