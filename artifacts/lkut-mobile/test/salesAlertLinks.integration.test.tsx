/**
 * Integration test: Sales alert product links open the correct URL.
 *
 * Unit tests in salesEngine.test.ts verify that getSalesAlerts() returns the
 * right href strings. This file adds the missing layer: it renders the actual
 * Step4 component tree and confirms that pressing each alert product button
 * calls Linking.openURL with the URL that comes out of getSalesAlerts().
 *
 * A broken import path, wrong prop name, or incorrect openURL wiring would be
 * invisible to pure unit tests but caught here.
 *
 * Covers:
 *   • SKK primary link (alert.id = 'skk', pIdx = 0)
 *   • BUJKA sewa-peralatan link (alert.id = 'alat', href includes 'sewa-peralatan-sbu-bujka')
 *   • PUB warning banner: opens the in-app browser for B/C/D, absent for A/AA/AAA
 *   • Prioritas Perbaikan: HR opens Gaia, GCG/operations open DP Store
 *   • Hitung Ulang: calls onReset once without opening any link
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create, act } from 'react-test-renderer';
import { Alert, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// ─── Hoist the Linking mock so it is available inside vi.mock factories ───────
const mockOpenURL = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockOpenBrowser = vi.hoisted(() => vi.fn().mockResolvedValue({ type: 'dismiss' }));
const mockAlert = vi.hoisted(() => vi.fn());
const mockSetString = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock('expo-clipboard', () => ({
  setStringAsync: mockSetString,
}));

vi.mock('expo-web-browser', () => ({
  openBrowserAsync: mockOpenBrowser,
}));

vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn(),
}));

// ─── React Native stubs ───────────────────────────────────────────────────────
// Replaces native modules with plain React elements so react-test-renderer
// can render the component tree in Node without a native runtime.
vi.mock('react-native', () => ({
  Modal: ({ children, onRequestClose }: any) =>
    React.createElement('Modal', { onRequestClose }, children),
  View: ({ children, testID, style }: any) =>
    React.createElement('View', { testID }, children),
  Text: ({ children, style, numberOfLines }: any) =>
    React.createElement('Text', null, children),
  Pressable: ({ children, onPress, testID, style }: any) =>
    React.createElement(
      'Pressable',
      { testID, onPress },
      typeof children === 'function' ? children({ pressed: false }) : children,
    ),
  ScrollView: ({ children }: any) => React.createElement('ScrollView', null, children),
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  Platform: { OS: 'ios', select: (s: any) => s.ios ?? s.default },
  Linking: { openURL: mockOpenURL },
  Alert: { alert: mockAlert },
  useColorScheme: () => 'light',
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn().mockResolvedValue(undefined),
  notificationAsync: vi.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Error: 'Error', Success: 'Success', Warning: 'Warning' },
}));

vi.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name, size, color }: any) =>
    React.createElement('Ionicons', { name, size, color }),
}));

// Return a fixed colour palette so the component renders without a native
// colour-scheme query.
vi.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    background: '#f8fafc',
    card: '#ffffff',
    cardForeground: '#0f172a',
    primary: '#0f172a',
    primaryForeground: '#ffffff',
    secondary: '#e2e8f0',
    secondaryForeground: '#0f172a',
    muted: '#e2e8f0',
    mutedForeground: '#64748b',
    accent: '#f59e0b',
    accentForeground: '#0f172a',
    destructive: '#ef4444',
    destructiveForeground: '#ffffff',
    border: '#e2e8f0',
    input: '#e2e8f0',
    text: '#0f172a',
    tint: '#f59e0b',
    radius: 8,
  }),
}));

// Provide form data through the context; each test overrides as needed.
const mockFormData = {
  kualifikasi: 'Menengah',
  assetGrowth: 15,
  gpm: 12,
  assetTurnover: 75,
  currentRatio: 120,
  der: 200,
  fcf: 2.5,
  gcgYears: 10,
  certificates: 7,
  awards: 2,
  moSupplyChain: 10,
  moMaterialQuality: 10,
  moEquipmentQuality: 10,
  moK3: 10,
  moProcedures: 10,
  moResultQuality: 10,
  moOM: 10,
  moSocialProtection: 10,
  moEnvironment: 10,
  equipmentRatio: 2,
  equipmentNewness: 40,
  hrProductivity: 2500,
  hrEmpowerment: 35,
  companyCapacity: 8,
  projectScore: 75,
  // Trigger-sensitive fields: safe defaults (no alerts)
  skkMonthsLeft: 12,
  hasSmap: true,
};

let currentFormData = { ...mockFormData };

vi.mock('@/context/FormContext', () => ({
  useForm: () => ({
    data: currentFormData,
    setField: vi.fn(),
    reset: vi.fn(),
  }),
}));

// ─── Import the real component after all mocks are in place ──────────────────
// eslint-disable-next-line import/first
import { Step4 } from '../components/steps/Step4';
import { THRESHOLDS } from '../lib/lkutCalculator';

// Required by react-test-renderer so act() behaves correctly in a Node env.
// Must be set before any rendering occurs.
// @ts-expect-error — global not typed in Node env
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE = 'https://bayar.gustafta.my.id/p';

/**
 * Render Step4 with react-test-renderer and return the root instance.
 * Wraps in act() so effects / state updates flush before we query.
 */
