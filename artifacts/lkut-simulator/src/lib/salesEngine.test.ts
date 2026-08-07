import { describe, it, expect } from 'vitest';
import { getSalesAlerts, TriggerAlert } from './salesEngine';
import { LkutFormData } from '@/types/lkut';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Base form data that triggers NO alerts by default. */
const baseData = (): LkutFormData => ({
  kualifikasi: 'Menengah',
  assetGrowth: 0,
  gpm: 0,
  assetTurnover: 0,
  currentRatio: 0,
  der: 0,
  fcf: 0,
  gcgYears: 0,
  certificates: 0,
  awards: 0,
  moSupplyChain: 0,
  moMaterialQuality: 0,
  moEquipmentQuality: 0,
  moK3: 0,
  moProcedures: 0,
  moResultQuality: 0,
  moOM: 0,
  moSocialProtection: 0,
  moEnvironment: 0,
  equipmentRatio: 0,
  equipmentNewness: 0,
  hrProductivity: 0,
  hrEmpowerment: 0,
  companyCapacity: 0,
  projectScore: 0,
  // Trigger-sensitive fields — safe defaults:
  skkMonthsLeft: 12,   // not expiring
  hasSmap: true,       // already has SMAP
});

/** All-green indicator scores — no alert triggered by scores alone. */
const greenScores = (): Record<string, number> => ({
  certificates:    100,
  equipmentRatio:  100,
  equipmentNewness:100,
  hrProductivity:  100,
  hrEmpowerment:   100,
});

/** Indicator scores that are all critically low — all score-based alerts fire. */
const redScores = (): Record<string, number> => ({
  certificates:    0,
  equipmentRatio:  0,
  equipmentNewness:0,
  hrProductivity:  0,
  hrEmpowerment:   0,
});

const findAlert = (alerts: TriggerAlert[], id: TriggerAlert['id']) =>
  alerts.find((a) => a.id === id);

const BASE = 'https://bayar.gustafta.my.id/p';

// ─── Trigger 1: SKK ──────────────────────────────────────────────────────────

describe('Trigger 1 — SKK', () => {
  it('fires when skkMonthsLeft <= 3', () => {
    const alerts = getSalesAlerts({ ...baseData(), skkMonthsLeft: 3 }, greenScores());
    expect(findAlert(alerts, 'skk')).toBeDefined();
  });

  it('fires when skkMonthsLeft is 0', () => {
    const alerts = getSalesAlerts({ ...baseData(), skkMonthsLeft: 0 }, greenScores());
    expect(findAlert(alerts, 'skk')).toBeDefined();
  });

  it('fires when certificates score < 50', () => {
    const alerts = getSalesAlerts(baseData(), { ...greenScores(), certificates: 49 });
    expect(findAlert(alerts, 'skk')).toBeDefined();
  });

  it('does NOT fire when skkMonthsLeft = 4 and certificates score = 50', () => {
    const alerts = getSalesAlerts(
      { ...baseData(), skkMonthsLeft: 4 },
      { ...greenScores(), certificates: 50 },
    );
    expect(findAlert(alerts, 'skk')).toBeUndefined();
  });

  it('does NOT fire when skkMonthsLeft is undefined and certificates score is high', () => {
    const data = { ...baseData() };
    delete data.skkMonthsLeft;
    const alerts = getSalesAlerts(data, greenScores());
    expect(findAlert(alerts, 'skk')).toBeUndefined();
  });

  describe('Trigger 1 — SKK jenjang URL mapping', () => {
    const cases: Array<{ kualifikasi: string; expectedJenjang: string }> = [
      { kualifikasi: 'Kecil',    expectedJenjang: '7' },
      { kualifikasi: 'Menengah', expectedJenjang: '8' },
      { kualifikasi: 'Besar',    expectedJenjang: '9' },
      { kualifikasi: 'BUJKA',    expectedJenjang: '9' },
    ];

    for (const { kualifikasi, expectedJenjang } of cases) {
      it(`kualifikasi ${kualifikasi} → jenjang ${expectedJenjang} di URL SKK`, () => {
        const alerts = getSalesAlerts(
          { ...baseData(), kualifikasi, skkMonthsLeft: 1 },
          greenScores(),
        );
        const skk = findAlert(alerts, 'skk');
        expect(skk).toBeDefined();
        const primary = skk!.products.find((p) => p.primary);
        expect(primary?.href).toBe(
          `${BASE}/paket-tuntas-pkb-skk-jenjang-${expectedJenjang}`,
        );
      });
    }
  });
});

// ─── Trigger 2: SMAP ─────────────────────────────────────────────────────────

describe('Trigger 2 — SMAP', () => {
  it('fires when hasSmap === false', () => {
    const alerts = getSalesAlerts({ ...baseData(), hasSmap: false }, greenScores());
    expect(findAlert(alerts, 'smap')).toBeDefined();
  });

  it('does NOT fire when hasSmap === true', () => {
    const alerts = getSalesAlerts({ ...baseData(), hasSmap: true }, greenScores());
    expect(findAlert(alerts, 'smap')).toBeUndefined();
  });

  it('does NOT fire when hasSmap is undefined', () => {
    const data = { ...baseData() };
    delete data.hasSmap;
    const alerts = getSalesAlerts(data, greenScores());
    expect(findAlert(alerts, 'smap')).toBeUndefined();
  });
});

