import { describe, expect, it } from 'vitest';
import * as mobile from '../lib/lkutCalculator';
import * as simulator from '../../lkut-simulator/src/lib/lkutCalculator';

// Independent reference data: do not derive fixtures from either implementation.
// A coordinated accidental change must fail too, not just a one-platform drift.
const bands = {
  assetGrowth: [[-5.4, 3.6], [3.7, 12.7], [12.8, 21.8], [21.9, 30.9], [31, 40]],
  gpm: [[1.6, 5.6], [5.7, 9.7], [9.8, 13.8], [13.9, 17.9], [18, 22]],
  assetTurnover: [[2.6, 31.6], [31.7, 60.7], [60.8, 89.8], [89.9, 118.9], [119, 148]],
  currentRatio: [[2.6, 51.6], [51.7, 100.7], [100.8, 149.8], [149.9, 198.9], [199, 248]],
  der: [[700.4, 560.4], [560.3, 420.3], [420.2, 280.2], [280.1, 140.1], [140, 0]],
  fcf: [[0, 0.1], [0.2, 1.7], [1.8, 3.3], [3.4, 4.9], [5, 6.5]],
  gcgYears: [[0, 6.6], [6.7, 9.7], [9.8, 12.8], [12.9, 15.9], [16, 19]],
  certificates: [[0, 2], [3, 5], [6, 8], [9, 11], [12, 14]],
  awards: [[0, 1], [1.1, 2], [2.1, 3], [3.1, 4], [4.1, 5]],
  mo: [[0, 6.6], [6.7, 9.7], [9.8, 12.8], [12.9, 15.9], [16, 19]],
  equipmentRatio: [[0, 0.5], [0.6, 1.1], [1.2, 1.7], [1.8, 2.3], [2.4, 2.9]],
  equipmentNewness: [[0, 13.6], [13.7, 23.7], [23.8, 33.8], [33.9, 43.9], [44, 54]],
  hrProductivity: [[1000, 1499], [1500, 1999], [2000, 2499], [2500, 2999], [3000, 3500]],
  hrEmpowerment: [[4.6, 13.6], [13.7, 22.7], [22.8, 31.8], [31.9, 40.9], [41, 50]],
  companyCapacity: [[25.4, 20.4], [20.3, 15.3], [15.2, 10.2], [10.1, 5.1], [5, 0]],
} satisfies Record<string, [number, number][]>;

const weights = {
  assetGrowth: 5, gpm: 5, assetTurnover: 5, currentRatio: 5, der: 5, fcf: 5,
  gcgYears: 8, certificates: 4, awards: 3,
  moSupplyChain: 2, moMaterialQuality: 2, moEquipmentQuality: 2, moK3: 2, moProcedures: 2,
  moResultQuality: 2, moOM: 2, moSocialProtection: 2, moEnvironment: 2,
  equipmentRatio: 10, equipmentNewness: 6,
  hrProductivity: 10, hrEmpowerment: 8, companyCapacity: 3,
};
type Indicator = keyof typeof weights;
const keys = Object.keys(weights) as Indicator[];
const financialKeys = keys.slice(0, 6);
const implementations = { simulator, mobile };

function bandsFor(key: Indicator) {
  return key.startsWith('mo') ? bands.mo : bands[key as keyof typeof bands];
}

function uniformInput(score: number, projectScore = score): mobile.LkutCalculationInput {
  return {
    ...Object.fromEntries(keys.map((key) => {
      const bandIndex = Math.min(Math.floor(score / 20), 4);
      const [start, end] = bandsFor(key)[bandIndex];
      return [key, start + (end - start) * (score - bandIndex * 20) / 20];
    })),
    projectScore,
  };
}

function expectParity(input: mobile.LkutCalculationInput) {
  const web = simulator.calculateResult(input);
  const phone = mobile.calculateResult(input);
  expect(Object.keys(web.indicatorScores)).toEqual(keys);
  expect(Object.keys(phone.indicatorScores)).toEqual(keys);
  for (const key of keys) expect(phone.indicatorScores[key], key).toBeCloseTo(web.indicatorScores[key], 12);
  for (const key of ['financialScore', 'orgScore', 'managementScore', 'projectScore', 'finalScore'] as const) {
    expect(phone[key], key).toBeCloseTo(web[key], 12);
  }
  expect(phone.grade).toBe(web.grade);
  expect(phone).toEqual(web);
  return web;
}

