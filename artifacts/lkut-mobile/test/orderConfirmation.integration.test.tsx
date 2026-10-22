import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNotificationAsync = vi.hoisted(() => vi.fn());
const mockGetDocumentAsync = vi.hoisted(() => vi.fn());
const mockPlatform = vi.hoisted(() => ({ OS: 'web' }));

vi.mock('expo-document-picker', () => ({
  getDocumentAsync: mockGetDocumentAsync,
}));

vi.mock('react-native', () => ({
  Platform: mockPlatform,
  ActivityIndicator: () => React.createElement('ActivityIndicator'),
  Modal: ({ children, visible }: any) =>
    React.createElement('Modal', { visible }, children),
  Pressable: ({ children, onPress, testID, disabled }: any) =>
    React.createElement(
      'Pressable',
      { onPress, testID, disabled },
      typeof children === 'function' ? children({ pressed: false }) : children,
    ),
  ScrollView: ({ children }: any) => React.createElement('ScrollView', null, children),
  StyleSheet: { create: (styles: any) => styles },
  Text: ({ children, testID }: any) => React.createElement('Text', { testID }, children),
  TextInput: ({ testID, onChangeText, value }: any) =>
    React.createElement('TextInput', { testID, onChangeText, value }),
  View: ({ children, testID }: any) => React.createElement('View', { testID }, children),
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: any) => React.createElement('Ionicons', { name }),
}));

vi.mock('expo-haptics', () => ({
  notificationAsync: mockNotificationAsync,
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

vi.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#f8fafc',
    card: '#ffffff',
    foreground: '#0f172a',
    primaryForeground: '#ffffff',
    primary: '#0f172a',
    secondary: '#e2e8f0',
    mutedForeground: '#64748b',
    border: '#e2e8f0',
    input: '#e2e8f0',
    destructive: '#ef4444',
    accent: '#f59e0b',
    info: '#2563eb',
    infoBackground: '#eff6ff',
    infoBorder: '#bfdbfe',
    success: '#059669',
    successBackground: '#ecfdf5',
    successBorder: '#a7f3d0',
    radius: 8,
  }),
}));

import { KonfirmasiPesananModal } from '../components/KonfirmasiPesananModal';

// @ts-expect-error React test renderer reads this global in development.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FORM_VALUES = {
  'Nama Perusahaan': 'PT Contoh',
  'Nama PIC': 'Budi Santoso',
  Email: 'budi@example.com',
  WhatsApp: '08123456789',
  'Produk / Layanan': 'Paket Tuntas LKUT',
};

function renderModal() {
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      React.createElement(KonfirmasiPesananModal, {
        visible: true,
        onClose: vi.fn(),
      }),
    );
  });
  return renderer!.root;
}

function fillRequiredFields(root: ReturnType<typeof create>['root']) {
  for (const [label, value] of Object.entries(FORM_VALUES)) {
    act(() => {
      root.findByProps({ testID: `order-field-${label}` }).props.onChangeText(value);
    });
  }
}

describe('Mobile order confirmation duplicate state', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNotificationAsync.mockClear();
    mockGetDocumentAsync.mockReset();
    mockPlatform.OS = 'web';
  });

  it('renders a distinct duplicate notice when the API returns duplicate true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, order_id: 'order-123', duplicate: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const root = renderModal();
    fillRequiredFields(root);

    await act(async () => {
      root.findByProps({ testID: 'submit-order' }).props.onPress();
    });

    expect(() => root.findByProps({ testID: 'duplicate-order-success' })).not.toThrow();
    expect(() => root.findByProps({ testID: 'new-order-success' })).toThrow();
    expect(() => root.findByProps({ name: 'copy-outline' })).not.toThrow();
    expect(root.findByProps({ testID: 'order-success-title' }).props.children).toBe(
      'Pesanan sudah kami terima',
    );
    expect(root.findByProps({ testID: 'order-success-body' }).props.children).toContain(
      'Pesanan ini sudah pernah kami terima sebelumnya',
    );
  });

  it('keeps the normal success notice for a new order', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, order_id: 'order-456' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const root = renderModal();
    fillRequiredFields(root);

    await act(async () => {
      root.findByProps({ testID: 'submit-order' }).props.onPress();
    });

    expect(() => root.findByProps({ testID: 'new-order-success' })).not.toThrow();
    expect(() => root.findByProps({ testID: 'duplicate-order-success' })).toThrow();
    expect(() => root.findByProps({ name: 'checkmark-circle-outline' })).not.toThrow();
  });
});

function pickedAsset(name = 'transfer.pdf', mimeType = 'application/pdf', size = 100) {
  return {
    name, mimeType, size, uri: 'file:///cache/transfer',
    lastModified: 1,
    file: new File([new Uint8Array(size)], name, { type: mimeType }),
  };
}

async function selectProof(root: ReturnType<typeof create>['root'], asset = pickedAsset()) {
  mockGetDocumentAsync.mockResolvedValue({ canceled: false, assets: [asset] });
  await act(async () => {
    await root.findByProps({ testID: 'pick-payment-proof' }).props.onPress();
  });
}

