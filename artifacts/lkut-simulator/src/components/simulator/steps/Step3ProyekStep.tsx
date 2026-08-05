import React from 'react';
import { useFormContext } from 'react-hook-form';
import { LkutFormData } from '@/types/lkut';
import { Calculator } from 'lucide-react';

export function Step3ProyekStep() {
  const { watch, setValue } = useFormContext<LkutFormData>();
  const score = watch('projectScore') || 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Kinerja Proyek</h2>
        <p className="text-slate-500 text-sm">Atur rata-rata nilai evaluasi kinerja proyek perusahaan Anda.</p>
      </div>

      <div className="p-10 bg-slate-50 rounded-2xl border border-slate-200 text-center max-w-2xl mx-auto shadow-sm">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center border border-amber-100">
            <Calculator className="w-8 h-8 text-amber-500" />
          </div>
        </div>
        
        <div className="text-7xl font-black text-slate-900 mb-2">
          {score}<span className="text-3xl text-slate-400 ml-1">%</span>
        </div>
        
        <label className="text-slate-600 font-semibold block mb-8 text-lg">Rata-rata Kinerja Proyek</label>
        
        <div className="relative pt-1 px-4 mb-8">
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={score} 
            onChange={(e) => setValue('projectScore', parseInt(e.target.value))} 
            className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
            data-testid="projectScore"
          />
          <div className="flex justify-between text-xs font-semibold text-slate-400 mt-3 px-1">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100%</span>
          </div>
        </div>
        
        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
          <p className="text-sm text-blue-800 font-medium leading-relaxed">
            <span className="font-bold">Info:</span> Nilai ini merepresentasikan bobot 40% dari skor akhir berdasarkan kepatuhan pelaksanaan proyek sesuai Permen PUPR 7/2024.
          </p>
        </div>
      </div>
    </div>
  );
}
