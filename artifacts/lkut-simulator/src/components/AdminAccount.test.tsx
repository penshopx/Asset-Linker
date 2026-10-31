import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  vi.stubGlobal('window', { location: { hostname: 'localhost', origin: 'http://localhost', pathname: '/admin-pesanan' } });
  return { auth: { isLoaded: true, isSignedIn: true, userId: 'rina', sessionId: 'session-rina' }, signOut: vi.fn() };
});
vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }: any) => children,
  useAuth: () => state.auth,
  useClerk: () => ({ signOut: state.signOut }),
  SignIn: () => <p>Masuk akun pribadi</p>,
  SignUp: () => <p>Daftar akun pribadi</p>,
}));
vi.mock('@clerk/react/internal', () => ({ publishableKeyFromHost: () => 'pk_test_fixture' }));
vi.mock('@clerk/themes', () => ({ dark: {} }));
vi.mock('@clerk/localizations', () => ({ idID: {} }));
import AdminAccount, { adminFetch } from './AdminAccount';

let renderer: ReactTestRenderer;
let events: EventTarget;
let fetchMock: ReturnType<typeof vi.fn>;
const view = () => <AdminAccount>{(admin, logout) =>
  <div><p>Pesanan milik {admin.name}</p><button onClick={logout}>Keluar</button></div>
}</AdminAccount>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  events = new EventTarget();
  Object.assign(window, {
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  });
  vi.stubGlobal('sessionStorage', { removeItem: vi.fn() });
  state.auth = { isLoaded: true, isSignedIn: true, userId: 'rina', sessionId: 'session-rina' };
  state.signOut.mockReset().mockResolvedValue(undefined);
  fetchMock = vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ id: 'rina', name: 'Rina', email: 'rina@example.test' }),
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
const text = () => {
  const flatten = (node: any): string => typeof node === 'string' ? node :
    Array.isArray(node) ? node.map(flatten).join('') : node?.children?.map(flatten).join('') ?? '';
  return flatten(renderer.toJSON());
};
describe('admin account gate', () => {
  it('checks server authorization on reload and removes old shared credentials', async () => {
    await act(async () => { renderer = create(view()); });
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/session', { credentials: 'same-origin', cache: 'no-store' });
    expect(text()).toContain('Pesanan milik Rina');
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('dp_admin_pc');
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('dp_admin_name');
  });
  it('keeps signed-in unauthorized accounts out of the dashboard', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Bukan admin' }) });
    await act(async () => { renderer = create(view()); });
    expect(text()).toContain('Bukan admin');
    expect(text()).not.toContain('Pesanan milik');
  });
  it('clears scoped data on expiry and sends cookies instead of stored credentials', async () => {
    await act(async () => { renderer = create(view()); });
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    await act(async () => { await adminFetch('/api/admin/orders'); });
    expect(text()).not.toContain('Pesanan milik');
    expect(text()).toContain('Sesi atau izin admin berubah');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/orders', { credentials: 'same-origin', cache: 'no-store' });
  });
  it('ends the provider session and removes the dashboard before switching admin', async () => {
    await act(async () => { renderer = create(view()); });
    await act(async () => { await renderer.root.findByType('button').props.onClick(); });
    expect(state.signOut).toHaveBeenCalledWith({ redirectUrl: '/admin-pesanan' });
    expect(text()).not.toContain('Pesanan milik');
  });
  it('shows login instead of reusing a passcode when signed out', async () => {
    state.auth.isSignedIn = false;
    await act(async () => { renderer = create(view()); });
    expect(text()).toContain('Masuk akun pribadi');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
