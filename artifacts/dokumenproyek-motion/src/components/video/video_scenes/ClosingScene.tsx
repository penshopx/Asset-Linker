import { motion } from 'framer-motion';

export function ClosingScene() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-bg-dark/90 backdrop-blur-lg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <div className="relative z-20 flex flex-col items-center">
        {/* Animated Icon / Mark */}
        <motion.div
          className="w-[6vw] h-[6vw] mb-[3vh] relative"
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 1, type: 'spring', stiffness: 200, damping: 20, delay: 0.2 }}
        >
          <div className="absolute inset-0 border-[0.4vw] border-accent rounded-[1vw]" />
          <motion.div
            className="absolute inset-[1vw] bg-accent rounded-[0.5vw]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          />
        </motion.div>

        <div className="overflow-hidden">
          <motion.h1
            className="text-[5vw] font-display font-bold text-text-primary tracking-tighter"
            initial={{ y: '100%' }}
            animate={{ y: '0%' }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
          >
            DokumenProyek
          </motion.h1>
        </div>

        <div className="overflow-hidden mt-[1vh]">
          <motion.p
            className="text-[1.8vw] font-body text-text-secondary tracking-wide font-light"
            initial={{ y: '-100%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 1 }}
          >
            Langkah operasional Anda, dipastikan.
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
}
