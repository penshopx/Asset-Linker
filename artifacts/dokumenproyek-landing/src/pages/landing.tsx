import { motion } from "framer-motion";
import { ArrowRight, FileCheck, ShieldCheck, Truck, Target, Layers, HardHat } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Landing() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans selection:bg-blue-500/30">
      {/* Navbar */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-slate-950/80 backdrop-blur-lg border-b border-white/10 transition-all duration-300">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white font-display font-bold text-xl tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <HardHat className="w-5 h-5 text-white" />
            </div>
            DokumenProyek
          </div>
          <a 
            href="/" 
            className="text-sm font-medium text-white bg-white/10 hover:bg-white/20 transition-colors px-5 py-2.5 rounded-full border border-white/5"
          >
            Cek Kesiapan LKUT
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-[100dvh] flex items-center pt-20 pb-16 overflow-hidden bg-slate-950">
        {/* Architectural Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,#000_70%,transparent_100%)] opacity-30" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-96 bg-blue-500/20 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 text-blue-400 text-sm font-semibold mb-8 border border-blue-500/20 uppercase tracking-wider">
                <Target className="w-4 h-4" />
                Pendamping Kesiapan LKUT
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-bold tracking-tight text-white leading-[1.05]">
                Kesiapan LKUT, <br className="hidden sm:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600">
                  Tanpa Ruang untuk Ragu.
                </span>
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 text-lg sm:text-xl text-slate-400 max-w-2xl leading-relaxed"
            >
              LKUT menentukan kesiapan kontraktor dan tim BUJK untuk melangkah dengan yakin. Petakan kelengkapan dokumen, evaluasi kelayakan, dan temukan prioritas perbaikan sebelum proses evaluasi dimulai.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="mt-12 flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
            >
              <a href="/" className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-base font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50 bg-blue-600 text-white shadow-[0_0_40px_-10px_rgba(37,99,235,0.5)] hover:bg-blue-500 hover:shadow-[0_0_60px_-15px_rgba(37,99,235,0.6)] hover:-translate-y-0.5 h-14 px-8 w-full sm:w-auto group">
                Mulai Cek Kesiapan LKUT
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
              <a href="#solusi" className="inline-flex items-center justify-center whitespace-nowrap rounded-xl text-base font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:pointer-events-none disabled:opacity-50 border border-slate-700 bg-slate-900/50 text-slate-300 shadow-sm hover:bg-slate-800 hover:text-white h-14 px-8 w-full sm:w-auto">
                Pelajari Lebih Lanjut
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Attention / Problem Section */}
      <section className="py-32 bg-white relative">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
                <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-slate-950 leading-[1.15]">
                Celah kecil dalam dokumen LKUT bisa menghambat langkah berikutnya.
              </h2>
              <div className="w-20 h-1.5 bg-blue-600 mt-8 mb-8 rounded-full" />
              <p className="text-xl text-slate-600 leading-relaxed">
              Menyiapkan LKUT membawa tekanan operasional yang besar. Kesiapan bukan sekadar tumpukan kertas. Ketidaksesuaian tenaga ahli, sertifikasi, atau peralatan sering kali baru disadari saat proses evaluasi sudah dekat.
              </p>
            </motion.div>
            
            <div className="grid gap-6 relative">
              <div className="absolute left-6 top-6 bottom-6 w-px bg-slate-100 hidden sm:block" />
              {[
                {
                title: "Kelengkapan Tenaga Ahli (SKK)",
                desc: "Status SKK yang belum terverifikasi dapat mengurangi kesiapan LKUT dan menghambat validasi tim.",
                  icon: FileCheck
                },
                {
                title: "Kepatuhan LKUT (SMAP-SBU)",
                desc: "Standar manajemen anti penyuapan dan sertifikasi badan usaha yang perlu dipastikan sebelum LKUT dievaluasi.",
                  icon: ShieldCheck
                },
                {
                title: "Kesiapan Peralatan (SIMPK)",
                desc: "Kesesuaian identitas dan kelayakan operasi alat berat yang menjadi bagian penting dari kesiapan LKUT.",
                  icon: Truck
                }
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.6, delay: i * 0.15, ease: "easeOut" }}
                  className="relative flex gap-6 p-8 rounded-3xl bg-slate-50 border border-slate-200 hover:border-blue-200 hover:shadow-lg transition-all group"
                >
                  <div className="shrink-0 w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-blue-600 group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all">
                    <item.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-display font-bold text-slate-900">{item.title}</h3>
                    <p className="mt-3 text-slate-600 leading-relaxed">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Solution / Desire Section */}
      <section id="solusi" className="py-32 bg-slate-950 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.15),transparent_50%)]" />
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-white leading-tight"
            >
              Diagnosis LKUT Terarah, Tindakan Pasti.
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="mt-6 text-xl text-slate-400 leading-relaxed"
            >
              Fokus pada apa yang menentukan kesiapan LKUT kontraktor Indonesia. Bukan asumsi, melainkan jalur lurus dari pengecekan hingga pemenuhan standar.
            </motion.p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Diagnosis Kesiapan LKUT",
                desc: "Membedah persyaratan LKUT menjadi poin-poin yang jernih, mudah dipahami, dan langsung dapat ditindaklanjuti.",
                icon: Layers
              },
              {
                title: "Prioritas Pemenuhan LKUT",
                desc: "Menerima panduan langkah demi langkah berdasarkan urgensi, agar pemenuhan LKUT bergerak lebih terarah.",
                icon: Target
              },
              {
                title: "Simulasi Kelayakan LKUT",
                desc: "Bergerak dari diagnosis menuju simulasi kelayakan LKUT untuk melihat posisi kesiapan perusahaan secara utuh.",
                icon: FileCheck
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                className="relative p-10 rounded-3xl bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors group overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[50px] rounded-full group-hover:bg-blue-500/20 transition-all" />
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400 mb-8 border border-blue-500/20 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-display font-bold text-white mb-4">{feature.title}</h3>
                <p className="text-slate-400 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Action / Final CTA Section */}
      <section className="py-32 bg-blue-600 relative overflow-hidden">
        {/* Subtle grid to keep the architectural motif */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff1a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff1a_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-blue-700/50" />
        
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <motion.h2 
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="text-4xl md:text-5xl lg:text-7xl font-display font-bold text-white leading-[1.1]"
            >
              Waktunya berhenti menerka-nerka kesiapan LKUT Anda.
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="mt-8 text-xl md:text-2xl text-blue-100 max-w-2xl mx-auto leading-relaxed font-medium"
            >
              Jangan tunggu hingga proses evaluasi mengungkap celah yang belum terlihat. Gunakan simulator untuk memeriksa kesiapan LKUT secara langsung.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="mt-14"
            >
              <a href="/" className="inline-flex items-center justify-center whitespace-nowrap rounded-2xl text-lg font-bold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50 bg-slate-950 text-white shadow-2xl hover:bg-slate-900 hover:scale-[1.02] hover:shadow-[0_20px_40px_-15px_rgba(2,6,23,0.5)] h-20 px-12 group">
                Cek Kesiapan LKUT Sekarang
                <ArrowRight className="ml-4 w-7 h-7 group-hover:translate-x-2 transition-transform" />
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 bg-slate-950 border-t border-slate-900">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3 text-white font-display font-bold text-2xl">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                <HardHat className="w-6 h-6 text-white" />
              </div>
              DokumenProyek
            </div>
            <p className="text-slate-500 font-medium text-center md:text-right">
              Pendamping kesiapan LKUT untuk kontraktor Indonesia.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