describe('Optional payment receipt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetDocumentAsync.mockReset();
    mockPlatform.OS = 'web';
  });

  it.each(['web', 'ios', 'android'])('sends a receipt in multipart on %s', async (platform) => {
    mockPlatform.OS = platform;
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ order_id: 'with-proof' }), { status: 201 }),
    );
    const append = vi.spyOn(FormData.prototype, 'append');
    const root = renderModal();
    fillRequiredFields(root);
    const asset = pickedAsset();
    if (platform !== 'web') Reflect.deleteProperty(asset, 'file');
    await selectProof(root, asset);
    expect(mockGetDocumentAsync).toHaveBeenCalledWith({
      type: ['image/jpeg', 'image/png', 'application/pdf'],
      multiple: false, copyToCacheDirectory: true, base64: false,
    });
    await act(async () => { await root.findByProps({ testID: 'submit-order' }).props.onPress(); });
    if (platform === 'web') {
      expect(append).toHaveBeenCalledWith('bukti_pembayaran', asset.file, 'transfer.pdf');
      const body = request.mock.calls[0][1]!.body as FormData;
      expect((body.get('bukti_pembayaran') as File).size).toBe(100);
    } else {
      expect(append).toHaveBeenCalledWith('bukti_pembayaran', {
        uri: asset.uri, name: asset.name, type: 'application/pdf',
      });
    }
    expect(request.mock.calls[0][1]!.headers).not.toHaveProperty('Content-Type');
  });

  it.each(['web', 'ios', 'android'])('allows replacing, cancelling and removing on %s', async (platform) => {
    mockPlatform.OS = platform;
    const root = renderModal();
    await selectProof(root);
    await selectProof(root, pickedAsset('baru.png', 'image/png'));
    expect(root.findByProps({ testID: 'payment-proof-name' }).props.children).toBe('baru.png');
    mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    await act(async () => { await root.findByProps({ testID: 'pick-payment-proof' }).props.onPress(); });
    expect(root.findByProps({ testID: 'payment-proof-name' }).props.children).toBe('baru.png');
    act(() => { root.findByProps({ testID: 'remove-payment-proof' }).props.onPress(); });
    expect(root.findAllByProps({ testID: 'payment-proof-name' })).toHaveLength(0);
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ order_id: 'without-proof' }), { status: 201 }),
    );
    fillRequiredFields(root);
    await act(async () => { await root.findByProps({ testID: 'submit-order' }).props.onPress(); });
    expect((request.mock.calls[0][1]!.body as FormData).has('bukti_pembayaran')).toBe(false);
  });

  it('rejects unsupported and oversized files without replacing a valid selection', async () => {
    const root = renderModal();
    await selectProof(root);
    await selectProof(root, pickedAsset('virus.exe', 'application/octet-stream'));
    expect(root.findByProps({ testID: 'payment-proof-error' }).props.children).toContain('JPG, PNG');
    expect(root.findByProps({ testID: 'payment-proof-name' }).props.children).toBe('transfer.pdf');
    await selectProof(root, pickedAsset('large.pdf', 'application/pdf', 10 * 1024 * 1024 + 1));
    expect(root.findByProps({ testID: 'payment-proof-error' }).props.children).toContain('10 MB');
  });

  it('reports picker failures and lets the buyer try again', async () => {
    const root = renderModal();
    mockGetDocumentAsync.mockRejectedValue(new Error('Permission denied'));
    await act(async () => { await root.findByProps({ testID: 'pick-payment-proof' }).props.onPress(); });
    expect(root.findByProps({ testID: 'payment-proof-error' }).props.children).toContain('coba lagi');
    expect(root.findByProps({ testID: 'pick-payment-proof' }).props.disabled).toBe(false);
    await selectProof(root);
    expect(root.findAllByProps({ testID: 'payment-proof-error' })).toHaveLength(0);
  });

  it('preserves proof after a failed submission so the buyer can retry', async () => {
    const request = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ order_id: 'retried' }), { status: 201 }));
    const root = renderModal();
    fillRequiredFields(root);
    await selectProof(root);
    await act(async () => { await root.findByProps({ testID: 'submit-order' }).props.onPress(); });
    expect(root.findByProps({ testID: 'payment-proof-name' }).props.children).toBe('transfer.pdf');
    await act(async () => { await root.findByProps({ testID: 'submit-order' }).props.onPress(); });
    expect((request.mock.calls[1][1]!.body as FormData).has('bukti_pembayaran')).toBe(true);
    expect(request.mock.calls[1][1]!.headers).toEqual(request.mock.calls[0][1]!.headers);
  });

  it('clears a selected receipt when reopening the form', async () => {
    let renderer: ReturnType<typeof create>;
    const props = { visible: true, onClose: vi.fn() };
    act(() => { renderer = create(React.createElement(KonfirmasiPesananModal, props)); });
    await selectProof(renderer!.root);
    act(() => { renderer.update(React.createElement(KonfirmasiPesananModal, { ...props, visible: false })); });
    act(() => { renderer.update(React.createElement(KonfirmasiPesananModal, props)); });
    expect(renderer!.root.findAllByProps({ testID: 'payment-proof-name' })).toHaveLength(0);
  });

  it('ignores a picker result that arrives after the form closes', async () => {
    let renderer: ReturnType<typeof create>;
    const props = { visible: true, onClose: vi.fn() };
    act(() => { renderer = create(React.createElement(KonfirmasiPesananModal, props)); });
    let resolvePicker!: (value: unknown) => void;
    mockGetDocumentAsync.mockReturnValue(new Promise((resolve) => { resolvePicker = resolve; }));
    let pending!: Promise<void>;
    act(() => { pending = renderer.root.findByProps({ testID: 'pick-payment-proof' }).props.onPress(); });
    act(() => { renderer.update(React.createElement(KonfirmasiPesananModal, { ...props, visible: false })); });
    await act(async () => {
      resolvePicker({ canceled: false, assets: [pickedAsset()] });
      await pending;
    });
    act(() => { renderer.update(React.createElement(KonfirmasiPesananModal, props)); });
    expect(renderer!.root.findAllByProps({ testID: 'payment-proof-name' })).toHaveLength(0);
  });
});