import React, { useState, useRef } from 'react';
import { X, Send, CheckCircle2, AlertCircle, Upload, Loader2, ShoppingCart, Copy, Check } from 'lucide-react';

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;

interface KonfirmasiPesananModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProduk?: string;
}

type FormState = 'idle' | 'submitting' | 'success' | 'error';

interface FormValues {
  nama_perusahaan: string;
  nama_pic: string;
  email: string;
  whatsapp: string;
  produk: string;
  catatan: string;
}

const EMPTY_FORM: FormValues = {
  nama_perusahaan: '',
  nama_pic: '',
  email: '',
  whatsapp: '',
  produk: '',
  catatan: '',
};

export function KonfirmasiPesananModal({
  isOpen,
  onClose,
  defaultProduk = '',
}: KonfirmasiPesananModalProps) {
  const [form, setForm] = useState<FormValues>({ ...EMPTY_FORM, produk: defaultProduk });
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<FormState>('idle');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  // Idempotency key: generated once per modal open, reused on retry, reset on close
  const idempotencyKeyRef = useRef<string>('');

  // Sync produk when defaultProduk changes (user clicks different product)
  React.useEffect(() => {
    if (isOpen) {
      setForm(prev => ({ ...prev, produk: defaultProduk }));
      setState('idle');
      setOrderId(null);
      setErrorMsg('');
      setFieldErrors({});
      setFile(null);
      // Generate a fresh idempotency key each time the modal opens
      idempotencyKeyRef.current = crypto.randomUUID();
    }
  }, [isOpen, defaultProduk]);

  const set = (field: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormValues, string>> = {};
    if (!form.nama_perusahaan.trim()) errs.nama_perusahaan = 'Wajib diisi';
    if (!form.nama_pic.trim()) errs.nama_pic = 'Wajib diisi';
    if (!form.email.trim()) errs.email = 'Wajib diisi';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Format email tidak valid';
    if (!form.whatsapp.trim()) errs.whatsapp = 'Wajib diisi';
    if (!form.produk.trim()) errs.produk = 'Wajib diisi';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setState('submitting');
    setErrorMsg('');

    try {
      const fd = new FormData();
      fd.append('nama_perusahaan', form.nama_perusahaan.trim());
      fd.append('nama_pic', form.nama_pic.trim());
      fd.append('email', form.email.trim());
      fd.append('whatsapp', form.whatsapp.trim());
      fd.append('produk', form.produk.trim());
      fd.append('catatan', form.catatan.trim());
      if (file) fd.append('bukti_pembayaran', file);

      const res = await fetch(`${API_BASE}/konfirmasi-pesanan`, {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': idempotencyKeyRef.current,
        },
        body: fd,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error((json as any).error ?? `Error ${res.status}`);
      }

      setOrderId((json as any).order_id ?? null);
      setState('success');
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Terjadi kesalahan. Coba lagi.');
      setState('error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
  };

  const handleClose = () => {
    setForm({ ...EMPTY_FORM, produk: defaultProduk });
    setFile(null);
    setState('idle');
    setOrderId(null);
    setErrorMsg('');
    setFieldErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Form Konfirmasi Pesanan"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/20 p-2 rounded-lg">
              <ShoppingCart className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="font-bold text-white text-base">Konfirmasi Pesanan</h2>
              <p className="text-slate-400 text-xs">Isi data di bawah — tim kami akan segera menghubungi Anda</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {state === 'success' ? (
            <SuccessView orderId={orderId} onClose={handleClose} />
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="p-6 space-y-4">
                {/* Error banner */}
                {state === 'error' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Nama Perusahaan"
                    required
                    error={fieldErrors.nama_perusahaan}
                  >
                    <input
                      type="text"
                      value={form.nama_perusahaan}
                      onChange={set('nama_perusahaan')}
                      placeholder="PT. Contoh Jaya Tbk"
                      className={inputCls(!!fieldErrors.nama_perusahaan)}
                    />
                  </Field>

                  <Field
                    label="Nama PIC"
                    required
                    error={fieldErrors.nama_pic}
                  >
                    <input
                      type="text"
                      value={form.nama_pic}
                      onChange={set('nama_pic')}
                      placeholder="Budi Santoso"
                      className={inputCls(!!fieldErrors.nama_pic)}
                    />
                  </Field>

                  <Field
                    label="Email"
                    required
                    error={fieldErrors.email}
                  >
                    <input
                      type="email"
                      value={form.email}
                      onChange={set('email')}
                      placeholder="pic@perusahaan.com"
                      className={inputCls(!!fieldErrors.email)}
                    />
                  </Field>

                  <Field
                    label="WhatsApp"
                    required
                    error={fieldErrors.whatsapp}
                  >
                    <input
                      type="tel"
                      value={form.whatsapp}
                      onChange={set('whatsapp')}
                      placeholder="08xxxxxxxxxx"
                      className={inputCls(!!fieldErrors.whatsapp)}
                    />
                  </Field>
                </div>

                <Field
                  label="Produk / Layanan"
                  required
                  error={fieldErrors.produk}
                >
                  <input
                    type="text"
                    value={form.produk}
                    onChange={set('produk')}
                    placeholder="Contoh: Paket Tuntas SKK Jenjang 8"
                    className={inputCls(!!fieldErrors.produk)}
                  />
                </Field>

                <Field label="Catatan (Opsional)">
                  <textarea
                    value={form.catatan}
                    onChange={set('catatan')}
                    placeholder="Informasi tambahan, deadline, atau permintaan khusus…"
                    rows={3}
                    className={`${inputCls(false)} resize-none`}
                  />
                </Field>

                {/* File upload */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Bukti Pembayaran <span className="text-slate-400 font-normal">(Opsional)</span>
                  </label>
                  <div
                    className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50/50 transition-colors group"
                    onClick={() => fileRef.current?.click()}
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <Upload className="w-5 h-5 mx-auto mb-1.5 text-slate-400 group-hover:text-amber-500 transition-colors" />
                    {file ? (
                      <p className="text-sm font-medium text-slate-700 truncate max-w-xs mx-auto">{file.name}</p>
                    ) : (
                      <p className="text-sm text-slate-500">Klik untuk upload foto/PDF transfer</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1">Maks. 10 MB · JPG, PNG, PDF</p>
                  </div>
                  {file && (
                    <button
                      type="button"
                      onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                      className="mt-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
                    >
                      Hapus file
                    </button>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 pb-6">
                <button
                  type="submit"
                  disabled={state === 'submitting'}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-900 font-bold py-3 rounded-xl transition-colors text-sm shadow-sm"
                >
                  {state === 'submitting' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Mengirim Pesanan…
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Kirim Pesanan Sekarang
                    </>
                  )}
                </button>
                <p className="text-center text-xs text-slate-400 mt-2">
                  Dengan mengirim, Anda menyetujui kami menghubungi Anda via WhatsApp/Email.
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return `w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-colors ${
    hasError
      ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200'
      : 'border-slate-200 bg-white focus:border-amber-400 focus:ring-amber-100'
  } text-slate-900 placeholder-slate-400`;
}

function SuccessView({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  const statusUrl = orderId ? `${basePath}/cek-pesanan?id=${orderId}` : `${basePath}/cek-pesanan`;

  const handleCopy = () => {
    if (!orderId) return;
    navigator.clipboard.writeText(orderId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 px-8 text-center gap-5">
      <div className="bg-emerald-100 rounded-full p-5">
        <CheckCircle2 className="w-12 h-12 text-emerald-600" />
      </div>
      <div className="w-full">
        <h3 className="text-xl font-bold text-slate-900 mb-1">Pesanan Diterima! 🎉</h3>
        {orderId && (
          <div className="mt-2 mb-3">
            <p className="text-xs text-slate-500 mb-1.5">ID Pesanan (simpan untuk cek status):</p>
            <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
              <span className="font-mono text-xs text-slate-700 flex-1 text-left break-all">{orderId}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 p-1 rounded hover:bg-slate-200 transition-colors text-slate-500 hover:text-slate-700"
                aria-label="Salin ID Pesanan"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
        <p className="text-slate-600 text-sm leading-relaxed">
          Tim kami akan menghubungi Anda dalam <strong>1×24 jam</strong> melalui WhatsApp atau Email yang terdaftar.
        </p>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 w-full">
        <p className="font-semibold mb-0.5">Langkah selanjutnya:</p>
        <p className="text-amber-700">Simpan ID pesanan Anda, dan pastikan WhatsApp Anda aktif agar konsultan kami bisa segera menjangkau Anda.</p>
      </div>
      {orderId && (
        <a
          href={statusUrl}
          className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-6 py-3 rounded-xl transition-colors text-sm border border-slate-200"
        >
          Cek Status Pesanan →
        </a>
      )}
      <button
        onClick={onClose}
        className="bg-slate-900 hover:bg-slate-700 text-white font-bold px-8 py-3 rounded-xl transition-colors text-sm w-full"
      >
        Tutup
      </button>
    </div>
  );
}