// ─── Trigger 3: Sewa Peralatan ────────────────────────────────────────────────

describe('Trigger 3 — Sewa Peralatan (alat)', () => {
  it('fires when equipmentRatio score < 60', () => {
    const alerts = getSalesAlerts(baseData(), { ...greenScores(), equipmentRatio: 59 });
    expect(findAlert(alerts, 'alat')).toBeDefined();
  });

  it('fires when equipmentNewness score < 60', () => {
    const alerts = getSalesAlerts(baseData(), { ...greenScores(), equipmentNewness: 59 });
    expect(findAlert(alerts, 'alat')).toBeDefined();
  });

  it('does NOT fire when both equipment scores >= 60', () => {
    const alerts = getSalesAlerts(
      baseData(),
      { ...greenScores(), equipmentRatio: 60, equipmentNewness: 60 },
    );
    expect(findAlert(alerts, 'alat')).toBeUndefined();
  });

  describe('Trigger 3 — sewa peralatan URL per kualifikasi', () => {
    const cases: Array<{ kualifikasi: string; expectedSlug: string }> = [
      { kualifikasi: 'Kecil',    expectedSlug: 'sewa-peralatan-sbu-kecil-3-tahun' },
      { kualifikasi: 'Menengah', expectedSlug: 'sewa-peralatan-sbu-menengah-3-tahun' },
      { kualifikasi: 'Besar',    expectedSlug: 'sewa-peralatan-sbu-besar-pma-3-tahun' },
      { kualifikasi: 'BUJKA',    expectedSlug: 'sewa-peralatan-sbu-bujka-asing-3-tahun' },
    ];

    for (const { kualifikasi, expectedSlug } of cases) {
      it(`kualifikasi ${kualifikasi} → ${expectedSlug}`, () => {
        const alerts = getSalesAlerts(
          { ...baseData(), kualifikasi },
          { ...greenScores(), equipmentRatio: 0 },
        );
        const alat = findAlert(alerts, 'alat');
        expect(alat).toBeDefined();
        const sewaProduct = alat!.products.find((p) => p.href.includes('sewa-peralatan'));
        expect(sewaProduct?.href).toBe(`${BASE}/${expectedSlug}`);
      });
    }
  });
});

// ─── Trigger 4: TKK (Freelance Tenaga Ahli) ──────────────────────────────────

describe('Trigger 4 — TKK (Freelance Tenaga Ahli)', () => {
  it('fires when hrProductivity score < 60', () => {
    const alerts = getSalesAlerts(baseData(), { ...greenScores(), hrProductivity: 59 });
    expect(findAlert(alerts, 'tkk')).toBeDefined();
  });

  it('fires when hrEmpowerment score < 60', () => {
    const alerts = getSalesAlerts(baseData(), { ...greenScores(), hrEmpowerment: 59 });
    expect(findAlert(alerts, 'tkk')).toBeDefined();
  });

  it('does NOT fire when both HR scores >= 60', () => {
    const alerts = getSalesAlerts(
      baseData(),
      { ...greenScores(), hrProductivity: 60, hrEmpowerment: 60 },
    );
    expect(findAlert(alerts, 'tkk')).toBeUndefined();
  });

  describe('Trigger 4 — TKK jenjang URL mapping', () => {
    const cases: Array<{ kualifikasi: string; expectedJenjang: string }> = [
      { kualifikasi: 'Kecil',    expectedJenjang: '7' },
      { kualifikasi: 'Menengah', expectedJenjang: '8' },
      { kualifikasi: 'Besar',    expectedJenjang: '9' },
      { kualifikasi: 'BUJKA',    expectedJenjang: '9' },
    ];

    for (const { kualifikasi, expectedJenjang } of cases) {
      it(`kualifikasi ${kualifikasi} → jenjang ${expectedJenjang} di URL TKK`, () => {
        const alerts = getSalesAlerts(
          { ...baseData(), kualifikasi },
          { ...greenScores(), hrProductivity: 0 },
        );
        const tkk = findAlert(alerts, 'tkk');
        expect(tkk).toBeDefined();
        const primary = tkk!.products.find((p) => p.primary);
        expect(primary?.href).toBe(
          `${BASE}/jasa-freelance-tkk-jenjang-${expectedJenjang}-sbu-3-tahun`,
        );
      });
    }
  });
});

// ─── No alerts when everything is healthy ────────────────────────────────────

describe('No alerts — semua kondisi sehat', () => {
  it('returns empty array when no trigger condition is met', () => {
    const alerts = getSalesAlerts(baseData(), greenScores());
    expect(alerts).toHaveLength(0);
  });
});

// ─── Multiple alerts can fire simultaneously ──────────────────────────────────

describe('Multiple alerts dapat aktif bersamaan', () => {
  it('semua 4 trigger aktif sekaligus ketika semua kondisi terpenuhi', () => {
    const alerts = getSalesAlerts(
      { ...baseData(), skkMonthsLeft: 1, hasSmap: false },
      redScores(),
    );
    const ids = alerts.map((a) => a.id);
    expect(ids).toContain('skk');
    expect(ids).toContain('smap');
    expect(ids).toContain('alat');
    expect(ids).toContain('tkk');
    expect(alerts).toHaveLength(4);
  });
});
