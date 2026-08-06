export interface LkutFormData {
  kualifikasi: string;

  // Keuangan
  assetGrowth: number;
  gpm: number;
  assetTurnover: number;
  currentRatio: number;
  der: number;
  fcf: number;

  // Organisasi
  gcgYears: number;
  certificates: number;
  awards: number;

  moSupplyChain: number;
  moMaterialQuality: number;
  moEquipmentQuality: number;
  moK3: number;
  moProcedures: number;
  moResultQuality: number;
  moOM: number;
  moSocialProtection: number;
  moEnvironment: number;

  equipmentRatio: number;
  equipmentNewness: number;

  hrProductivity: number;
  hrEmpowerment: number;
  companyCapacity: number;

  // Proyek
  projectScore: number;
}

export const DEFAULT_FORM: LkutFormData = {
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
  equipmentRatio: 1.5,
  equipmentNewness: 30,
  hrProductivity: 2200,
  hrEmpowerment: 35,
  companyCapacity: 8,
  projectScore: 75,
};
