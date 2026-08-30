import { describe, expect, it } from 'vitest';
import {
  calculateScore,
  getGrade,
  getGradeColor,
  getLowestIndicators,
  THRESHOLDS,
  WEIGHTS,
} from './lkutCalculator';

const ascendingBands: [number, number][] = [
  [0, 10],
  [20, 30],
  [40, 50],
  [60, 70],
  [80, 100],
];

describe('calculateScore', () => {
  it('interpolates scores between the surrounding threshold points', () => {
    expect(calculateScore(5, ascendingBands)).toBe(10);
    expect(calculateScore(25, ascendingBands)).toBe(30);
    expect(calculateScore(90, ascendingBands)).toBe(90);
  });

  it('maps every configured threshold endpoint to its intended score band', () => {
    for (const [name, bands] of Object.entries(THRESHOLDS)) {
      bands.forEach(([start, end], index) => {
        expect(calculateScore(start, bands), `${name} start of band ${index}`).toBe(index * 20);
        expect(calculateScore(end, bands), `${name} end of band ${index}`).toBe((index + 1) * 20);
      });
    }
  });

  it('clamps values outside an ascending scale to 0–100', () => {
    expect(calculateScore(Number.NEGATIVE_INFINITY, ascendingBands)).toBe(0);
    expect(calculateScore(-1, ascendingBands)).toBe(0);
    expect(calculateScore(101, ascendingBands)).toBe(100);
    expect(calculateScore(Number.POSITIVE_INFINITY, ascendingBands)).toBe(100);
  });

  it('preserves the descending direction used by DER and company capacity', () => {
    expect(calculateScore(700.4, THRESHOLDS.der)).toBe(0);
    expect(calculateScore(0, THRESHOLDS.der)).toBe(100);
    expect(calculateScore(25.4, THRESHOLDS.companyCapacity)).toBe(0);
    expect(calculateScore(0, THRESHOLDS.companyCapacity)).toBe(100);
  });

  it('returns a finite score for values at every configured range edge', () => {
    for (const bands of Object.values(THRESHOLDS)) {
      const values = bands.flat();
      for (const value of values) {
        const score = calculateScore(value, bands);
        expect(Number.isFinite(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('getLowestIndicators', () => {
  it('returns the requested number in ascending score order', () => {
    expect(
      getLowestIndicators({ financial: 80, people: 20, equipment: 50, project: 10 }, 3),
    ).toEqual(['project', 'people', 'equipment']);
  });

  it('keeps insertion order for tied scores so priorities are deterministic', () => {
    expect(getLowestIndicators({ first: 10, second: 10, third: 20 }, 2)).toEqual([
      'first',
      'second',
    ]);
  });

  it('handles empty and oversized requests without inventing indicators', () => {
    const scores = { financial: 80, people: 20 };
    expect(getLowestIndicators(scores, 0)).toEqual([]);
    expect(getLowestIndicators(scores, 10)).toEqual(['people', 'financial']);
  });
});

describe('getGrade', () => {
  it.each([
    [39.99, 'D'],
    [40, 'C'],
    [49.99, 'C'],
    [50, 'B'],
    [59.99, 'B'],
    [60, 'A'],
    [69.99, 'A'],
    [70, 'AA'],
    [79.99, 'AA'],
    [80, 'AAA'],
    [100, 'AAA'],
  ])('maps score %s to grade %s', (score, expectedGrade) => {
    expect(getGrade(score)).toBe(expectedGrade);
  });
});

describe('getGradeColor', () => {
  it('uses the success color for all A grades', () => {
    expect(getGradeColor('A')).toBe('#10b981');
    expect(getGradeColor('AA')).toBe('#10b981');
    expect(getGradeColor('AAA')).toBe('#10b981');
  });

  it('uses the warning color for B and C', () => {
    expect(getGradeColor('B')).toBe('#f59e0b');
    expect(getGradeColor('C')).toBe('#f59e0b');
  });

  it('uses the danger color for D', () => {
    expect(getGradeColor('D')).toBe('#ef4444');
  });
});

describe('WEIGHTS', () => {
  it('keeps the financial and organization components normalized to 30 and 70', () => {
    const financialKeys = ['assetGrowth', 'gpm', 'assetTurnover', 'currentRatio', 'der', 'fcf'];
    const organizationKeys = Object.keys(WEIGHTS).filter((key) => !financialKeys.includes(key));

    expect(financialKeys.reduce((total, key) => total + WEIGHTS[key as keyof typeof WEIGHTS], 0)).toBe(30);
    expect(organizationKeys.reduce((total, key) => total + WEIGHTS[key as keyof typeof WEIGHTS], 0)).toBe(70);
  });
});