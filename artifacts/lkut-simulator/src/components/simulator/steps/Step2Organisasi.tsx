import React from 'react';
import { MetricInput } from '../MetricInput';
import { THRESHOLDS } from '@/lib/lkutCalculator';

export function Step2Organisasi() {
  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Kesehatan Organisasi</h2>
        <p className="text-slate-500 text-sm">Masukkan indikator manajerial dan kepatuhan perusahaan.</p>
      </div>

      <section className="space-y-6">
        <h3 className="text-lg font-bold text-slate-800 border-b pb-2">A. Perkembangan Organisasi</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricInput name="gcgYears" label="Penerapan GCG" unit="Tahun" bands={THRESHOLDS.gcgYears} />
          <MetricInput name="certificates" label="Jumlah Sertifikat" unit="Dokumen" bands={THRESHOLDS.certificates} />
          <MetricInput name="awards" label="Penghargaan" unit="Penghargaan" bands={THRESHOLDS.awards} />
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-lg font-bold text-slate-800 border-b pb-2">B. Manajemen Operasi (Tahun Penerapan)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricInput name="moSupplyChain" label="Manajemen Rantai Pasok" unit="Tahun" bands={THRESHOLDS.mo} />
          <MetricInput name="moMaterialQuality" label="Mutu Material" unit="Tahun" bands={THRESHOLDS.mo} />
          <MetricInput name="moEquipmentQuality" label="Mutu Peralatan" unit="Tahun" bands={THRESHOLDS.mo} />
          <MetricInput name="moK3" label="K3" unit="Tahun" bands={THRESHOLDS.mo} />
          <MetricInput name="moProcedures" label="Prosedur Kerja" unit="Tahun" bands={THRESHOLDS.mo} />
          <MetricInput name="moResultQuality" label="Mutu Hasil Kerja" unit="Tahun" bands={THRESHOLDS.mo} />
          <MetricInput name="moOM" label="Operasi & Pemeliharaan" unit="Tahun" bands={THRESHOLDS.mo} />
          <MetricInput name="moSocialProtection" label="Perlindungan Sosial" unit="Tahun" bands={THRESHOLDS.mo} />
          <MetricInput name="moEnvironment" label="Lingkungan Hidup" unit="Tahun" bands={THRESHOLDS.mo} />
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-lg font-bold text-slate-800 border-b pb-2">C. Pemanfaatan Teknologi</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricInput name="equipmentRatio" label="Rasio Peralatan" unit="" bands={THRESHOLDS.equipmentRatio} />
          <MetricInput name="equipmentNewness" label="Kebaruan Peralatan" unit="%" bands={THRESHOLDS.equipmentNewness} />
        </div>
      </section>

      <section className="space-y-6">
        <h3 className="text-lg font-bold text-slate-800 border-b pb-2">D. Perkembangan SDM</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricInput name="hrProductivity" label="Produktivitas SDM" unit="Rp Jt/Org" bands={THRESHOLDS.hrProductivity} />
          <MetricInput name="hrEmpowerment" label="Pemberdayaan SDM" unit="%" bands={THRESHOLDS.hrEmpowerment} />
          <MetricInput name="companyCapacity" label="Kapasitas Perusahaan" unit="Rasio" bands={THRESHOLDS.companyCapacity} hint="Lebih kecil lebih baik (berlawanan)" />
        </div>
      </section>
    </div>
  );
}
