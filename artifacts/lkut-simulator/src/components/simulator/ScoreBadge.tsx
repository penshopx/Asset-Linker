import React from 'react';
import { getBandInfo } from '@/lib/lkutCalculator';

export function ScoreBadge({ score }: { score: number }) {
  const info = getBandInfo(score);
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold ${info.color} ${info.border}`}>
      <span>{info.label}</span>
      <span className="bg-white/60 px-1.5 py-0.5 rounded-sm">{score.toFixed(1)}</span>
    </div>
  );
}
