import React from 'react';
import { useFormContext } from 'react-hook-form';
import { LkutFormData } from '@/types/lkut';
import { calculateScore, THRESHOLDS, WEIGHTS, getLowestIndicators, getGrade } from '@/lib/lkutCalculator';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { AlertTriangle, Download, Share2, ArrowRight, RefreshCw, Trophy, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const getActionContent = (key: string) => {
  if (['gcgYears', 'certificates', 'awards'].includes(key)) {
    return { title: 'Tingkatkan Skor GCG & Sertifikasi', btnText: 'Urus di DP Store', href: 'https://dp.dokumenproyek.com' };
  }
  if (key === 'hrEmpowerment') {
    return { title: 'Penuhi Syarat Pelatihan Minimum 3 Hari', btnText: 'Ikuti Bimtek di Gaia Store', href: 'https://gaia.dokumenproyek.com' };
  }
  if (key.startsWith('mo')) {
    return { title: 'Tingkatkan Sistem Manajemen Operasi', btnText: 'Konsultasi Dokumen', href: 'https://dp.dokumenproyek.com' };
  }
  const nameMap: Record<string, string> = {
    assetGrowth: 'Pertumbuhan Aset',
    gpm: 'Gross Profit Margin',
    assetTurnover: 'Perputaran Aset',
    currentRatio: 'Current Ratio',
    der: 'DER',
    fcf: 'Arus Kas Bebas',
    equipmentRatio: 'Rasio Peralatan',
    equipmentNewness: 'Kebaruan Peralatan',
    hrProductivity: 'Produktivitas SDM',
    companyCapacity: 'Kapasitas Perusahaan'
  };
  return { title: `Optimalkan Indikator: ${nameMap[key] || key}`, btnText: 'Konsultasi Sekarang', href: 'https://dokumenproyek.com' };
}

const Gauge = ({ score, grade }: { score: number, grade: string }) => {
  const isGood = grade.includes('A');
  const isWarn = grade.includes('B') || grade.includes('C');
  const color = isGood ? '#10b981' : isWarn ? '#f59e0b' : '#ef4444';
  
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex flex-col items-center justify-center w-48 h-48 mx-auto" data-testid="final-score-display">
      <svg className="transform -rotate-90 w-48 h-48 drop-shadow-sm">
        <circle cx="96" cy="96" r={radius} stroke="#e2e8f0" strokeWidth="12" fill="transparent" />
        <circle 
          cx="96" cy="96" r={radius} 
          stroke={color} 
          strokeWidth="12" 
          fill="transparent" 
          strokeDasharray={circumference} 
          strokeDashoffset={strokeDashoffset} 
          strokeLinecap="round" 
          className="transition-all duration-1000 ease-out" 
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-4xl font-black text-slate-900 tracking-tighter">{score.toFixed(1)}</span>
        <span className="text-xl font-bold mt-1 tracking-tight" style={{ color }} data-testid="grade-display">Grade {grade}</span>
      </div>
    </div>
  );
}

