import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAdmin } from './require-admin';

const sdk = vi.hoisted(() => ({ getAuth: vi.fn(), getUser: vi.fn(), update: vi.fn() }));
vi.mock('@clerk/express', () => ({
  getAuth: sdk.getAuth,
  clerkClient: { users: { getUser: sdk.getUser, updateUserMetadata: sdk.update } },
}));
const user = () => ({
  id: 'user-rina', firstName: 'Rina', lastName: 'Admin',
  primaryEmailAddressId: 'email-rina',
  emailAddresses: [{ id: 'email-rina', emailAddress: 'rina@example.test', verification: { status: 'verified' } }],
  publicMetadata: { role: 'admin' as string | null | undefined },
  privateMetadata: {} as Record<string, unknown>,
});
const app = express();
app.use((req, _res, next) => { req.log = { error: vi.fn() } as any; next(); });
app.get('/admin', requireAdmin, (_req, res) => res.json(res.locals.admin));
app.post('/admin', requireAdmin, (_req, res) => res.json(res.locals.admin));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ADMIN_EMAIL', 'owner@example.test');
  vi.stubEnv('SITE_URL', 'https://app.example.test');
  sdk.getAuth.mockReturnValue({ userId: 'user-rina' });
  sdk.getUser.mockResolvedValue(user());
});
afterEach(() => vi.unstubAllEnvs());

describe('personal admin sessions', () => {
  it('rejects the old shared passcode without a session', async () => {
    sdk.getAuth.mockReturnValue({ userId: null });
    expect((await request(app).get('/admin').set('x-admin-passcode', 'old-passcode')).status).toBe(401);
    expect(sdk.getUser).not.toHaveBeenCalled();
  });
  it('returns only server-resolved identity and disables caching', async () => {
    const res = await request(app).get('/admin');
    expect(res.body).toEqual({ id: 'user-rina', name: 'Rina Admin', email: 'rina@example.test' });
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it('rejects a signed-in non-admin and rechecks revoked roles', async () => {
    expect((await request(app).get('/admin')).status).toBe(200);
    const revoked = user(); revoked.publicMetadata.role = null;
    sdk.getUser.mockResolvedValue(revoked);
    expect((await request(app).get('/admin')).status).toBe(403);
  });
  it('rejects an unverified primary email even for an admin', async () => {
    const unverified = user(); unverified.emailAddresses[0].verification.status = 'unverified';
    sdk.getUser.mockResolvedValue(unverified);
    expect((await request(app).get('/admin')).status).toBe(403);
  });
  it('bootstraps only the configured verified owner and never restores a revoked grant', async () => {
    vi.stubEnv('ADMIN_EMAIL', 'RINA@example.test');
    const first = user(); first.publicMetadata.role = undefined;
    sdk.getUser.mockResolvedValue(first);
    sdk.update.mockResolvedValue(user());
    expect((await request(app).get('/admin')).status).toBe(200);
    expect(sdk.update).toHaveBeenCalledWith('user-rina', {
      publicMetadata: { role: 'admin' }, privateMetadata: { adminBootstrapCompleted: true },
    });
    sdk.update.mockClear();
    first.privateMetadata.adminBootstrapCompleted = true;
    expect((await request(app).get('/admin')).status).toBe(403);
    expect(sdk.update).not.toHaveBeenCalled();
  });
  it('never gives the first arbitrary signup admin access', async () => {
    const stranger = user(); stranger.publicMetadata.role = undefined;
    sdk.getUser.mockResolvedValue(stranger);
    expect((await request(app).get('/admin')).status).toBe(403);
    expect(sdk.update).not.toHaveBeenCalled();
  });
  it('rejects cross-site writes and accepts same-origin writes', async () => {
    expect((await request(app).post('/admin').set('origin', 'https://evil.example.test')).status).toBe(403);
    expect((await request(app).post('/admin').set('sec-fetch-site', 'cross-site')).status).toBe(403);
    expect((await request(app).post('/admin').set('origin', 'https://app.example.test')).status).toBe(200);
  });
  it('fails closed when the account provider cannot verify the role', async () => {
    sdk.getUser.mockRejectedValue(new Error('offline'));
    expect((await request(app).get('/admin')).status).toBe(503);
  });
});