function renderStep4(onReset: () => void = vi.fn()) {
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(Step4, { onReset }));
  });
  return renderer!.root;
}

/**
 * Find a rendered element by testID and press it.
 * Throws if the element does not exist, making missing-button errors explicit.
 */
function pressByTestID(root: ReturnType<typeof create>['root'], testID: string) {
  const el = root.findByProps({ testID });
  act(() => {
    el.props.onPress();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Sales alert product links — integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenURL.mockReset().mockResolvedValue(undefined);
    mockOpenBrowser.mockReset().mockResolvedValue({ type: 'dismiss' });
    mockSetString.mockReset().mockResolvedValue(true);
    Platform.OS = 'ios';
    // Reset to safe defaults before each test so mocks don't bleed across.
    currentFormData = { ...mockFormData };
  });

  describe('Hitung Ulang', () => {
    it('calls onReset exactly once without opening a link', () => {
      const onReset = vi.fn();
      const root = renderStep4(onReset);

      expect(onReset).not.toHaveBeenCalled();

      pressByTestID(root, 'reset-btn');

      expect(onReset).toHaveBeenCalledTimes(1);
      expect(mockOpenURL).not.toHaveBeenCalled();
      expect(mockOpenBrowser).not.toHaveBeenCalled();
    });
  });

  describe('PUB warning banner', () => {
    // Use real threshold endpoints to give every management indicator the same
    // score (60 or 100), without mocking Step4's grade calculation.
    function formDataAtBandEnd(band: 2 | 4, projectScore: number) {
      return {
        ...Object.fromEntries(
          Object.entries(mockFormData).map(([key, value]) => {
            const thresholdKey = key.startsWith('mo') ? 'mo' : key;
            const bands = THRESHOLDS[thresholdKey as keyof typeof THRESHOLDS];
            return [key, bands ? bands[band][1] : value];
          }),
        ) as typeof mockFormData,
        projectScore,
      };
    }

    it.each([
      { grade: 'B', projectScore: 50 },
      { grade: 'C', projectScore: 25 },
      { grade: 'D', projectScore: 0 },
    ])('shows a working PUB link for grade $grade', ({ grade, projectScore }) => {
      currentFormData = formDataAtBandEnd(2, projectScore);
      const root = renderStep4();

      expect(root.findByProps({ testID: 'grade-display' }).props.children).toEqual(['Grade ', grade]);
      expect(mockOpenURL).not.toHaveBeenCalled();

      pressByTestID(root, 'warning-banner');

      expect(mockOpenBrowser).toHaveBeenCalledTimes(1);
      expect(mockOpenBrowser).toHaveBeenCalledWith('https://dp.dokumenproyek.com');
      expect(mockOpenURL).not.toHaveBeenCalled();
    });

    it.each([
      { grade: 'A', band: 2 as const, projectScore: 75 },
      { grade: 'AA', band: 2 as const, projectScore: 100 },
      { grade: 'AAA', band: 4 as const, projectScore: 100 },
    ])('does not render the PUB banner for grade $grade', ({ grade, band, projectScore }) => {
      currentFormData = formDataAtBandEnd(band, projectScore);
      const root = renderStep4();

      expect(root.findByProps({ testID: 'grade-display' }).props.children).toEqual(['Grade ', grade]);
      expect(root.findAllByProps({ testID: 'warning-banner' })).toHaveLength(0);
      expect(mockOpenURL).not.toHaveBeenCalled();
      expect(mockOpenBrowser).not.toHaveBeenCalled();
    });

    it('shows a failure message without falling back to the external browser', async () => {
      currentFormData = formDataAtBandEnd(2, 50);
      mockOpenBrowser.mockRejectedValueOnce(new Error('Browser unavailable'));
      const root = renderStep4();

      await act(async () => {
        await root.findByProps({ testID: 'warning-banner' }).props.onPress();
      });

      expect(mockAlert).toHaveBeenCalledWith(
        'Tautan belum dapat dibuka',
        'Silakan coba lagi untuk membuka konsultasi PUB.',
      );
      expect(mockOpenURL).not.toHaveBeenCalled();
    });

    it('closing the in-app browser does not show a failure message', async () => {
      currentFormData = formDataAtBandEnd(2, 50);
      const root = renderStep4();

      await act(async () => {
        await root.findByProps({ testID: 'warning-banner' }).props.onPress();
      });

      expect(mockOpenBrowser).toHaveBeenCalledTimes(1);
      expect(mockAlert).not.toHaveBeenCalled();
      expect(mockOpenURL).not.toHaveBeenCalled();
    });
  });

  describe('Prioritas Perbaikan action links', () => {
    it.each([
      { key: 'hrEmpowerment', url: 'https://gaia.dokumenproyek.com' },
      { key: 'gcgYears', url: 'https://dp.dokumenproyek.com' },
      { key: 'moSupplyChain', url: 'https://dp.dokumenproyek.com' },
    ] as const)('pressing action-btn-$key opens $url exactly once', async ({ key, url }) => {
      // Make the target the lowest-scoring indicator using the real calculator,
      // so Step4 must render its recommendation rather than a mocked action.
      currentFormData = { ...mockFormData, [key]: 0 };
      const root = renderStep4();
      const actionCenter = root.findByProps({ testID: 'action-center' });
      const button = actionCenter.findByProps({ testID: `action-btn-${key}` });

      expect(mockOpenURL).not.toHaveBeenCalled();

      await act(async () => {
        await button.props.onPress();
      });

      expect(mockOpenURL).toHaveBeenCalledTimes(1);
      expect(mockOpenURL).toHaveBeenCalledWith(url);
      expect(mockOpenBrowser).not.toHaveBeenCalled();
    });
  });

  // ── SKK primary link ───────────────────────────────────────────────────────

  describe('SKK alert (skkMonthsLeft ≤ 3)', () => {
    it('renders the SKK primary product button when skkMonthsLeft = 1', () => {
      currentFormData = { ...mockFormData, skkMonthsLeft: 1, kualifikasi: 'Menengah' };
      const root = renderStep4();

      // The alert card and the primary product button must both be present.
      expect(() => root.findByProps({ testID: 'sales-alert-skk' })).not.toThrow();
      expect(() => root.findByProps({ testID: 'alert-product-skk-0' })).not.toThrow();
    });

    it('tapping SKK primary button calls Linking.openURL with the jenjang-8 URL', () => {
      currentFormData = { ...mockFormData, skkMonthsLeft: 1, kualifikasi: 'Menengah' };
      const root = renderStep4();

      pressByTestID(root, 'alert-product-skk-0');

      expect(mockOpenURL).toHaveBeenCalledTimes(1);
      expect(mockOpenURL).toHaveBeenCalledWith(
        `${BASE}/paket-tuntas-pkb-skk-jenjang-8`,
      );
    });

    it('tapping SKK primary button for kualifikasi Kecil calls jenjang-7 URL', () => {
      currentFormData = { ...mockFormData, skkMonthsLeft: 2, kualifikasi: 'Kecil' };
      const root = renderStep4();

      pressByTestID(root, 'alert-product-skk-0');

      expect(mockOpenURL).toHaveBeenCalledWith(
        `${BASE}/paket-tuntas-pkb-skk-jenjang-7`,
      );
    });

    it('tapping SKK secondary button calls the last-minute exec-summary URL', () => {
      currentFormData = { ...mockFormData, skkMonthsLeft: 1, kualifikasi: 'Menengah' };
      const root = renderStep4();

      pressByTestID(root, 'alert-product-skk-1');

      expect(mockOpenURL).toHaveBeenCalledWith(
        `${BASE}/exec-summary-pkb-siap-perpanjangan-skk`,
      );
    });

    it('SKK alert is NOT rendered when skkMonthsLeft = 4 and certificates score is healthy', () => {
      // skkMonthsLeft: 12 → no expiry; certificates: 7 → score ≥ 50 → no alert
      currentFormData = { ...mockFormData, skkMonthsLeft: 12, kualifikasi: 'Menengah' };
      const root = renderStep4();

      expect(() => root.findByProps({ testID: 'sales-alert-skk' })).toThrow();
    });
  });

  // ── BUJKA sewa-peralatan link ──────────────────────────────────────────────

  describe('Sewa Peralatan alert (BUJKA) — highest-risk path', () => {
    /** equipmentRatio = 0 → calculateScore returns 0 → score < 60 → alert fires */
    const equipmentLowData = {
      ...mockFormData,
      kualifikasi: 'BUJKA',
      equipmentRatio: 0,
      equipmentNewness: 0,
      skkMonthsLeft: 12, // keep other alerts silent
      hasSmap: true,
    };

    it('renders the alat alert card when equipment scores are low', () => {
      currentFormData = { ...equipmentLowData };
      const root = renderStep4();

      expect(() => root.findByProps({ testID: 'sales-alert-alat' })).not.toThrow();
    });

    it('tapping sewa-peralatan button calls the BUJKA-specific URL', () => {
      currentFormData = { ...equipmentLowData };
      const root = renderStep4();

      // alat products: [0] Cheat Sheet (primary), [1] Jasa Input, [2] Sewa Peralatan (kualifikasi-specific)
      pressByTestID(root, 'alert-product-alat-2');

      expect(mockOpenURL).toHaveBeenCalledTimes(1);
      expect(mockOpenURL).toHaveBeenCalledWith(
        `${BASE}/sewa-peralatan-sbu-bujka-asing-3-tahun`,
      );
    });

    it('alat alert is NOT rendered when equipment scores are healthy', () => {
      // equipmentRatio: 2 → score ~ 80; equipmentNewness: 40 → score ~ 60 → no alert
      currentFormData = { ...mockFormData, kualifikasi: 'BUJKA' };
      const root = renderStep4();

      expect(() => root.findByProps({ testID: 'sales-alert-alat' })).toThrow();
    });
  });

  // ── Linking.openURL is the exact integration seam ─────────────────────────

  describe('Linking.openURL integration seam', () => {
    it('uses medium-impact feedback without an alert when a product link opens', async () => {
      currentFormData = { ...mockFormData, skkMonthsLeft: 1 };
      const root = renderStep4();

      await act(async () => {
        await root.findByProps({ testID: 'alert-product-skk-0' }).props.onPress();
      });

      expect(Haptics.impactAsync).toHaveBeenCalledExactlyOnceWith(Haptics.ImpactFeedbackStyle.Medium);
      expect(Haptics.notificationAsync).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('shows an alert and error haptic on rejection, then allows a successful retry', async () => {
      mockOpenURL.mockRejectedValueOnce(new Error('No browser available'));
      currentFormData = { ...mockFormData, skkMonthsLeft: 1 };
      const root = renderStep4();
      const button = root.findByProps({ testID: 'alert-product-skk-0' });

      await act(async () => {
        await button.props.onPress();
      });

      expect(mockOpenURL).toHaveBeenCalledExactlyOnceWith(`${BASE}/paket-tuntas-pkb-skk-jenjang-8`);
      expect(Alert.alert).toHaveBeenCalledExactlyOnceWith(
        'Tautan tidak dapat dibuka',
        `Silakan coba lagi atau buka tautan melalui browser Anda.\n\n${BASE}/paket-tuntas-pkb-skk-jenjang-8`,
        [
          { text: 'Tutup', style: 'cancel' },
          { text: 'Salin tautan', onPress: expect.any(Function) },
        ],
      );
      expect(Haptics.notificationAsync).toHaveBeenCalledExactlyOnceWith(Haptics.NotificationFeedbackType.Error);
      expect(Haptics.impactAsync).not.toHaveBeenCalled();

      await act(async () => {
        await button.props.onPress();
      });

      expect(mockOpenURL).toHaveBeenCalledTimes(2);
      expect(Alert.alert).toHaveBeenCalledTimes(1);
      expect(Haptics.impactAsync).toHaveBeenCalledExactlyOnceWith(Haptics.ImpactFeedbackStyle.Medium);
    });

    it('shows a dismissible copy dialog when a product link fails on web', async () => {
      Platform.OS = 'web';
      mockOpenURL.mockRejectedValueOnce(new Error('Link blocked'));
      currentFormData = { ...mockFormData, skkMonthsLeft: 1 };
      const root = renderStep4();

      await act(async () => {
        await root.findByProps({ testID: 'alert-product-skk-0' }).props.onPress();
      });

      expect(root.findByProps({ testID: 'link-failure-url' }).props.children).toBe(
        `${BASE}/paket-tuntas-pkb-skk-jenjang-8`,
      );
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mockSetString).not.toHaveBeenCalled();
      expect(Haptics.notificationAsync).toHaveBeenCalledExactlyOnceWith(Haptics.NotificationFeedbackType.Error);
      expect(Haptics.impactAsync).not.toHaveBeenCalled();
      pressByTestID(root, 'link-failure-close');
      expect(root.findAllByProps({ testID: 'link-failure-dialog' })).toHaveLength(0);
      expect(mockSetString).not.toHaveBeenCalled();
    });

    it('openURL is NOT called before any button is pressed', () => {
      currentFormData = { ...mockFormData, skkMonthsLeft: 1 };
      renderStep4();
      expect(mockOpenURL).not.toHaveBeenCalled();
    });

    it('each button press produces exactly one Linking.openURL call', () => {
      currentFormData = { ...mockFormData, skkMonthsLeft: 1, kualifikasi: 'Menengah' };
      const root = renderStep4();

      pressByTestID(root, 'alert-product-skk-0');
      pressByTestID(root, 'alert-product-skk-1');

      expect(mockOpenURL).toHaveBeenCalledTimes(2);
    });
  });

  describe.each(['ios', 'android', 'web'] as const)('copy failed product links on %s', (platform) => {
    async function failAndCopy(root: ReturnType<typeof create>['root'], buttonID: string) {
      mockOpenURL.mockRejectedValueOnce(new Error('Link blocked'));
      await act(async () => {
        await root.findByProps({ testID: buttonID }).props.onPress();
      });
      if (platform === 'web') {
        await act(async () => {
          await root.findByProps({ testID: 'link-failure-copy' }).props.onPress();
        });
      } else {
        const buttons = mockAlert.mock.lastCall![2];
        expect(buttons).toEqual([
          { text: 'Tutup', style: 'cancel' },
          { text: 'Salin tautan', onPress: expect.any(Function) },
        ]);
        expect(mockSetString).not.toHaveBeenCalled();
        await act(async () => {
          buttons[1].onPress();
        });
      }
    }

    beforeEach(() => {
      Platform.OS = platform;
      currentFormData = { ...mockFormData, skkMonthsLeft: 1 };
    });

    it.each([
      { buttonID: 'alert-product-skk-0', url: `${BASE}/paket-tuntas-pkb-skk-jenjang-8` },
      { buttonID: 'alert-product-skk-1', url: `${BASE}/exec-summary-pkb-siap-perpanjangan-skk` },
      { buttonID: 'action-btn-hrEmpowerment', url: 'https://gaia.dokumenproyek.com' },
    ])('copies exactly the URL for $buttonID', async ({ buttonID, url }) => {
      currentFormData = { ...currentFormData, hrEmpowerment: 0 };
      const root = renderStep4();
      await failAndCopy(root, buttonID);
      expect(mockOpenURL).toHaveBeenCalledExactlyOnceWith(url);
      expect(mockSetString).toHaveBeenCalledExactlyOnceWith(url);
      if (platform === 'web') {
        expect(root.findByProps({ testID: 'link-copy-feedback' }).props.children).toContain('Tautan disalin.');
      } else {
        expect(mockAlert.mock.lastCall![0]).toBe('Tautan disalin');
      }
    });

    it.each(['reject', 'false'] as const)('reports clipboard failure (%s) without claiming success', async (failure) => {
      if (failure === 'reject') mockSetString.mockRejectedValueOnce(new Error('Permission denied'));
      else mockSetString.mockResolvedValueOnce(false);
      const root = renderStep4();
      await failAndCopy(root, 'alert-product-skk-0');
      if (platform === 'web') {
        expect(root.findByProps({ testID: 'link-copy-feedback' }).props.children).toContain('belum dapat disalin');
        expect(root.findByProps({ testID: 'link-failure-url' }).props.children).toBe(`${BASE}/paket-tuntas-pkb-skk-jenjang-8`);
        pressByTestID(root, 'link-failure-close');
        expect(root.findAllByProps({ testID: 'link-failure-dialog' })).toHaveLength(0);
      } else {
        expect(mockAlert.mock.lastCall![0]).toBe('Gagal menyalin tautan');
        expect(mockAlert.mock.lastCall![1]).toContain(`${BASE}/paket-tuntas-pkb-skk-jenjang-8`);
      }
    });

    it('does not copy when the link opens successfully', async () => {
      const root = renderStep4();
      await act(async () => {
        await root.findByProps({ testID: 'alert-product-skk-0' }).props.onPress();
      });
      expect(mockSetString).not.toHaveBeenCalled();
      expect(mockAlert).not.toHaveBeenCalled();
      expect(root.findAllByProps({ testID: 'link-failure-dialog' })).toHaveLength(0);
    });
  });

  it('replaces the failed web URL with the next product and clears old copy feedback', async () => {
    Platform.OS = 'web';
    mockOpenURL.mockRejectedValue(new Error('Link blocked'));
    currentFormData = { ...mockFormData, skkMonthsLeft: 1 };
    const root = renderStep4();
    for (const index of [0, 1]) {
      await act(async () => {
        await root.findByProps({ testID: `alert-product-skk-${index}` }).props.onPress();
      });
      expect(root.findAllByProps({ testID: 'link-copy-feedback' })).toHaveLength(0);
      await act(async () => {
        await root.findByProps({ testID: 'link-failure-copy' }).props.onPress();
      });
      pressByTestID(root, 'link-failure-close');
    }
    expect(mockSetString.mock.calls).toEqual([
      [`${BASE}/paket-tuntas-pkb-skk-jenjang-8`],
      [`${BASE}/exec-summary-pkb-siap-perpanjangan-skk`],
    ]);
  });
});