export function Step4Hasil({ onReset }: { onReset: () => void }) {
  const { watch } = useFormContext<LkutFormData>();
  const data = watch();
  const { toast } = useToast();

  const indicatorScores = {
    assetGrowth: calculateScore(data.assetGrowth || 0, THRESHOLDS.assetGrowth),
    gpm: calculateScore(data.gpm || 0, THRESHOLDS.gpm),
    assetTurnover: calculateScore(data.assetTurnover || 0, THRESHOLDS.assetTurnover),
    currentRatio: calculateScore(data.currentRatio || 0, THRESHOLDS.currentRatio),
    der: calculateScore(data.der || 0, THRESHOLDS.der),
    fcf: calculateScore(data.fcf || 0, THRESHOLDS.fcf),
    
    gcgYears: calculateScore(data.gcgYears || 0, THRESHOLDS.gcgYears),
    certificates: calculateScore(data.certificates || 0, THRESHOLDS.certificates),
    awards: calculateScore(data.awards || 0, THRESHOLDS.awards),
    
    moSupplyChain: calculateScore(data.moSupplyChain || 0, THRESHOLDS.mo),
    moMaterialQuality: calculateScore(data.moMaterialQuality || 0, THRESHOLDS.mo),
    moEquipmentQuality: calculateScore(data.moEquipmentQuality || 0, THRESHOLDS.mo),
    moK3: calculateScore(data.moK3 || 0, THRESHOLDS.mo),
    moProcedures: calculateScore(data.moProcedures || 0, THRESHOLDS.mo),
    moResultQuality: calculateScore(data.moResultQuality || 0, THRESHOLDS.mo),
    moOM: calculateScore(data.moOM || 0, THRESHOLDS.mo),
    moSocialProtection: calculateScore(data.moSocialProtection || 0, THRESHOLDS.mo),
    moEnvironment: calculateScore(data.moEnvironment || 0, THRESHOLDS.mo),
    
    equipmentRatio: calculateScore(data.equipmentRatio || 0, THRESHOLDS.equipmentRatio),
    equipmentNewness: calculateScore(data.equipmentNewness || 0, THRESHOLDS.equipmentNewness),
    
    hrProductivity: calculateScore(data.hrProductivity || 0, THRESHOLDS.hrProductivity),
    hrEmpowerment: calculateScore(data.hrEmpowerment || 0, THRESHOLDS.hrEmpowerment),
    companyCapacity: calculateScore(data.companyCapacity || 0, THRESHOLDS.companyCapacity),
  };

  const financialScore = (
    indicatorScores.assetGrowth * WEIGHTS.assetGrowth +
    indicatorScores.gpm * WEIGHTS.gpm +
    indicatorScores.assetTurnover * WEIGHTS.assetTurnover +
    indicatorScores.currentRatio * WEIGHTS.currentRatio +
    indicatorScores.der * WEIGHTS.der +
    indicatorScores.fcf * WEIGHTS.fcf
  ) / 30;

  const orgScore = (
    indicatorScores.gcgYears * WEIGHTS.gcgYears +
    indicatorScores.certificates * WEIGHTS.certificates +
    indicatorScores.awards * WEIGHTS.awards +
    indicatorScores.moSupplyChain * WEIGHTS.moSupplyChain +
    indicatorScores.moMaterialQuality * WEIGHTS.moMaterialQuality +
    indicatorScores.moEquipmentQuality * WEIGHTS.moEquipmentQuality +
    indicatorScores.moK3 * WEIGHTS.moK3 +
    indicatorScores.moProcedures * WEIGHTS.moProcedures +
    indicatorScores.moResultQuality * WEIGHTS.moResultQuality +
    indicatorScores.moOM * WEIGHTS.moOM +
    indicatorScores.moSocialProtection * WEIGHTS.moSocialProtection +
    indicatorScores.moEnvironment * WEIGHTS.moEnvironment +
    indicatorScores.equipmentRatio * WEIGHTS.equipmentRatio +
    indicatorScores.equipmentNewness * WEIGHTS.equipmentNewness +
    indicatorScores.hrProductivity * WEIGHTS.hrProductivity +
    indicatorScores.hrEmpowerment * WEIGHTS.hrEmpowerment +
    indicatorScores.companyCapacity * WEIGHTS.companyCapacity
  ) / 70;

  const managementScore = (financialScore * 0.3) + (orgScore * 0.7);
  const projectScore = data.projectScore || 0;
  const finalScore = (projectScore * 0.4) + (managementScore * 0.6);
  const grade = getGrade(finalScore);

  const lowestKeys = getLowestIndicators(indicatorScores, 3);
  
  const chartData = [
    { name: 'Keuangan', score: parseFloat(financialScore.toFixed(1)), weight: 'Bobot: 18%', color: '#f59e0b' },
    { name: 'Organisasi', score: parseFloat(orgScore.toFixed(1)), weight: 'Bobot: 42%', color: '#0f172a' },
    { name: 'Proyek', score: parseFloat(projectScore.toFixed(1)), weight: 'Bobot: 40%', color: '#10b981' },
  ];

  const needsPUB = ['B', 'C', 'D'].includes(grade);

  const handleSoon = () => {
    toast({
      title: "Fitur segera hadir",
      description: "Nantikan pembaruan kami berikutnya.",
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {needsPUB && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col md:flex-row gap-6 items-center shadow-sm" data-testid="warning-banner">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <h3 className="font-bold text-red-900 text-lg">PERINGATAN: Grade Anda di bawah A</h3>
            </div>
            <p className="text-red-800 text-sm font-medium">Anda wajib mengikuti PUB Khusus sesuai Permen PUPR 7/2024 agar tidak di-blacklist dari tender BUMN!</p>
          </div>
          <a 
            href="https://dokumenproyek.com" 
            className="shrink-0 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg shadow-sm transition-colors w-full md:w-auto text-center"
            data-testid="cta-pub"
          >
            Konsultasi Solusi PUB Sekarang
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Gauge Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm flex flex-col items-center">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            Skor Akhir LKUT
          </h3>
          <Gauge score={finalScore} grade={grade} />
          <p className="mt-8 text-center text-sm font-medium text-slate-500 max-w-xs">
            Skor ini merepresentasikan kelayakan perusahaan Anda untuk memenangkan proyek pemerintah.
          </p>
        </div>

        {/* Breakdown Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6 border-b pb-4">Rincian Komponen Skor</h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={85} tick={{ fill: '#334155', fontWeight: 600, fontSize: 13 }} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number, name: string, props: any) => [`${value} / 100`, props.payload.weight]}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={28} label={{ position: 'right', fill: '#0f172a', fontWeight: 'bold', fontSize: 14 }}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-8 shadow-md" data-testid="action-center">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-amber-500 p-2 rounded-lg">
            <Target className="w-5 h-5 text-slate-900" />
          </div>
          <h3 className="text-xl font-bold text-white">Action Center: Prioritas Perbaikan</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {lowestKeys.map((key, idx) => {
            const action = getActionContent(key);
            const score = indicatorScores[key as keyof typeof indicatorScores];
            return (
              <div key={key} className="bg-slate-800 border border-slate-700 rounded-lg p-5 flex flex-col justify-between" data-testid={`action-card-${key}`}>
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold px-2 py-1 rounded bg-slate-700 text-slate-300 uppercase">Prioritas #{idx + 1}</span>
                    <span className="text-xs font-bold text-red-400">Skor: {score.toFixed(1)}</span>
                  </div>
                  <h4 className="font-bold text-white mb-4 text-[15px] leading-snug">{action.title}</h4>
                </div>
                <a 
                  href={action.href} 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 w-full bg-slate-700 hover:bg-amber-500 text-white hover:text-slate-900 font-bold py-2.5 rounded-md transition-colors text-sm"
                  data-testid={`action-btn-${key}`}
                >
                  {action.btnText}
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6 pb-2">
        <button 
          onClick={onReset}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 shadow-sm transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Hitung Ulang
        </button>
        <button 
          onClick={handleSoon}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-bold text-white bg-slate-800 hover:bg-slate-700 shadow-sm transition-all"
        >
          <Download className="w-4 h-4" />
          Download Hasil (PDF)
        </button>
        <button 
          onClick={handleSoon}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-bold text-slate-900 bg-green-500 hover:bg-green-400 shadow-sm transition-all"
        >
          <Share2 className="w-4 h-4" />
          Bagikan ke WhatsApp
        </button>
      </div>

    </div>
  );
}
