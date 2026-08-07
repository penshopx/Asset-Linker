import React, { useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, ShieldCheck, Crosshair } from 'lucide-react';
import { LkutFormData } from '@/types/lkut';
import { captureFromURL, SniperAttribution } from '@/lib/sniper';

import { StepIndicator } from '@/components/simulator/StepIndicator';
import { Step1Keuangan } from '@/components/simulator/steps/Step1Keuangan';
import { Step2Organisasi } from '@/components/simulator/steps/Step2Organisasi';
import { Step3ProyekStep } from '@/components/simulator/steps/Step3ProyekStep';
import { Step4Hasil } from '@/components/simulator/steps/Step4Hasil';

const defaultValues: LkutFormData = {
  kualifikasi: 'Menengah',
  assetGrowth: 15, gpm: 12, assetTurnover: 75, currentRatio: 120, der: 200, fcf: 2.5,
  gcgYears: 10, certificates: 7, awards: 2,
  moSupplyChain: 10, moMaterialQuality: 10, moEquipmentQuality: 10, moK3: 10, moProcedures: 10, moResultQuality: 10, moOM: 10, moSocialProtection: 10, moEnvironment: 10,
  equipmentRatio: 1.5, equipmentNewness: 30,
  hrProductivity: 2200, hrEmpowerment: 35, companyCapacity: 8,
  projectScore: 75,
  skkMonthsLeft: undefined,
  hasSmap: undefined,
};

export default function Simulator() {
  const methods = useForm<LkutFormData>({ defaultValues });
  const [step, setStep] = useState(1);
  const [attribution, setAttribution] = useState<SniperAttribution | null>(null);

  useEffect(() => {
    setAttribution(captureFromURL());
  }, []);

  const STEP_FIELDS: Record<number, (keyof LkutFormData)[]> = {
    1: ['assetGrowth', 'gpm', 'assetTurnover', 'currentRatio', 'der', 'fcf'],
    2: [
      'gcgYears', 'certificates', 'awards',
      'moSupplyChain', 'moMaterialQuality', 'moEquipmentQuality', 'moK3',
      'moProcedures', 'moResultQuality', 'moOM', 'moSocialProtection', 'moEnvironment',
      'equipmentRatio', 'equipmentNewness',
      'hrProductivity', 'hrEmpowerment', 'companyCapacity',
    ],
  };

  const nextStep = async () => {
    const fields = STEP_FIELDS[step];
    if (fields) {
      const valid = await methods.trigger(fields);
      if (!valid) return;
    }
    setStep(s => Math.min(4, s + 1));
  };
  const prevStep = () => setStep(s => Math.max(1, s - 1));

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-slate-900 text-white py-6 px-4 shadow-md relative z-10">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white mb-1">LKUT Grade Simulator</h1>
            <p className="text-amber-500 font-medium text-sm">Simulasi Kualifikasi BUJK berdasarkan Permen PUPR No. 7 Tahun 2024</p>
            <span className="inline-flex items-center gap-1.5 mt-2 bg-emerald-900/60 border border-emerald-600/50 text-emerald-300 text-xs font-semibold px-2.5 py-1 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5" />
              Kalkulator Terverifikasi Permen PUPR 7/2024
            </span>
          </div>
          <a href="https://dokumenproyek.com" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors bg-slate-800 px-4 py-2 rounded-md hover:bg-slate-700 w-fit">
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Hub
          </a>
        </div>
      </header>

      <main className="pb-24">
        <StepIndicator currentStep={step} />

        {/* ── Sniper attribution banner ─────────────────────────────── */}
        {attribution && (
          <div className="max-w-4xl mx-auto px-4 mt-4">
            <div className="bg-blue-950 border border-blue-800 text-white rounded-xl px-5 py-3 flex items-center gap-3 shadow-sm">
              <Crosshair className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-sm font-medium text-blue-100">
                🔍 Diagnosa Lanjutan dari Intel-Konstruksi untuk{' '}
                <span className="font-bold text-white">{attribution.pt}</span>
              </span>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-10 min-h-[500px] flex flex-col">
            <FormProvider {...methods}>
              <form onSubmit={methods.handleSubmit(() => { if(step === 3) nextStep(); })} className="flex-1 flex flex-col">
                <div className="flex-1">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -20, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                      {step === 1 && <Step1Keuangan />}
                      {step === 2 && <Step2Organisasi />}
                      {step === 3 && <Step3ProyekStep />}
                      {step === 4 && <Step4Hasil onReset={() => setStep(1)} attribution={attribution} />}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {step < 4 && (
                  <div className="mt-10 pt-6 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={prevStep}
                      disabled={step === 1}
                      className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ${
                        step === 1 
                          ? 'text-slate-300 cursor-not-allowed bg-slate-50' 
                          : 'text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 shadow-sm'
                      }`}
                      data-testid="prev-btn"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Sebelumnya
                    </button>
                    
                    {step < 3 ? (
                      <button
                        type="button"
                        onClick={nextStep}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 rounded-lg font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 shadow-sm hover:shadow transition-all"
                        data-testid="next-btn"
                      >
                        Selanjutnya
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 rounded-lg font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-md hover:shadow-lg transition-all"
                        data-testid="next-btn"
                      >
                        Lihat Hasil
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </form>
            </FormProvider>
          </div>
        </div>
      </main>
    </div>
  );
}
