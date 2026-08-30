import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Repeat2,
  Volume2,
  VolumeX,
} from 'lucide-react';

import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const SCENE_DETAILS: Record<
  string,
  { title: string; filePath: string }
> = {
  doubt: {
    title: 'Sinyal yang Terpecah',
    filePath: 'src/components/video/video_scenes/DoubtScene.tsx',
  },
  diagnostic: {
    title: 'Momen Diagnosis',
    filePath: 'src/components/video/video_scenes/DiagnosticScene.tsx',
  },
  priorities: {
    title: 'Prioritas Terarah',
    filePath: 'src/components/video/video_scenes/PrioritiesScene.tsx',
  },
  closing: {
    title: 'Penutup DokumenProyek',
    filePath: 'src/components/video/video_scenes/ClosingScene.tsx',
  },
};

function formatPlaybackTime(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function PlaybackStatus({
  sceneKeys,
  activeIndex,
  activeDuration,
  activeStartTime,
  totalDuration,
  tick,
  paused,
  onJumpTo,
}: {
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  activeStartTime: number;
  totalDuration: number;
  tick: number;
  paused: boolean;
  onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const elapsedBaseRef = useRef(0);

  useEffect(() => {
    setElapsed(0);
    elapsedBaseRef.current = 0;
  }, [tick]);

  useEffect(() => {
    if (paused) return;
    const startedAt = performance.now();
    const intervalId = window.setInterval(() => {
      setElapsed(
        elapsedBaseRef.current + (performance.now() - startedAt),
      );
    }, 60);
    return () => {
      window.clearInterval(intervalId);
      elapsedBaseRef.current += performance.now() - startedAt;
    };
  }, [paused, tick]);

  const progress =
    activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;
  const totalElapsed = Math.min(
    totalDuration,
    activeStartTime + Math.min(elapsed, activeDuration),
  );

  return (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {sceneKeys.map((key, index) => (
          <button
            key={key}
            type="button"
            onClick={() => onJumpTo(index)}
            className="relative h-3 min-h-3 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/20 transition-all hover:h-4 hover:bg-white/30"
            aria-label={`Pindah ke adegan ${index + 1}`}
            aria-current={index === activeIndex ? 'true' : undefined}
            data-testid={`button-scene-${key}`}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-white/90 transition-[width] duration-100"
              style={{
                width: `${index === activeIndex ? progress * 100 : 0}%`,
              }}
            />
          </button>
        ))}
      </div>
      <div className="shrink-0 text-base text-white/60 tabular-nums">
        {activeIndex + 1}/{sceneKeys.length}
      </div>
      <div
        className="min-w-[9ch] shrink-0 text-right font-mono text-sm tabular-nums text-white/80"
        role="timer"
        aria-label={`Waktu ${formatPlaybackTime(totalElapsed)} dari ${formatPlaybackTime(totalDuration)}`}
      >
        {formatPlaybackTime(totalElapsed)} / {formatPlaybackTime(totalDuration)}
      </div>
    </>
  );
}

function announceSceneSelection(index: number, sceneKeys: string[]) {
  const key = sceneKeys[index];
  const details = SCENE_DETAILS[key];
  if (!details?.filePath) return;
  window.parent.postMessage(
    {
      type: 'REPLIT_VIDEO_SCENE_SELECTED',
      payload: {
        sceneIndex: index,
        sceneCount: sceneKeys.length,
        sceneTitle: details.title || key,
        filePath: details.filePath,
        lineNumber: 1,
      },
    },
    '*',
  );
}

export default function VideoWithControls() {
  const isIframed =
    typeof window !== 'undefined' && window.self !== window.top;

  const {
    sceneKeys,
    activeIndex,
    locked,
    paused,
    mountKey,
    tick,
    durations,
    activeDuration,
    activeStartTime,
    totalDuration,
    onSceneChange,
    jumpTo,
    toggleLock,
    togglePause,
  } = useSceneControls(SCENE_DURATIONS);
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const sensorRef = useRef<HTMLDivElement | null>(null);

  const handleJumpTo = useCallback(
    (index: number) => {
      jumpTo(index);
      announceSceneSelection(index, sceneKeys);
    },
    [jumpTo, sceneKeys],
  );

  const handleToggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      if (!value) {
        setHovering(false);
        setTapPinned(false);
      }
      return !value;
    });
  }, []);

  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      if (
        sensorRef.current &&
        !sensorRef.current.contains(event.target as Node)
      ) {
        setTapPinned(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [collapsed, tapPinned]);

  useEffect(() => {
    if (!paused) return;
    const runningAnimations = document
      .getAnimations()
      .filter((animation) => animation.playState === 'running');
    runningAnimations.forEach((animation) => animation.pause());
    return () => runningAnimations.forEach((animation) => animation.play());
  }, [paused]);

  if (!isIframed) return <VideoTemplate />;

  const barVisible = !collapsed || hovering || tapPinned;

  return (
    <div className="relative h-screen w-full">
      <VideoTemplate
        key={mountKey}
        durations={durations}
        loop
        paused={paused}
        muted={muted}
        onSceneChange={onSceneChange}
      />
      <div
        ref={sensorRef}
        className="absolute bottom-0 left-0 right-0 z-50 flex h-1/4 flex-col justify-end"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setHovering(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setHovering(false);
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== 'mouse' && collapsed) setTapPinned(true);
        }}
      >
        <div className="flex-1" aria-hidden="true" />
        <div
          className={`flex items-center gap-2 bg-black/55 px-3 py-2 backdrop-blur-md transition-all duration-200 sm:gap-3 sm:px-5 sm:py-4 ${
            barVisible
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-full opacity-0'
          }`}
          aria-hidden={!barVisible}
        >
          <button
            type="button"
            onClick={togglePause}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:h-14 sm:w-14"
            title={paused ? 'Putar' : 'Jeda'}
            aria-label={paused ? 'Putar' : 'Jeda'}
            data-testid="button-toggle-pause"
          >
            {paused ? <Play className="h-5 w-5 sm:h-8 sm:w-8" /> : <Pause className="h-5 w-5 sm:h-8 sm:w-8" />}
          </button>
          <button
            type="button"
            onClick={toggleLock}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors sm:h-14 sm:w-14 ${
              locked
                ? 'bg-white/15 text-white hover:bg-white/25'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
            title={locked ? 'Ulangi adegan aktif: aktif' : 'Ulangi adegan aktif: nonaktif'}
            aria-label={locked ? 'Ulangi adegan aktif: aktif' : 'Ulangi adegan aktif: nonaktif'}
            aria-pressed={locked}
            data-testid="button-toggle-scene-lock"
          >
            <Repeat2 className="h-5 w-5 sm:h-7 sm:w-7" />
          </button>
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:h-14 sm:w-14"
            title={muted ? 'Nyalakan suara' : 'Matikan suara'}
            aria-label={muted ? 'Nyalakan suara' : 'Matikan suara'}
            data-testid="button-toggle-audio"
          >
            {muted ? <VolumeX className="h-5 w-5 sm:h-7 sm:w-7" /> : <Volume2 className="h-5 w-5 sm:h-7 sm:w-7" />}
          </button>
          <div className="h-8 w-px shrink-0 bg-white/15 sm:h-10" aria-hidden="true" />
          <PlaybackStatus
            sceneKeys={sceneKeys}
            activeIndex={activeIndex}
            activeDuration={activeDuration}
            activeStartTime={activeStartTime}
            totalDuration={totalDuration}
            tick={tick}
            paused={paused}
            onJumpTo={handleJumpTo}
          />
          <button
            type="button"
            onClick={handleToggleCollapsed}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white sm:h-14 sm:w-14"
            title={collapsed ? 'Tampilkan kontrol' : 'Sembunyikan kontrol'}
            aria-label={collapsed ? 'Tampilkan kontrol' : 'Sembunyikan kontrol'}
            aria-expanded={!collapsed}
            data-testid="button-toggle-controls"
          >
            {collapsed ? <ChevronUp className="h-6 w-6 sm:h-8 sm:w-8" /> : <ChevronDown className="h-6 w-6 sm:h-8 sm:w-8" />}
          </button>
        </div>
      </div>
    </div>
  );
}