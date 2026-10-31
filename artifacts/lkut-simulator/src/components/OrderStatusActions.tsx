import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { CopyOrderStatusLink } from './CopyOrderStatusLink';
import { getOrderStatusUrl } from '@/lib/orderSummaryStorage';

export function OrderStatusActions({ orderId }: { orderId: string }) {
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function shareLink() {
    setShareError('');
    setSharing(true);
    try {
      const url = new URL(
        getOrderStatusUrl(import.meta.env.BASE_URL, orderId),
        window.location.origin,
      ).href;
      await navigator.share({ title: 'Status Pesanan', url });
    } catch (error) {
      if (!(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')) {
        setShareError('Tautan belum dapat dibagikan. Gunakan tombol Salin tautan status pesanan.');
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      {canShare && (
        <div className="px-6 pb-3">
          <button
            type="button"
            onClick={shareLink}
            disabled={sharing}
            className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <Share2 className="w-4 h-4" aria-hidden="true" />
            {sharing ? 'Membuka menu berbagi…' : 'Bagikan'}
          </button>
          <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-sm text-slate-700">
            {shareError}
          </p>
        </div>
      )}
      <CopyOrderStatusLink orderId={orderId} />
    </>
  );
}
