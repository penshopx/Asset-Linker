import { useEffect, useRef, type ComponentType } from 'react';
import { useVideoPlayer, VideoPausedContext } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';

import { DoubtScene } from './video_scenes/DoubtScene';
import { DiagnosticScene } from './video_scenes/DiagnosticScene';
import { PrioritiesScene } from './video_scenes/PrioritiesScene';
import { ClosingScene } from './video_scenes/ClosingScene';

export const SCENE_DURATIONS = {
  doubt: 5500,
  diagnostic: 4500,
  priorities: 6000,
  closing: 5000,
};

const SCENE_COMPONENTS: Record<string, ComponentType> = {
  doubt: DoubtScene,
  diagnostic: DiagnosticScene,
  priorities: PrioritiesScene,
  closing: ClosingScene,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const starts: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, duration] of Object.entries(SCENE_DURATIONS)) {
    starts[key] = cumulativeMs / 1000;
    cumulativeMs += duration;
  }
  return starts;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  paused = false,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  paused?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop, paused });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSceneKeyRef = useRef<string | null>(null);
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = 0.45;
    if (paused) {
      audio.pause();
      return;
    }

    if (lastSceneKeyRef.current !== currentSceneKey) {
      lastSceneKeyRef.current = currentSceneKey;
      const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
      if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
        audio.currentTime = targetTime;
      }
    }

    audio.play().catch(() => {});
  }, [baseSceneKey, currentSceneKey, muted, paused]);

  return (
    <VideoPausedContext.Provider value={paused}>
      <div
        className="w-full h-screen overflow-hidden relative"
        style={{ backgroundColor: 'var(--color-bg-dark)' }}
      >
        <motion.div
          className="absolute inset-0 z-0 bg-cover bg-center opacity-40 mix-blend-screen"
          style={{
            backgroundImage: `url('${import.meta.env.BASE_URL}images/blueprint-fragmented.jpg')`,
          }}
          animate={{
            scale: sceneIndex === 0 ? 1.1 : sceneIndex === 1 ? 1.05 : 1.2,
            opacity: sceneIndex <= 1 ? 0.4 : 0,
          }}
          transition={{ duration: 4, ease: 'easeInOut' }}
        />

        <motion.div
          className="absolute inset-0 z-0 bg-cover bg-center opacity-0 mix-blend-screen"
          style={{
            backgroundImage: `url('${import.meta.env.BASE_URL}images/blueprint-grid.jpg')`,
          }}
          animate={{
            scale: sceneIndex >= 2 ? 1 : 1.1,
            opacity: sceneIndex === 2 ? 0.5 : sceneIndex === 3 ? 0.2 : 0,
          }}
          transition={{ duration: 3, ease: 'easeInOut' }}
        />

        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--color-bg-dark)_100%)] pointer-events-none" />
        <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0ibm9uZSIvPjxwb2x5Z29uIHBvaW50cz0iNDAsMCA0MCwxIDAsMSAwLDAiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48cG9seWdvbiBwb2ludHM9IjEsMCAxLDQwIDAsNDAgMCwwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpIi8+PC9zdmc+')] opacity-50 pointer-events-none" />

        <motion.div
          className="absolute bottom-0 left-0 h-[0.5vh] bg-accent z-50 shadow-[0_0_15px_var(--color-accent)]"
          initial={{ width: '0%' }}
          animate={{
            width:
              sceneIndex === 0
                ? '25%'
                : sceneIndex === 1
                  ? '50%'
                  : sceneIndex === 2
                    ? '75%'
                    : '100%',
          }}
          transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
        />

        <AnimatePresence mode="sync">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>

        <audio
          ref={audioRef}
          src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
          preload="auto"
          autoPlay
          muted={muted}
        />
      </div>
    </VideoPausedContext.Provider>
  );
}
