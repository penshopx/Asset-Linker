import type { DocumentPickerAsset } from 'expo-document-picker';

export const MAX_PROOF_BYTES = 10 * 1024 * 1024;
export const PROOF_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
};

export function validatePaymentProof(asset: DocumentPickerAsset): string | null {
  const extension = asset.name.split('.').pop()?.toLowerCase() ?? '';
  const expectedMime = MIME_BY_EXTENSION[extension];
  const mime = (asset.file?.type || asset.mimeType || '').toLowerCase();
  if (!expectedMime || (mime && mime !== 'application/octet-stream' && mime !== expectedMime)) {
    return 'Gunakan berkas JPG, PNG, atau PDF.';
  }
  const size = asset.file?.size ?? asset.size;
  if (size === undefined || !Number.isFinite(size) || size <= 0) {
    return 'Ukuran berkas tidak dapat dibaca atau berkas kosong. Pilih berkas lain.';
  }
  if (size > MAX_PROOF_BYTES) return 'Ukuran bukti pembayaran maksimal 10 MB.';
  if (!asset.uri) return 'Berkas tidak dapat dibaca. Pilih berkas lain.';
  return null;
}

export function appendPaymentProof(
  body: FormData,
  asset: DocumentPickerAsset,
  platform: string,
): void {
  const error = validatePaymentProof(asset);
  if (error) throw new Error(error);
  if (platform === 'web') {
    if (!asset.file) throw new Error('Berkas tidak dapat dibaca. Silakan pilih ulang.');
    body.append('bukti_pembayaran', asset.file, asset.name);
  } else {
    // React Native's FormData accepts a local URI descriptor, not a browser File.
    body.append('bukti_pembayaran', {
      uri: asset.uri,
      name: asset.name,
      type: MIME_BY_EXTENSION[asset.name.split('.').pop()!.toLowerCase()],
    } as unknown as Blob);
  }
}

export function releasePaymentProof(asset: DocumentPickerAsset | null, platform: string): void {
  if (platform === 'web' && asset?.uri.startsWith('blob:')) {
    URL.revokeObjectURL(asset.uri);
  }
}
