import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNotificationAsync = vi.hoisted(() => vi.fn());

vi.mock('react-native', () => ({
  ActivityIndicator: () => React.createElement('ActivityIndicator'),
  Modal: ({ children, visible }: any) =>
    React.createElement('Modal', { visible }, children),
  Pressable: ({ children, onPress, testID }: any) =>
    React.createElement(
      'Pressable',
      { onPress, testID },
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