import { motion } from 'framer-motion';

const pillars = [
  { label: 'SKK', delay: 0.5 },
  { label: 'SMAP & SBU', delay: 0.7 },
  { label: 'Peralatan SIMPK', delay: 0.9 },
  { label: 'Tenaga Ahli', delay: 1.1 },
];

export function PrioritiesScene() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: '-10vh' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* 3D Pillars Image Background Element */}
      <motion.img
        src={`${import.meta.env.BASE_URL}images/pillars.png`}
        className="absolute inset-0 w-full h-full object-contain opacity-70 mix-blend-screen"
        initial={{ y: '20vh', opacity: 0, scale: 0.9 }}
        animate={{ y: '0vh', opacity: 0.8, scale: 1 }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        alt=""
      />

      <div className="relative z-20 w-full px-[10vw] flex flex-col items-center mt-[10vh]">
        <motion.div
          className="text-[3vw] font-display font-semibold text-text-primary tracking-tight mb-[8vh] text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Prioritas kini terarah.
        </motion.div>

        <div className="flex w-full justify-between items-end h-[30vh]">
          {pillars.map((pillar, i) => (
            <motion.div
              key={i}
              className="flex flex-col items-center relative"
              initial={{ opacity: 0, y: '10vh' }}
              animate={{ opacity: 1, y: '0vh' }}
              transition={{ duration: 1, delay: pillar.delay, type: 'spring', stiffness: 100, damping: 20 }}
            >
              <div className="w-[1px] h-[15vh] bg-gradient-to-t from-accent/0 via-accent to-accent/0 mb-[2vh]" />
              <div className="border border-accent/30 bg-bg-dark/50 backdrop-blur-md px-[1.5vw] py-[1vh] rounded-[0.5vw] text-[1.2vw] font-mono text-text-primary whitespace-nowrap shadow-[0_0_15px_rgba(37,99,235,0.2)]">
                {pillar.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
