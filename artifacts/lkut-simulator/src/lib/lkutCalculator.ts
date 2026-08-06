export function calculateScore(value: number, bandsInput: [number, number][]): number {
  const points: [number, number][] = [];
  for(let i = 0; i < 5; i++) {
    points.push([bandsInput[i][0], i * 20]);
    points.push([bandsInput[i][1], (i + 1) * 20]);
  }
  points.sort((a, b) => a[0] - b[0]);
  
  if (value <= points[0][0]) return points[0][1];
  if (value >= points[points.length - 1][0]) return points[points.length - 1][1];
  
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i+1];
    if (value >= p1[0] && value <= p2[0]) {
      if (p1[0] === p2[0]) return p1[1];
      const fraction = (value - p1[0]) / (p2[0] - p1[0]);
      return p1[1] + fraction * (p2[1] - p1[1]);
    }
  }
  return 0;
}

export const THRESHOLDS = {
  assetGrowth: [[-5.4,3.6],[3.7,12.7],[12.8,21.8],[21.9,30.9],[31,40]] as [number, number][],
  gpm: [[1.6,5.6],[5.7,9.7],[9.8,13.8],[13.9,17.9],[18,22]] as [number, number][],
  assetTurnover: [[2.6,31.6],[31.7,60.7],[60.8,89.8],[89.9,118.9],[119,148]] as [number, number][],
  currentRatio: [[2.6,51.6],[51.7,100.7],[100.8,149.8],[149.9,198.9],[199,248]] as [number, number][],
  der: [[700.4,560.4],[560.3,420.3],[420.2,280.2],[280.1,140.1],[140,0]] as [number, number][],
  fcf: [[0,0.1],[0.2,1.7],[1.8,3.3],[3.4,4.9],[5,6.5]] as [number, number][],
  
  gcgYears: [[0,6.6],[6.7,9.7],[9.8,12.8],[12.9,15.9],[16,19]] as [number, number][],
  certificates: [[0,2],[3,5],[6,8],[9,11],[12,14]] as [number, number][],
  awards: [[0,1],[1.1,2],[2.1,3],[3.1,4],[4.1,5]] as [number, number][],
  
  mo: [[0,6.6],[6.7,9.7],[9.8,12.8],[12.9,15.9],[16,19]] as [number, number][],
  
  equipmentRatio: [[0,0.5],[0.6,1.1],[1.2,1.7],[1.8,2.3],[2.4,2.9]] as [number, number][],
  equipmentNewness: [[0,13.6],[13.7,23.7],[23.8,33.8],[33.9,43.9],[44,54]] as [number, number][],
  
  hrProductivity: [[1000,1499],[1500,1999],[2000,2499],[2500,2999],[3000,3500]] as [number, number][],
  hrEmpowerment: [[4.6,13.6],[13.7,22.7],[22.8,31.8],[31.9,40.9],[41,50]] as [number, number][],
  companyCapacity: [[25.4,20.4],[20.3,15.3],[15.2,10.2],[10.1,5.1],[5,0]] as [number, number][],
};

export const WEIGHTS = {
  assetGrowth: 5, gpm: 5, assetTurnover: 5, currentRatio: 5, der: 5, fcf: 5,
  gcgYears: 8, certificates: 4, awards: 3,
  moSupplyChain: 2, moMaterialQuality: 2, moEquipmentQuality: 2, moK3: 2, moProcedures: 2, moResultQuality: 2, moOM: 2, moSocialProtection: 2, moEnvironment: 2,
  equipmentRatio: 10, equipmentNewness: 6,
  hrProductivity: 10, hrEmpowerment: 8, companyCapacity: 3
};

export function getRangeFromBands(bands: [number, number][]): { min: number; max: number } {
  const all = bands.flat();
  return { min: Math.min(...all), max: Math.max(...all) };
}

export function getLowestIndicators(scores: Record<string, number>, count: number): string[] {
  return Object.entries(scores)
    .sort(([, a], [, b]) => a - b)
    .slice(0, count)
    .map(([key]) => key);
}

export function getGrade(finalScore: number): string {
  if (finalScore >= 80) return "AAA";
  if (finalScore >= 70) return "AA";
  if (finalScore >= 60) return "A";
  if (finalScore >= 50) return "B";
  if (finalScore >= 40) return "C";
  return "D";
}

export function getBandInfo(score: number) {
  if (score < 20.5) return { label: 'Sangat Rendah', color: 'bg-red-100 text-red-700', border: 'border-red-200' };
  if (score < 40.5) return { label: 'Rendah', color: 'bg-red-100 text-red-700', border: 'border-red-200' };
  if (score < 60.5) return { label: 'Cukup', color: 'bg-amber-100 text-amber-700', border: 'border-amber-200' };
  if (score < 80.5) return { label: 'Tinggi', color: 'bg-blue-100 text-blue-700', border: 'border-blue-200' };
  return { label: 'Sangat Tinggi', color: 'bg-green-100 text-green-700', border: 'border-green-200' };
}
