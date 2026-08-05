import React from 'react';
import { useFormContext } from 'react-hook-form';
import { ScoreBadge } from './ScoreBadge';
import { calculateScore } from '@/lib/lkutCalculator';

interface MetricInputProps {
  name: string;
  label: string;
  unit?: string;
  bands: [number, number][];
  hint?: string;
}

export function MetricInput({ name, label, unit, bands, hint }: MetricInputProps) {
  const { register, watch } = useFormContext();
  const val = watch(name);
  const num = typeof val === 'number' && !isNaN(val) ? val : 0;
  const score = calculateScore(num, bands);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-800 flex items-center gap-1.5" title={hint}>
          {label}
          {hint && <span className="text-slate-400 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 shadow-sm cursor-help">i</span>}
        </label>
        <ScoreBadge score={score} />
      </div>
      <div className="relative flex items-center">
        <input 
          type="number" 
          step="any"
          {...register(name, { valueAsNumber: true })} 
          className="w-full pl-3 pr-16 py-2.5 bg-white border border-slate-300 text-slate-900 rounded-md shadow-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all outline-none font-medium text-[15px]" 
          data-testid={name}
        />
        {unit && (
          <span className="absolute right-4 text-sm font-semibold text-slate-500 pointer-events-none">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
