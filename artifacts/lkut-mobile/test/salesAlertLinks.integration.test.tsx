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
 * Covers the two highest-risk paths called out in the task spec:
 *   • SKK primary link (alert.id = 'skk', pIdx = 0)
 *   • BUJKA sewa-peralatan link (alert.id = 'alat', href includes 'sewa-peralatan-sbu-bujka')
 *   • PUB warning banner: visible and tappable for B/C/D, absent for A/AA/AAA
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create, act } from 'react-test-renderer';

// ─── Hoist the Linking mock so it is available inside vi.mock factories ───────
const mockOpenURL = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// ─── React Native stubs ───────────────────────────────────────────────────────
// Replaces native modules with plain React elements so react-test-renderer
// can render the component tree in Node without a native runtime.
vi.mock('react-native', () => ({
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
  useColorScheme: () => 'light',
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
}));

vi.mock('expo-haptics', () => ({
  impactAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
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
function renderStep4() {
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(React.createElement(Step4, { onReset: vi.fn() }));
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
    mockOpenURL.mockClear();
    // Reset to safe defaults before each test so mocks don't bleed across.
    currentFormData = { ...mockFormData };
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

      expect(mockOpenURL).toHaveBeenCalledTimes(1);
      expect(mockOpenURL).toHaveBeenCalledWith('https://dp.dokumenproyek.com');
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
});
