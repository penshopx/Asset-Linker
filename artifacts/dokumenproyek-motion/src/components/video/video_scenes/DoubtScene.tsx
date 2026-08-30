import { motion } from 'framer-motion';

const fragments = [
  { text: 'SKK', x: 10, y: 20, delay: 0.2 },
  { text: 'SMAP', x: 70, y: 15, delay: 0.4 },
  { text: 'SBU', x: 25, y: 70, delay: 0.6 },
  { text: 'SIMPK', x: 75, y: 60, delay: 0.3 },
  { text: 'Tenaga Ahli', x: 45, y: 80, delay: 0.5 },
];

export function DoubtScene() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 1 }}
    >
      {/* Floating Fragments */}
      {fragments.map((frag, i) => (
        <motion.div
          key={i}
          className="absolute text-text-muted font-mono text-[1.5vw] tracking-widest uppercase border border-text-muted/20 px-[1.5vw] py-[0.5vh] rounded-sm bg-bg-dark/30 backdrop-blur-sm"
          initial={{ opacity: 0, left: `${frag.x}vw`, top: `${frag.y}vh`, filter: 'blur(10px)', scale: 0.8 }}
          animate={{
            opacity: [0, 0.5, 0.2, 0.7],
            filter: ['blur(10px)', 'blur(4px)', 'blur(8px)', 'blur(2px)'],
            x: [0, i % 2 === 0 ? 30 : -30, i % 2 === 0 ? -15 : 15, i % 2 === 0 ? 20 : -20],
            y: [0, i % 2 === 0 ? -20 : 20, i % 2 === 0 ? 15 : -15, i % 2 === 0 ? -10 : 10],
          }}
          transition={{
            duration: 5.5,
            delay: frag.delay,
            ease: 'easeInOut',
            times: [0, 0.3, 0.7, 1],
          }}
        >
          {frag.text}
        </motion.div>
      ))}

      {/* Main Text */}
      <div className="relative z-20 text-center flex flex-col items-center gap-[2vh]">
        <div className="overflow-hidden">
          <motion.h1
            className="text-[4vw] font-display font-semibold text-text-primary tracking-tight leading-tight"
            initial={{ y: '100%' }}
            animate={{ y: '0%' }}
            exit={{ y: '-100%', opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 1 }}
          >
            Persiapan LKUT buram.
          </motion.h1>
        </div>
        <div className="overflow-hidden">
          <motion.h2
            className="text-[2vw] font-body text-text-secondary font-light"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '-100%', opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 1.4 }}
          >
            Sinyal terpecah. Kepastian operasional meragukan.
          </motion.h2>
        </div>
      </div>
    </motion.div>
  );
}
