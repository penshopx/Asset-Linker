import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

const STEPS = [
  { id: 1, name: 'Profil & Keuangan' },
  { id: 2, name: 'Kesehatan Organisasi' },
  { id: 3, name: 'Kinerja Proyek' },
  { id: 4, name: 'Hasil' }
];

export function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8" data-testid="step-indicator">
      <div className="relative">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-200 -translate-y-1/2 rounded-full" />
        <div 
          className="absolute top-1/2 left-0 h-1 bg-amber-500 -translate-y-1/2 rounded-full transition-all duration-500 ease-in-out"
          style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
        />
        <div className="relative flex justify-between">
          {STEPS.map((step) => {
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            
            return (
              <div key={step.id} className="flex flex-col items-center">
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm transition-colors duration-300 z-10 border-2
                    ${isCompleted ? 'bg-amber-500 text-white border-amber-500' : 
                      isCurrent ? 'bg-white text-amber-500 border-amber-500' : 
                      'bg-white text-slate-400 border-slate-200'}`}
                >
                  {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : step.id}
                </div>
                <div className="absolute mt-12 w-32 text-center -ml-11">
                  <span className={`text-xs font-semibold ${isCurrent ? 'text-slate-900' : 'text-slate-500'}`}>
                    {step.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="h-10" /> {/* Spacer for the absolute labels */}
    </div>
  );
}
