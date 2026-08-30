import { motion } from 'framer-motion';

export function DiagnosticScene() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(20px)' }}
      transition={{ duration: 1 }}
    >
      {/* Scanning effect / Focus Ring */}
      <motion.div
        className="absolute rounded-full border border-accent mix-blend-screen"
        initial={{ width: '150vw', height: '150vw', opacity: 0, borderWidth: '1vw' }}
        animate={{ width: '25vw', height: '25vw', opacity: 1, borderWidth: '0.2vw' }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          className="absolute inset-0 rounded-full border border-accent-light"
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Crosshairs */}
        <motion.div
          className="absolute top-1/2 left-[-2vw] w-[4vw] h-[2px] bg-accent -translate-y-1/2"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
        />
        <motion.div
          className="absolute top-1/2 right-[-2vw] w-[4vw] h-[2px] bg-accent -translate-y-1/2"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
        />
        <motion.div
          className="absolute left-1/2 top-[-2vw] w-[2px] h-[4vw] bg-accent -translate-x-1/2"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
        />
        <motion.div
          className="absolute left-1/2 bottom-[-2vw] w-[2px] h-[4vw] bg-accent -translate-x-1/2"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
        />
      </motion.div>

      {/* Main Text */}
      <div className="relative z-20 overflow-hidden">
        <motion.h1
          className="text-[3.5vw] font-display font-bold text-text-primary tracking-tight"
          initial={{ y: '100%', opacity: 0, scale: 0.9 }}
          animate={{ y: '0%', opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
        >
          Satu diagnosis pasti.
        </motion.h1>
      </div>
    </motion.div>
  );
}