/** Registered by both artifacts' normal test commands; one contract, no copied tests. */
export function registerLkutParityTests() {
  describe('LKUT mobile ↔ simulator calculation contract', () => {
    it('pins every threshold and weight independently of the two implementations', () => {
      for (const implementation of Object.values(implementations)) {
        expect(implementation.THRESHOLDS).toEqual(bands);
        expect(implementation.WEIGHTS).toEqual(weights);
      }
    });

    describe.each(Object.entries(implementations))('%s threshold scoring', (_name, implementation) => {
      it.each(Object.entries(bands))('%s: endpoints, interpolation, gaps and clamping', (_key, scale) => {
        scale.forEach(([start, end], index) => {
          expect(implementation.calculateScore(start, scale)).toBe(index * 20);
          expect(implementation.calculateScore(end, scale)).toBe((index + 1) * 20);
          expect(implementation.calculateScore((start + end) / 2, scale)).toBeCloseTo(index * 20 + 10, 12);
          if (index < 4) {
            expect(implementation.calculateScore((end + scale[index + 1][0]) / 2, scale))
              .toBe((index + 1) * 20);
          }
        });
        const descending = scale[0][0] > scale[4][1];
        const min = Math.min(...scale.flat());
        const max = Math.max(...scale.flat());
        expect(implementation.calculateScore(min - 1, scale)).toBe(descending ? 100 : 0);
        expect(implementation.calculateScore(max + 1, scale)).toBe(descending ? 0 : 100);
        const samples = [...scale.flat(), ...scale.flat().flatMap((value) => [value - 0.000001, value + 0.000001])]
          .sort((a, b) => a - b);
        for (let i = 1; i < samples.length; i++) {
          const previous = implementation.calculateScore(samples[i - 1], scale);
          const current = implementation.calculateScore(samples[i], scale);
          expect(current).toBeGreaterThanOrEqual(0);
          expect(current).toBeLessThanOrEqual(100);
          expect(descending ? previous - current : current - previous).toBeGreaterThanOrEqual(-1e-12);
        }
      });
    });

    it.each([
      [0, 0, 'D'], [20, 20, 'D'], [40, 40, 'C'],
      [50, 50, 'B'], [60, 60, 'A'], [70, 70, 'AA'], [80, 80, 'AAA'], [100, 100, 'AAA'],
    ] as const)('same company at indicator score %s has final score %s and grade %s', (score, finalScore, grade) => {
      const result = expectParity(uniformInput(score));
      for (const indicator of Object.values(result.indicatorScores)) expect(indicator).toBeCloseTo(score, 12);
      expect(result.financialScore).toBeCloseTo(score, 12);
      expect(result.orgScore).toBeCloseTo(score, 12);
      expect(result.managementScore).toBeCloseTo(score, 12);
      expect(result.finalScore).toBeCloseTo(finalScore, 12);
      expect(result.grade).toBe(grade);
    });

    it.each(keys)('%s alone contributes its expected weight, not another indicator’s', (key) => {
      const input = uniformInput(0);
      input[key] = bandsFor(key)[4][1];
      const result = expectParity(input);
      for (const other of keys) expect(result.indicatorScores[other]).toBe(other === key ? 100 : 0);
      expect(result.financialScore).toBeCloseTo(financialKeys.includes(key) ? weights[key] * 100 / 30 : 0, 12);
      expect(result.orgScore).toBeCloseTo(financialKeys.includes(key) ? 0 : weights[key] * 100 / 70, 12);
      expect(result.managementScore).toBeCloseTo(weights[key], 12);
      expect(result.finalScore).toBeCloseTo(weights[key] * 0.6, 12);
      expect(result.grade).toBe('D');
    });

    it('uses 18% financial, 42% organization and 40% project for a mixed company', () => {
      const input = uniformInput(0, 75);
      for (const key of keys) {
        const score = financialKeys.includes(key) ? 20 : 80;
        input[key] = bandsFor(key)[score === 20 ? 0 : 3][1];
      }
      const result = expectParity(input);
      expect(result.financialScore).toBe(20);
      expect(result.orgScore).toBe(80);
      expect(result.managementScore).toBe(62);
      expect(result.finalScore).toBeCloseTo(67.2, 12);
      expect(result.grade).toBe('A');
    });

    it.each([
      [0, 100, 40, 'D', 'C'], [20, 95, 50, 'C', 'B'], [40, 90, 60, 'B', 'A'],
      [60, 85, 70, 'A', 'AA'], [80, 80, 80, 'AA', 'AAA'],
    ] as const)('aggregates exactly at grade boundary %s/%s → %s', (indicatorScore, projectScore, boundary, belowGrade, grade) => {
      for (const delta of [-0.0001, 0, 0.0001]) {
        const result = expectParity(uniformInput(indicatorScore, projectScore + delta));
        expect(result.finalScore).toBeCloseTo(boundary + delta * 0.4, 12);
        expect(result.grade).toBe(delta < 0 ? belowGrade : grade);
      }
    });

    it.each([
      [40, 'D', 'C'], [50, 'C', 'B'], [60, 'B', 'A'], [70, 'A', 'AA'], [80, 'AA', 'AAA'],
    ] as const)('classifies unrounded scores immediately around %s', (boundary, belowGrade, grade) => {
      for (const implementation of Object.values(implementations)) {
        expect(implementation.getGrade(boundary - 0.000001)).toBe(belowGrade);
        expect(implementation.getGrade(boundary)).toBe(grade);
        expect(implementation.getGrade(boundary + 0.000001)).toBe(grade);
      }
    });

    it('keeps partial/zero inputs consistent with the existing zero-default behavior', () => {
      const result = expectParity({});
      expectParity(Object.fromEntries(keys.map((key) => [key, 0])));
      expectParity({ der: 420.25, companyCapacity: 10.15, projectScore: 42.5 });
      expect(result.indicatorScores.der).toBe(100);
      expect(result.indicatorScores.companyCapacity).toBe(100);
      expect(result.indicatorScores.assetGrowth).toBeCloseTo(12, 12);
      expect(result.projectScore).toBe(0);
      expect(result.finalScore).toBeCloseTo(5.16, 12);
      expect(result.grade).toBe('D');
    });

    it('compares complete company results near every indicator boundary, including decreasing DER', () => {
      for (const key of keys) {
        for (const endpoint of bandsFor(key).flat()) {
          for (const delta of [-0.000001, 0, 0.000001]) {
            expectParity({ ...uniformInput(50, 63), [key]: endpoint + delta });
          }
        }
      }
    });
  });
}
