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

  // Konteks tambahan untuk engine rekomendasi
  skkMonthsLeft?: number;   // Bulan tersisa sebelum SKK expired
  hasSmap?: boolean;        // Apakah perusahaan sudah punya dokumen SMAP
}
