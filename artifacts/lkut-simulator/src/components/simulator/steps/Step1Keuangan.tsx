import React from 'react';
import { useFormContext } from 'react-hook-form';
import { LkutFormData } from '@/types/lkut';
import { MetricInput } from '../MetricInput';
import { THRESHOLDS } from '@/lib/lkutCalculator';

export function Step1Keuangan() {
  const { register } = useFormContext<LkutFormData>();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Profil & Keuangan</h2>
        <p className="text-slate-500 text-sm">Pilih jenis kualifikasi dan lengkapi data rasio keuangan perusahaan.</p>
      </div>

      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
        <label className="text-sm font-semibold text-slate-800 block mb-3">Jenis Kualifikasi</label>
        <select 
          {...register('kualifikasi')} 
          className="w-full md:w-1/2 px-4 py-2.5 bg-white border border-slate-300 rounded-md shadow-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none font-medium text-slate-900" 
          data-testid="kualifikasi"
        >
          <option value="Menengah">Kualifikasi Menengah</option>
          <option value="Besar">Kualifikasi Besar</option>
          <option value="Spesialis">Kualifikasi Spesialis</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-1">
        <MetricInput name="assetGrowth" label="Pertumbuhan Aset" unit="%" bands={THRESHOLDS.assetGrowth} />
        <MetricInput name="gpm" label="Gross Profit Margin" unit="%" bands={THRESHOLDS.gpm} />
        <MetricInput name="assetTurnover" label="Perputaran Aset" unit="%" bands={THRESHOLDS.assetTurnover} />
        <MetricInput name="currentRatio" label="Current Ratio" unit="%" bands={THRESHOLDS.currentRatio} />
        <MetricInput name="der" label="Debt to Equity Ratio (DER)" unit="%" bands={THRESHOLDS.der} hint="Lebih kecil lebih baik" />
        <MetricInput name="fcf" label="Arus Kas Bebas" unit="Rp T" bands={THRESHOLDS.fcf} />
      </div>
    </div>
  );
}
