/**
 * Attribution Sniper — tracks leads referred by the Intel Platform (Sniper).
 * All functions are pure and side-effect-safe (localStorage + fetch only).
 */

const STORAGE_KEY = 'sniper_attribution';

export interface SniperAttribution {
  src: string;
  pt: string;   // slug perusahaan
  tag: string;  // kategori masalah (e.g. "SMAP")
  timestamp: number;
}

/**
 * Call on page load.
 * Reads ?src=sniper&pt=...&tag=... from URL; persists to localStorage if found.
 * Returns the active attribution (from URL or existing localStorage).
 */
export function captureFromURL(): SniperAttribution | null {
  const params = new URLSearchParams(window.location.search);
  const src = params.get('src');

  if (src !== 'sniper') return getAttribution();

  const pt = params.get('pt') ?? '';
  const tag = params.get('tag') ?? '';
  const attr: SniperAttribution = { src, pt, tag, timestamp: Date.now() };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attr));
  } catch {
    /* storage unavailable — proceed without persistence */
  }

  return attr;
}

/** Reads persisted attribution from localStorage. */
export function getAttribution(): SniperAttribution | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SniperAttribution) : null;
  } catch {
    return null;
  }
}

/** Appends ?ref=sniper_[pt] to any URL (handles existing query strings). */
export function appendRef(url: string, pt: string): string {
  if (!pt) return url;
  const ref = `sniper_${pt}`;
  try {
    const u = new URL(url);
    u.searchParams.set('ref', ref);
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}ref=${encodeURIComponent(ref)}`;
  }
}

/**
 * Fire-and-forget POST to Intel Platform.
 * grade: the LKUT grade string (e.g. "A+", "B", "D")
 * Non-blocking — never throws to the caller.
 */
export async function fireWebhook(
  pt: string,
  tag: string,
  grade: string
): Promise<void> {
  const simulatorResult = grade.startsWith('A')
    ? 'HIJAU'
    : grade.startsWith('B') || grade.startsWith('C')
    ? 'KUNING'
    : 'MERAH';

  try {
    await fetch(
      'https://sniper-insight-ai.replit.app/api/sniper-leads/track-attribution',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pt, tag, simulator_result: simulatorResult }),
      }
    );
  } catch (e) {
    console.warn('[sniper] Webhook failed (non-blocking):', e);
  }
}
