import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { idID } from '@clerk/localizations';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

export interface AdminIdentity { id: string; name: string; email: string }

/** Same-origin web requests use Clerk's HttpOnly session cookie, not stored passcodes. */
export async function adminFetch(input: string, init?: RequestInit) {
  const response = await fetch(input, { ...init, credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401 || response.status === 403) {
    window.dispatchEvent(new Event('admin-session-expired'));
  }
  return response;
}

function AccountGate({ children }: {
  children: (admin: AdminIdentity, logout: () => Promise<void>) => ReactNode;
}) {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const { signOut } = useClerk();
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [logoutError, setLogoutError] = useState('');
  const logout = useCallback(async () => {
    setAdmin(null);
    setLogoutError('');
    try {
      await signOut({ redirectUrl: `${basePath}/admin-pesanan` });
    } catch {
      setLogoutError('Gagal mengakhiri sesi. Coba Keluar lagi.');
    }
  }, [signOut]);

  useEffect(() => {
    // Remove obsolete shared credentials, without relying on browser storage availability.
    try {
      sessionStorage.removeItem('dp_admin_pc');
      sessionStorage.removeItem('dp_admin_name');
    } catch { /* old storage is not used for authentication */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAdmin(null);
    setError('');
    if (!isLoaded || !isSignedIn) return;
    const check = async () => {
      try {
        const res = await fetch(`${basePath}/api/admin/session`, { credentials: 'same-origin', cache: 'no-store' });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Tidak dapat memeriksa akun admin.');
        if (!cancelled) setAdmin(body);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Tidak dapat terhubung ke server.');
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, userId, sessionId, attempt]);

  useEffect(() => {
    const expired = () => { setAdmin(null); setError('Sesi atau izin admin berubah. Masuk kembali dengan akun yang memiliki izin.'); };
    window.addEventListener('admin-session-expired', expired);
    return () => window.removeEventListener('admin-session-expired', expired);
  }, []);

  if (isLoaded && isSignedIn && admin && !logoutError) {
    return <div key={`${userId}:${sessionId}`}>{children(admin, logout)}</div>;
  }
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center gap-5 p-4">
      <h1 className="text-xl font-bold">Admin DokumenProyek</h1>
      {!isLoaded ? <p>Memuat akun…</p> : !isSignedIn ? (
        <>
          <p className="max-w-sm text-center text-sm text-slate-300">
            Masuk dengan akun pribadi. Akses pesanan hanya tersedia bagi akun yang diberi izin admin.
          </p>
          {window.location.pathname.endsWith('/admin-daftar') ?
            <SignUp routing="hash" signInUrl={`${basePath}/admin-pesanan`} forceRedirectUrl={`${basePath}/admin-pesanan`} /> :
            <SignIn routing="hash" signUpUrl={`${basePath}/admin-daftar`} forceRedirectUrl={`${basePath}/admin-pesanan`} />}
        </>
      ) : (
        <div className="max-w-md space-y-4 text-center">
          <p role={error || logoutError ? 'alert' : 'status'}>{logoutError || error || 'Memeriksa izin admin…'}</p>
          {error && <button className="rounded-lg bg-blue-600 px-4 py-2" onClick={() => setAttempt(a => a + 1)}>Coba lagi</button>}
          <button className="ml-3 underline" onClick={() => void logout()}>Keluar / Ganti admin</button>
        </div>
      )}
      <a className="text-sm text-slate-300 underline" href={import.meta.env.BASE_URL}>Kembali ke Simulator</a>
    </div>
  );
}

export default function AdminAccount({ children }: {
  children: (admin: AdminIdentity, logout: () => Promise<void>) => ReactNode;
}) {
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      localization={{
        ...idID,
        signIn: {
          ...idID.signIn,
          start: {
            ...idID.signIn?.start,
            title: 'Masuk ke DokumenProyek',
            titleCombined: 'Masuk ke DokumenProyek',
          },
        },
        signUp: {
          ...idID.signUp,
          start: {
            ...idID.signUp?.start,
            title: 'Buat akun DokumenProyek',
            titleCombined: 'Buat akun DokumenProyek',
          },
        },
      }}
      appearance={{
        theme: dark,
        options: {
          logoImageUrl: `${window.location.origin}${basePath}/admin-logo.svg`,
          logoLinkUrl: `${basePath}/admin-pesanan`,
        },
        variables: {
          colorPrimary: '#60a5fa', colorForeground: '#f8fafc',
          colorMutedForeground: '#cbd5e1', colorBackground: '#1e293b',
          colorInput: '#334155', colorInputForeground: '#ffffff',
          colorDanger: '#fca5a5', colorNeutral: '#cbd5e1',
          fontFamily: 'Inter, sans-serif',
        },
        elements: {
          rootBox: { width: 'min(400px, calc(100vw - 2rem))', maxWidth: '100%' },
          cardBox: { width: '100%', maxWidth: '100%', backgroundColor: '#1e293b' },
        },
      }}
    >
      <ScopedAccountGate>{children}</ScopedAccountGate>
    </ClerkProvider>
  );
}

function ScopedAccountGate({ children }: {
  children: (admin: AdminIdentity, logout: () => Promise<void>) => ReactNode;
}) {
  const { userId, sessionId } = useAuth();
  // Remount all account-scoped state before rendering a different session.
  return <AccountGate key={`${userId}:${sessionId}`}>{children}</AccountGate>;
}
