import React from 'react';
import { useFormContext } from 'react-hook-form';
import { MetricInput } from '../MetricInput';
import { THRESHOLDS } from '@/lib/lkutCalculator';
import { LkutFormData } from '@/types/lkut';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

export function Step2Organisasi() {
  const { watch, setValue } = useFormContext<LkutFormData>();
  const hasSmap = watch('hasSmap');
  const skkMonthsLeft = watch('skkMonthsLeft');

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Kesehatan Organisasi</h2>
        <p className="text-slate-500 text-sm">Masukkan indikator manajerial dan kepatuhan perusahaan.</p>
      </div>

      {/* ── Pertanyaan Konteks Cepat ─────────────────────────────────── */}
      <section className="space-y-5">
        <h3 className="text-lg font-bold text-slate-800 border-b pb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Deteksi Risiko Cepat
        </h3>
        <p className="text-slate-500 text-xs -mt-3">
          Dua pertanyaan ini membantu simulator mendeteksi risiko tersembunyi dan langsung merekomendasikan solusi.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* SKK Months Left */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <label className="block text-sm font-bold text-slate-700 mb-1">
              Berapa bulan lagi SKK utama Anda berlaku?
            </label>
            <p className="text-xs text-slate-400 mb-3">
              Kosongkan jika SKK masih lebih dari 3 tahun atau tidak relevan.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={36}
                placeholder="Contoh: 2"
                value={skkMonthsLeft ?? ''}
                onChange={e => {
                  const val = e.target.value;
                  setValue('skkMonthsLeft', val === '' ? undefined : Number(val));
                }}
                className="w-28 bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm"
              />
              <span className="text-slate-500 text-sm">bulan</span>
              {skkMonthsLeft !== undefined && skkMonthsLeft <= 3 && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-full">
                  <AlertTriangle className="w-3 h-3" /> Kritis!
                </span>
              )}
              {skkMonthsLeft !== undefined && skkMonthsLeft > 3 && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                  <Clock className="w-3 h-3" /> Aman
                </span>
              )}
            </div>
          </div>

          {/* Has SMAP */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <label className="block text-sm font-bold text-slate-700 mb-1">
              Apakah perusahaan sudah punya dokumen SMAP?
            </label>
            <p className="text-xs text-slate-400 mb-3">
              SMAP = Sistem Manajemen Anti Penyuapan (ISO 37001). Wajib untuk kepatuhan LPJK.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setValue('hasSmap', true)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg border text-sm font-semibold transition-all ${
                  hasSmap === true
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                    : 'bg-white border-slate-300 text-slate-600 hover:border-emerald-400'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" /> Sudah Ada
              </button>
              <button
                type="button"
                onClick={() => setValue('hasSmap', false)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg border text-sm font-semibold transition-all ${
                  hasSmap === false
                    ? 'bg-red-600 border-red-600 text-white shadow-sm'
                    : 'bg-white border-slate-300 text-slate-600 hover:border-red-400'
                }`}
              >
                <AlertTriangle className="w-4 h-4" /> Belum Ada
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── A. Perkembangan Organisasi ───────────────────────────────── */}
      <section className="space-y-6">
        <h3 className="text-lg font-bold text-slate-800 border-b pb-2">A. Perkembangan Organisasi</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricInput name="gcgYears" label="Penerapan GCG" unit="Tahun" bands={THRESHOLDS.gcgYears} />
          <MetricInput name="certificates" label="Jumlah Sertifikat" unit="Dokumen" bands={THRESHOLDS.certificates} />
          <MetricInput name="awards" label="Penghargaan" unit="Penghargaan" bands={THRESHOLDS.awards} />
        </div>
      </section>

      {/* ── B. Manajemen Operasi ─────────────────────────────────────── */}
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

      {/* ── C. Pemanfaatan Teknologi ─────────────────────────────────── */}
      <section className="space-y-6">
        <h3 className="text-lg font-bold text-slate-800 border-b pb-2">C. Pemanfaatan Teknologi</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MetricInput name="equipmentRatio" label="Rasio Peralatan" unit="" bands={THRESHOLDS.equipmentRatio} />
          <MetricInput name="equipmentNewness" label="Kebaruan Peralatan" unit="%" bands={THRESHOLDS.equipmentNewness} />
        </div>
      </section>

      {/* ── D. Perkembangan SDM ──────────────────────────────────────── */}
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
