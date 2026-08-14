import { useState, useEffect } from 'react';
import { Search, Package, Clock, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;

type OrderStatus = 'baru' | 'diproses' | 'selesai' | 'dibatalkan';

interface StatusHistoryEntry {
  status: OrderStatus;
  changed_at: string;
}

interface OrderData {
  id: string;
  status: OrderStatus;
  produk: string;
  created_at: string;
  updated_at: string;
  history: StatusHistoryEntry[];
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; border: string; dot: string; Icon: React.ElementType }> = {
  baru: {
    label: 'Pesanan Baru',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
    Icon: Clock,
  },
  diproses: {
    label: 'Sedang Diproses',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    Icon: Package,
  },
  selesai: {
    label: 'Selesai',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    Icon: CheckCircle2,
  },
  dibatalkan: {
    label: 'Dibatalkan',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    dot: 'bg-red-500',
    Icon: XCircle,
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function fetchOrder(id: string): Promise<{ order?: OrderData; notFound?: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/pesanan/${encodeURIComponent(id)}`);
    if (res.status === 404) return { notFound: true };
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      return { error: (json as any).error ?? `Error ${res.status}` };
    }
    const data = await res.json();
    // Ensure history is always an array
    if (!Array.isArray(data.history)) data.history = [];
    return { order: data };
  } catch (err: any) {
    return { error: err.message ?? 'Terjadi kesalahan. Coba lagi.' };
  }
}

export default function CekPesanan() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-search if ?id= is present in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    if (idParam) {
      setInput(idParam);
      setLoading(true);
      fetchOrder(idParam).then(result => {
        if (result.order) setOrder(result.order);
        else if (result.notFound) setNotFound(true);
        else if (result.error) setErrorMsg(result.error);
        setLoading(false);
      });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = input.trim();
    if (!id) return;

    setLoading(true);
    setOrder(null);
    setNotFound(false);
    setErrorMsg('');

    const result = await fetchOrder(id);
    if (result.order) setOrder(result.order);
    else if (result.notFound) setNotFound(true);
    else if (result.error) setErrorMsg(result.error);
    setLoading(false);
  };

  const statusCfg = order ? STATUS_CONFIG[order.status] ?? STATUS_CONFIG.baru : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-start px-4 py-16">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center bg-amber-500/20 rounded-full p-4 mb-4">
          <Search className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Cek Status Pesanan</h1>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">
          Masukkan Order ID yang Anda terima setelah mengirim pesanan untuk melihat progres terkini.
        </p>
      </div>

      {/* Search box */}
      <div className="w-full max-w-md">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Masukkan Order ID…"
            className="flex-1 rounded-xl border border-slate-600 bg-slate-800 text-white placeholder-slate-500 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-bold px-5 py-3 rounded-xl transition-colors text-sm shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Cek
          </button>
        </form>

        {/* Results */}
        <div className="mt-6">
          {/* Not found */}
          {notFound && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center">
              <AlertCircle className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-300 font-semibold">Pesanan tidak ditemukan</p>
              <p className="text-slate-500 text-sm mt-1">Pastikan Order ID yang Anda masukkan sudah benar.</p>
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="bg-red-900/30 border border-red-700 rounded-2xl p-4 flex items-start gap-3 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Order card */}
          {order && statusCfg && (
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              {/* Status banner */}
              <div className={`${statusCfg.bg} ${statusCfg.border} border-b px-6 py-4 flex items-center gap-3`}>
                <statusCfg.Icon className={`w-6 h-6 ${statusCfg.color} shrink-0`} />
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Status Pesanan</p>
                  <p className={`text-lg font-bold ${statusCfg.color}`}>{statusCfg.label}</p>
                </div>
              </div>

              {/* Details */}
              <div className="px-6 py-5 space-y-4">
                <DetailRow label="Order ID">
                  <span className="font-mono text-xs bg-slate-100 rounded px-2 py-0.5 text-slate-600 break-all">
                    {order.id}
                  </span>
                </DetailRow>
                <DetailRow label="Produk / Layanan">
                  <span className="text-slate-800 text-sm font-medium">{order.produk}</span>
                </DetailRow>
                <DetailRow label="Tanggal Pesanan">
                  <span className="text-slate-600 text-sm">{formatDate(order.created_at)}</span>
                </DetailRow>
                <DetailRow label="Terakhir Diperbarui">
                  <span className="text-slate-600 text-sm">{formatDate(order.updated_at)}</span>
                </DetailRow>
              </div>

              {/* Status timeline */}
              {order.history.length > 0 && (
                <div className="px-6 pb-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    Riwayat Status
                  </p>
                  <StatusTimeline history={order.history} currentStatus={order.status} />
                </div>
              )}

              <div className="px-6 pb-5">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  Ada pertanyaan? Hubungi tim kami via WhatsApp dengan menyertakan Order ID Anda.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Back link */}
      <a
        href={import.meta.env.BASE_URL || '/'}
        className="mt-10 text-slate-500 hover:text-slate-300 text-sm transition-colors"
      >
        ← Kembali ke Simulator
      </a>
    </div>
  );
}

function StatusTimeline({ history, currentStatus }: { history: StatusHistoryEntry[]; currentStatus: OrderStatus }) {
  return (
    <ol className="relative border-l border-slate-200 ml-2 space-y-0">
      {history.map((entry, idx) => {
        const cfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.baru;
        const isLast = idx === history.length - 1;
        const Icon = cfg.Icon;
        return (
          <li key={idx} className={`ml-4 ${isLast ? 'pb-0' : 'pb-5'}`}>
            {/* Dot on the timeline line */}
            <span
              className={`absolute -left-[9px] flex items-center justify-center w-[18px] h-[18px] rounded-full ring-2 ring-white ${isLast ? cfg.dot : 'bg-slate-300'}`}
            />
            <div className={`flex items-start gap-2 ${isLast ? '' : 'opacity-70'}`}>
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${isLast ? cfg.color : 'text-slate-400'}`} />
              <div>
                <p className={`text-sm font-semibold leading-tight ${isLast ? cfg.color : 'text-slate-500'}`}>
                  {cfg.label}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{formatDate(entry.changed_at)}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-slate-500 text-sm shrink-0">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}
