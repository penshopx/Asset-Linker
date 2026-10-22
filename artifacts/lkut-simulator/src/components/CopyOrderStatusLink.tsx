import { useState } from 'react';
import { Copy } from 'lucide-react';
import { getOrderStatusUrl } from '@/lib/orderSummaryStorage';

export function CopyOrderStatusLink({ orderId }: { orderId: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'success' | 'error'>('idle');
  const [manualUrl, setManualUrl] = useState('');

  async function copyLink() {
    setCopyState('copying');
    const url = new URL(
      getOrderStatusUrl(import.meta.env.BASE_URL, orderId),
      window.location.origin,
    ).href;

    try {
      await navigator.clipboard.writeText(url);
      setManualUrl('');
      setCopyState('success');
    } catch {
      setManualUrl(url);
      setCopyState('error');
    }
  }

  return (
    <div className="px-6 pb-5">
      <button
        type="button"
        onClick={copyLink}
        disabled={copyState === 'copying'}
        className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
      >
        <Copy className="w-4 h-4" aria-hidden="true" />
        {copyState === 'copying' ? 'Menyalin tautan…' : 'Salin tautan status pesanan'}
      </button>
      <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-sm text-slate-700">
        {copyState === 'success' && 'Tautan status pesanan berhasil disalin.'}
        {copyState === 'error' && 'Tautan gagal disalin otomatis. Salin secara manual dari kolom di bawah.'}
      </p>
      {copyState === 'error' && (
        <label className="block mt-3 text-sm font-medium text-slate-700">
          Tautan status pesanan
          <input
            type="text"
            readOnly
            value={manualUrl}
            onFocus={event => event.currentTarget.select()}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
        </label>
      )}
    </div>
  );
}
