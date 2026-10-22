import { describe, expect, it, vi } from 'vitest';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { appendPaymentProof, MAX_PROOF_BYTES, releasePaymentProof, validatePaymentProof } from './paymentProof';

const asset = (overrides: Partial<DocumentPickerAsset> = {}): DocumentPickerAsset => ({
  name: 'transfer.pdf',
  mimeType: 'application/pdf',
  size: 100,
  uri: 'file:///cache/transfer.pdf',
  lastModified: 1,
  ...overrides,
});

describe('Payment proof validation', () => {
  it.each([
    ['receipt.JPG', 'image/jpeg'], ['receipt.jpeg', 'image/jpeg'],
    ['receipt.png', 'image/png'], ['receipt.pdf', 'application/pdf'],
  ])('accepts %s up to the exact 10 MB limit', (name, mimeType) => {
    expect(validatePaymentProof(asset({ name, mimeType, size: MAX_PROOF_BYTES }))).toBeNull();
  });
  it.each([undefined, NaN, Infinity, -1, 0, MAX_PROOF_BYTES + 1])('rejects invalid size %s', (size) => {
    expect(validatePaymentProof(asset({ size }))).not.toBeNull();
  });
  it('accepts an inferred MIME type but rejects a conflicting one', () => {
    expect(validatePaymentProof(asset({ mimeType: undefined }))).toBeNull();
    expect(validatePaymentProof(asset({ mimeType: 'application/octet-stream' }))).toBeNull();
    expect(validatePaymentProof(asset({ mimeType: 'image/jpeg' }))).not.toBeNull();
    expect(validatePaymentProof(asset({ name: 'transfer.gif', mimeType: 'image/gif' }))).not.toBeNull();
  });
  it('validates again when constructing the request', () => {
    expect(() => appendPaymentProof(new FormData(), asset({ size: 0 }), 'ios')).toThrow();
    expect(() => appendPaymentProof(new FormData(), asset(), 'web')).toThrow('pilih ulang');
  });
  it('releases browser blob URLs only', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    releasePaymentProof(asset({ uri: 'blob:receipt' }), 'web');
    releasePaymentProof(asset(), 'ios');
    releasePaymentProof(null, 'web');
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:receipt');
    revoke.mockRestore();
  });
});
