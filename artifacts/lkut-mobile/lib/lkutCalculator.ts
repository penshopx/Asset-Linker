export function calculateScore(value: number, bandsInput: [number, number][]): number {
  const points: [number, number][] = [];
  for (let i = 0; i < 5; i++) {
    points.push([bandsInput[i][0], i * 20]);
    points.push([bandsInput[i][1], (i + 1) * 20]);
  }
  points.sort((a, b) => a[0] - b[0]);

  if (value <= points[0][0]) return points[0][1];
  if (value >= points[points.length - 1][0]) return points[points.length - 1][1];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (value >= p1[0] && value <= p2[0]) {
      if (p1[0] === p2[0]) return p1[1];
      const fraction = (value - p1[0]) / (p2[0] - p1[0]);
      return p1[1] + fraction * (p2[1] - p1[1]);
    }
  }
  return 0;
}

export const THRESHOLDS = {
  assetGrowth: [[-5.4, 3.6], [3.7, 12.7], [12.8, 21.8], [21.9, 30.9], [31, 40]] as [number, number][],
  gpm: [[1.6, 5.6], [5.7, 9.7], [9.8, 13.8], [13.9, 17.9], [18, 22]] as [number, number][],
  assetTurnover: [[2.6, 31.6], [31.7, 60.7], [60.8, 89.8], [89.9, 118.9], [119, 148]] as [number, number][],
  currentRatio: [[2.6, 51.6], [51.7, 100.7], [100.8, 149.8], [149.9, 198.9], [199, 248]] as [number, number][],
  der: [[700.4, 560.4], [560.3, 420.3], [420.2, 280.2], [280.1, 140.1], [140, 0]] as [number, number][],
  fcf: [[0, 0.1], [0.2, 1.7], [1.8, 3.3], [3.4, 4.9], [5, 6.5]] as [number, number][],
  gcgYears: [[0, 6.6], [6.7, 9.7], [9.8, 12.8], [12.9, 15.9], [16, 19]] as [number, number][],
  certificates: [[0, 2], [3, 5], [6, 8], [9, 11], [12, 14]] as [number, number][],
  awards: [[0, 1], [1.1, 2], [2.1, 3], [3.1, 4], [4.1, 5]] as [number, number][],
  mo: [[0, 6.6], [6.7, 9.7], [9.8, 12.8], [12.9, 15.9], [16, 19]] as [number, number][],
  equipmentRatio: [[0, 0.5], [0.6, 1.1], [1.2, 1.7], [1.8, 2.3], [2.4, 2.9]] as [number, number][],
  equipmentNewness: [[0, 13.6], [13.7, 23.7], [23.8, 33.8], [33.9, 43.9], [44, 54]] as [number, number][],
  hrProductivity: [[1000, 1499], [1500, 1999], [2000, 2499], [2500, 2999], [3000, 3500]] as [number, number][],
  hrEmpowerment: [[4.6, 13.6], [13.7, 22.7], [22.8, 31.8], [31.9, 40.9], [41, 50]] as [number, number][],
  companyCapacity: [[25.4, 20.4], [20.3, 15.3], [15.2, 10.2], [10.1, 5.1], [5, 0]] as [number, number][],
};

export const WEIGHTS = {
  assetGrowth: 5, gpm: 5, assetTurnover: 5, currentRatio: 5, der: 5, fcf: 5,
  gcgYears: 8, certificates: 4, awards: 3,
  moSupplyChain: 2, moMaterialQuality: 2, moEquipmentQuality: 2, moK3: 2, moProcedures: 2,
  moResultQuality: 2, moOM: 2, moSocialProtection: 2, moEnvironment: 2,
  equipmentRatio: 10, equipmentNewness: 6,
  hrProductivity: 10, hrEmpowerment: 8, companyCapacity: 3,
};

export function getLowestIndicators(scores: Record<string, number>, count: number): string[] {
  return Object.entries(scores)
    .sort(([, a], [, b]) => a - b)
    .slice(0, count)
    .map(([key]) => key);
}

export function getGrade(finalScore: number): string {
  if (finalScore >= 80) return 'AAA';
  if (finalScore >= 70) return 'AA';
  if (finalScore >= 60) return 'A';
  if (finalScore >= 50) return 'B';
  if (finalScore >= 40) return 'C';
  return 'D';
}

export type LkutCalculationInput = Partial<Record<keyof typeof WEIGHTS | 'projectScore', number>>;

/** The result consumed by Step4; keep this independently testable from the UI. */
export function calculateResult(data: LkutCalculationInput) {
  const indicatorScores = {} as Record<keyof typeof WEIGHTS, number>;
  let financialTotal = 0;
  let orgTotal = 0;
  const financialKeys = ['assetGrowth', 'gpm', 'assetTurnover', 'currentRatio', 'der', 'fcf'];
  for (const key of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    const bands = key.startsWith('mo') ? THRESHOLDS.mo : THRESHOLDS[key as keyof typeof THRESHOLDS];
    const score = calculateScore(data[key] || 0, bands);
    indicatorScores[key] = score;
    if (financialKeys.includes(key)) financialTotal += score * WEIGHTS[key];
    else orgTotal += score * WEIGHTS[key];
  }
  const financialScore = financialTotal / 30;
  const orgScore = orgTotal / 70;
  const managementScore = financialScore * 0.3 + orgScore * 0.7;
  const projectScore = data.projectScore || 0;
  const finalScore = projectScore * 0.4 + managementScore * 0.6;
  return { indicatorScores, financialScore, orgScore, managementScore, projectScore, finalScore, grade: getGrade(finalScore) };
}

export function getGradeColor(grade: string): string {
  if (grade.includes('A')) return '#10b981';
  if (grade === 'B' || grade === 'C') return '#f59e0b';
  return '#ef4444';
}
