import React from 'react';
import { useFormContext } from 'react-hook-form';
import { AlertTriangle } from 'lucide-react';
import { ScoreBadge } from './ScoreBadge';
import { calculateScore, getRangeFromBands } from '@/lib/lkutCalculator';

interface MetricInputProps {
  name: string;
  label: string;
  unit?: string;
  bands: [number, number][];
  hint?: string;
}

export function MetricInput({ name, label, unit, bands, hint }: MetricInputProps) {
  const { register, watch, formState: { errors } } = useFormContext();
  const val = watch(name);
  const num = typeof val === 'number' && !isNaN(val) ? val : NaN;
  const score = isNaN(num) ? 0 : calculateScore(num, bands);

  const { min, max } = getRangeFromBands(bands);
  const isOutOfRange = !isNaN(num) && (num < min || num > max);
  const error = errors[name];

  const tooltipText = [
    `Rentang tipikal: ${min}–${max}`,
    hint,
  ].filter(Boolean).join('. ');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          {label}
          <span
            className="text-slate-400 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 shadow-sm cursor-help"
            title={tooltipText}
          >
            i
          </span>
        </label>
        <ScoreBadge score={score} />
      </div>
      <div className="relative flex items-center">
        <input
          type="number"
          step="any"
          {...register(name, {
            valueAsNumber: true,
            validate: (v) => !isNaN(v) || 'Wajib diisi',
            min: { value: min, message: `Nilai minimum adalah ${min}` },
            max: { value: max, message: `Nilai maksimum adalah ${max}` },
          })}
          className={`w-full pl-3 pr-16 py-2.5 bg-white border text-slate-900 rounded-md shadow-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all outline-none font-medium text-[15px] ${
            error
              ? 'border-red-400 focus:border-red-400 focus:ring-red-300'
              : isOutOfRange
              ? 'border-amber-400'
              : 'border-slate-300'
          }`}
          data-testid={name}
        />
        {unit && (
          <span className="absolute right-4 text-sm font-semibold text-slate-500 pointer-events-none">
            {unit}
          </span>
        )}
      </div>
      {error ? (
        <p className="text-xs font-semibold text-red-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {error.message as string}
        </p>
      ) : isOutOfRange ? (
        <p className="text-xs font-semibold text-amber-600 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          Di luar rentang tipikal ({min}–{max})
        </p>
      ) : null}
    </div>
  );
}
