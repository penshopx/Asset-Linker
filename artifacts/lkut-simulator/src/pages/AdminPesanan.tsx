import { useState, useEffect, useCallback } from 'react';
import { Lock, RefreshCw, MessageCircle, ExternalLink, ChevronDown, ChevronUp, History, Package, CheckCircle2, Clock, XCircle, AlertCircle, MailWarning } from 'lucide-react';

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;

type OrderStatus = 'baru' | 'diproses' | 'selesai' | 'dibatalkan';

interface StatusHistoryEntry {
  status: OrderStatus;
  changed_at: string;
  changed_by?: string | null;
}

interface Order {
  id: string;
  created_at: string;
  nama_perusahaan: string;
  nama_pic: string;
  email: string;
  whatsapp: string;
  produk: string;
  catatan?: string;
  bukti_url?: string;
  bukti_filename?: string;
  status: OrderStatus;
  buyer_email_sent?: boolean;
  buyer_email_error?: string | null;
  status_email_error?: string | null;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: React.ReactNode }> = {
  baru: { label: 'Baru', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  diproses: { label: 'Diproses', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <Clock className="w-3.5 h-3.5" /> },
  selesai: { label: 'Selesai', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  dibatalkan: { label: 'Dibatalkan', color: 'bg-red-100 text-red-700 border-red-200', icon: <XCircle className="w-3.5 h-3.5" /> },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (passcode: string, adminName: string) => void }) {
  const [input, setInput] = useState('');
  const [adminName, setAdminName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminName.trim() || adminName.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(adminName)) {
      setError('Nama admin wajib diisi, maksimal 80 karakter tanpa karakter kontrol.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/orders`, {
        headers: { 'x-admin-passcode': input },
      });
      if (res.status === 401) {
        setError('Passcode salah. Coba lagi.');
      } else if (res.ok) {
        onLogin(input, adminName.trim());
      } else {
        setError('Terjadi kesalahan server. Coba lagi.');
      }
    } catch {
      setError('Tidak dapat terhubung ke server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-full p-4">
            <Lock className="w-8 h-8 text-amber-400" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">Admin DokumenProyek</h1>
            <p className="text-slate-400 text-sm mt-1">Masukkan nama dan passcode untuk lanjut</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm text-slate-300">
            Nama admin
            <input
              type="text"
              value={adminName}
              onChange={e => setAdminName(e.target.value)}
              required
              maxLength={80}
              autoComplete="name"
              autoFocus
              className="mt-1 w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-amber-500"
            />
          </label>
          <p className="text-xs text-slate-400">Nama dicatat pada riwayat perubahan. Identitas diisi sendiri, bukan akun terverifikasi.</p>
          <input
            type="password"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Passcode admin"
            aria-label="Passcode admin"
            required
            className="w-full bg-slate-700 border border-slate-600 text-white placeholder-slate-400 rounded-lg px-4 py-3 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          />
          {error && (
            <p className="text-red-400 text-sm flex items-center gap-1.5">
              <XCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !input || !adminName.trim()}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-bold py-3 rounded-lg transition-colors"
          >
            {loading ? 'Memeriksa…' : 'Masuk'}
          </button>
        </form>

        <p className="text-center mt-6">
          <a href={import.meta.env.BASE_URL} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
            ← Kembali ke Simulator
          </a>
        </p>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: OrderStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─── Order Row ────────────────────────────────────────────────────────────────
function OrderRow({ order, passcode, adminName, onUpdated }: { order: Order; passcode: string; adminName: string; onUpdated: (updated: Order) => void }) {
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [retryingEmail, setRetryingEmail] = useState(false);
  const [retryError, setRetryError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const buyerEmailFailed = order.buyer_email_sent === false && Boolean(order.buyer_email_error);

  const loadHistory = async (force = false) => {
    if (historyLoaded && !force) return;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await fetch(`${API_BASE}/admin/orders/${encodeURIComponent(order.id)}`, {
        headers: { 'x-admin-passcode': passcode },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? 'Gagal memuat riwayat status.');
      }
      const entries = Array.isArray(body.history) ? body.history : [];
      setHistory(
        entries
          .filter((entry: any) => entry && typeof entry.status === 'string' && entry.changed_at)
          .sort(
            (a: StatusHistoryEntry, b: StatusHistoryEntry) =>
              new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
          ),
      );
      setHistoryLoaded(true);
    } catch (e: any) {
      setHistoryError(e.message ?? 'Tidak dapat memuat riwayat status.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleHistory = () => {
    const nextOpen = !historyOpen;
    setHistoryOpen(nextOpen);
    if (nextOpen) void loadHistory();
  };

  const updateStatus = async (newStatus: OrderStatus) => {
    if (newStatus === order.status) return;
    setUpdating(true);
    try {
      const res = await fetch(`${API_BASE}/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-passcode': passcode },
        body: JSON.stringify({ status: newStatus, changed_by: adminName }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdated(updated);
        setUpdateError('');
        if (historyOpen) void loadHistory(true);
      } else {
        const body = await res.json().catch(() => ({}));
        setUpdateError(body.error ?? 'Gagal memperbarui status.');
      }
    } catch {
      setUpdateError('Tidak dapat terhubung ke server. Coba lagi.');
    } finally {
      setUpdating(false);
    }
  };

  const retryBuyerEmail = async () => {
    setRetryingEmail(true);
    setRetryError('');
    try {
      const res = await fetch(`${API_BASE}/admin/orders/${order.id}/retry-buyer-email`, {
        method: 'POST',
        headers: { 'x-admin-passcode': passcode },
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = body.error ?? 'Email gagal dikirim ulang.';
        setRetryError(message);
        onUpdated({
          ...order,
          buyer_email_sent: false,
          buyer_email_error: message,
        });
        return;
      }

      onUpdated({
        ...order,
        buyer_email_sent: true,
        buyer_email_error: null,
      });
    } catch {
      setRetryError('Tidak dapat terhubung ke server. Coba lagi.');
    } finally {
      setRetryingEmail(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-900">{order.nama_perusahaan}</span>
            <StatusBadge status={order.status} />
          </div>
          <p className="text-slate-500 text-sm mt-0.5">
            #{order.id.slice(0, 8).toUpperCase()} · {formatDate(order.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Chat WA */}
          <a
            href={waLink(order.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <MessageCircle className="w-4 h-4" /> Chat WA
          </a>
          {/* Bukti bayar */}
          {order.bukti_url && (
            <a
              href={order.bukti_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Bukti
            </a>
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-sm mb-4">
        <div><span className="text-slate-400">PIC:</span> <span className="text-slate-700">{order.nama_pic}</span></div>
        <div><span className="text-slate-400">Email:</span> <span className="text-slate-700">{order.email}</span></div>
        <div><span className="text-slate-400">WA:</span> <span className="text-slate-700">{order.whatsapp}</span></div>
        <div className="col-span-2 sm:col-span-1"><span className="text-slate-400">Produk:</span> <span className="text-slate-700 font-medium">{order.produk}</span></div>
        {order.catatan && (
          <div className="col-span-2 sm:col-span-3"><span className="text-slate-400">Catatan:</span> <span className="text-slate-600 italic">{order.catatan}</span></div>
        )}
        {!order.bukti_url && order.bukti_filename && (
          <div className="col-span-2 sm:col-span-3"><span className="text-slate-400">File Bukti:</span> <span className="text-slate-500 text-xs">{order.bukti_filename} (belum di-upload ke storage)</span></div>
        )}
      </div>

      {buyerEmailFailed && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <MailWarning className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <div className="min-w-0">
                <p className="font-semibold text-red-800">Email konfirmasi pembeli gagal terkirim</p>
                <p className="mt-0.5 break-words text-xs text-red-700">
                  {order.buyer_email_error}
                </p>
                {retryError && (
                  <p className="mt-1 text-xs font-medium text-red-800" role="status">{retryError}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={retryBuyerEmail}
              disabled={retryingEmail}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${retryingEmail ? 'animate-spin' : ''}`} />
              {retryingEmail ? 'Mengirim ulang…' : 'Coba kirim ulang'}
            </button>
          </div>
        </div>
      )}

      {order.status_email_error && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3" role="alert">
          <div className="flex items-start gap-2.5">
            <MailWarning className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="font-semibold text-amber-800">Email notifikasi status gagal terkirim</p>
              <p className="mt-0.5 break-words text-xs text-amber-700">{order.status_email_error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={toggleHistory}
          aria-expanded={historyOpen}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900"
        >
          <History className="h-4 w-4 text-slate-400" />
          {historyOpen ? 'Sembunyikan riwayat status' : 'Lihat riwayat status'}
          {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {historyOpen && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            {historyLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Memuat riwayat…
              </div>
            ) : historyError ? (
              <p className="text-sm text-red-700" role="alert">{historyError}</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada riwayat perubahan status.</p>
            ) : (
              <StatusTimeline history={history} />
            )}
          </div>
        )}
      </div>

      {/* Status selector */}
      {updateError && <p role="alert" className="mb-2 text-sm text-red-700">{updateError}</p>}
      <div className="flex items-center gap-2">
        <span className="text-slate-400 text-sm">Ubah status:</span>
        <div className="relative">
          <select
            value={order.status}
            onChange={e => updateStatus(e.target.value as OrderStatus)}
            disabled={updating}
            className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:border-amber-500 cursor-pointer disabled:opacity-60"
          >
            {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
              <option key={val} value={val}>{cfg.label}</option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        {updating && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />}
      </div>
    </div>
  );
}

function StatusTimeline({ history }: { history: StatusHistoryEntry[] }) {
  return (
    <ol className="relative ml-2 border-l border-slate-200">
      {history.map((entry, idx) => {
        const cfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.baru;
        const isLast = idx === history.length - 1;
        return (
          <li key={`${entry.changed_at}-${idx}`} className={`ml-4 ${isLast ? 'pb-0' : 'pb-4'}`}>
            <span
              className={`absolute -left-[7px] h-3 w-3 rounded-full ring-2 ring-slate-50 ${isLast ? 'bg-amber-500' : 'bg-slate-300'}`}
            />
            <div className="flex items-start gap-2">
              <span className={`${isLast ? 'text-slate-700' : 'text-slate-400'}`}>{cfg.icon}</span>
              <div>
                <p className={`text-sm font-semibold leading-tight ${isLast ? 'text-slate-700' : 'text-slate-500'}`}>
                  {cfg.label}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{formatDate(entry.changed_at)}</p>
                <p className="mt-1 text-xs text-slate-500 break-words">
                  {entry.changed_by ? `Oleh: ${entry.changed_by}` : 'Identitas belum tercatat'}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ passcode, adminName, onLogout }: { passcode: string; adminName: string; onLogout: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<OrderStatus | 'semua'>('semua');
  const [showEmailFailures, setShowEmailFailures] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/orders`, {
        headers: { 'x-admin-passcode': passcode },
      });
      if (!res.ok) throw new Error('Gagal memuat data');
      setOrders(await res.json());
    } catch (e: any) {
      setError(e.message ?? 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  }, [passcode]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    const interval = window.setInterval(() => { void fetchOrders(); }, 30_000);
    return () => window.clearInterval(interval);
  }, [fetchOrders]);

  const handleUpdated = (updated: Order) => {
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
  };

  const failedBuyerEmails = orders.filter(
    order => order.buyer_email_sent === false && Boolean(order.buyer_email_error)
  );
  useEffect(() => {
    if (failedBuyerEmails.length === 0) setShowEmailFailures(false);
  }, [failedBuyerEmails.length]);

  const filteredByStatus = filter === 'semua' ? orders : orders.filter(o => o.status === filter);
  const filtered = showEmailFailures
    ? filteredByStatus.filter(order => order.buyer_email_sent === false && Boolean(order.buyer_email_error))
    : filteredByStatus;

  const counts = orders.reduce(
    (acc, o) => { acc[o.status] = (acc[o.status] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 text-white py-5 px-4 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold">Dashboard Pesanan</h1>
            <p className="text-slate-400 text-sm">DokumenProyek Admin</p>
            <p className="text-slate-300 text-xs mt-1 break-words">Admin: {adminName} (diisi sendiri)</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onLogout} className="text-sm text-slate-300 hover:text-white">Keluar</button>
            <button
              onClick={fetchOrders}
              className="inline-flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <a
              href={import.meta.env.BASE_URL}
              className="text-slate-400 hover:text-white text-sm transition-colors"
            >
              ← Simulator
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            ['semua', 'Total', orders.length, 'bg-slate-700 text-white'],
            ['baru', 'Baru', counts.baru ?? 0, 'bg-blue-500 text-white'],
            ['diproses', 'Diproses', counts.diproses ?? 0, 'bg-amber-500 text-white'],
            ['selesai', 'Selesai', counts.selesai ?? 0, 'bg-emerald-500 text-white'],
          ] as const).map(([val, label, count, color]) => (
            <button
              key={val}
              onClick={() => setFilter(val as any)}
              className={`rounded-xl p-4 text-left transition-all hover:opacity-90 ${color} ${filter === val ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-50' : ''}`}
            >
              <p className="text-3xl font-black">{count}</p>
              <p className="text-sm font-medium opacity-90">{label}</p>
            </button>
          ))}
        </div>

        {failedBuyerEmails.length > 0 && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 shadow-sm"
            role="alert"
            aria-live="polite"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-red-100 p-2 text-red-600">
                  <MailWarning className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold">
                    {failedBuyerEmails.length} email konfirmasi perlu perhatian
                  </p>
                  <p className="mt-1 text-sm text-red-700">
                    Konfirmasi pembeli gagal terkirim. Coba kirim ulang dari baris pesanan yang bermasalah.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEmailFailures(current => !current)}
                className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800 transition-colors hover:bg-red-100"
              >
                {showEmailFailures ? 'Tampilkan semua pesanan' : 'Tampilkan yang gagal'}
              </button>
            </div>
          </div>
        )}

        {/* Orders list */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin" />
            <p>Memuat pesanan…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
            <Package className="w-10 h-10 opacity-40" />
            <p className="font-medium">Belum ada pesanan{filter !== 'semua' ? ` dengan status "${STATUS_CONFIG[filter as OrderStatus]?.label}"` : ''}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(order => (
              <OrderRow key={order.id} order={order} passcode={passcode} adminName={adminName} onUpdated={handleUpdated} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────
export default function AdminPesanan() {
  const [passcode, setPasscode] = useState<string | null>(
    sessionStorage.getItem('dp_admin_pc')
  );
  const [adminName, setAdminName] = useState<string | null>(
    sessionStorage.getItem('dp_admin_name')
  );

  const handleLogin = (pc: string, name: string) => {
    sessionStorage.setItem('dp_admin_pc', pc);
    sessionStorage.setItem('dp_admin_name', name);
    setPasscode(pc);
    setAdminName(name);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('dp_admin_pc');
    sessionStorage.removeItem('dp_admin_name');
    setPasscode(null);
    setAdminName(null);
  };

  if (!passcode || !adminName?.trim()) return <LoginScreen onLogin={handleLogin} />;
  return <Dashboard passcode={passcode} adminName={adminName} onLogout={handleLogout} />;
}
