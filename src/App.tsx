import { useCallback, useEffect, useRef, useState } from 'react';
import { MusicEngine, SYNTH_TRACKS, type AudioSourceMode } from './audio/musicEngine';
import type { AudioMetrics } from './audio/beatDetector';
import { CharacterPopover } from './components/CharacterPopover';
import { ControlDock } from './components/ControlDock';
import { SettingsPopover } from './components/SettingsPopover';
import { StageHeader } from './components/StageHeader';
import { DANCE_STYLES, type ConcreteDanceStyle, type DanceStyle } from './dance/choreography';
import {
  OPEN_SOURCE_MOTIONS,
  type MotionPlaybackMode,
} from './dance/motionLibrary';
import {
  BUILTIN_VRM_CHARACTERS,
  DEFAULT_CHARACTER_ID,
  getCharacterById,
} from './scene/characterLibrary';
import {
  DanceStageScene,
  type CameraPresetId,
  type StageHudSnapshot,
} from './scene/DanceStageScene';
import { getStageThemeById, STAGE_THEMES, type StageThemeId } from './scene/themes';

const THEME_STORAGE_KEY = 'vrm_stage_theme_id';
const CHARACTER_STORAGE_KEY = 'vrm_stage_character_id';

function readInitialCharacter(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const paramChar = params.get('character');
    if (paramChar && BUILTIN_VRM_CHARACTERS.some((c) => c.id === paramChar)) {
      return paramChar;
    }
    const stored = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    if (stored && BUILTIN_VRM_CHARACTERS.some((c) => c.id === stored)) {
      return stored;
    }
  } catch {
    // Ignore storage access restriction
  }
  return DEFAULT_CHARACTER_ID;
}

function readInitialTheme(): StageThemeId {
  try {
    const params = new URLSearchParams(window.location.search);
    const paramTheme = params.get('theme') as StageThemeId | null;
    if (paramTheme && STAGE_THEMES.some((t) => t.id === paramTheme)) {
      return paramTheme;
    }
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as StageThemeId | null;
    if (stored && STAGE_THEMES.some((t) => t.id === stored)) {
      return stored;
    }
  } catch {
    // Ignore storage access restriction
  }
  return 'auto';
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<DanceStageScene | null>(null);
  const musicRef = useRef<MusicEngine | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1';
  });
  const [sourceMode, setSourceMode] = useState<AudioSourceMode>('synth');
  const [selectedTrackId, setSelectedTrackId] = useState<string>(SYNTH_TRACKS[0].id);
  const [customAudioName, setCustomAudioName] = useState<string | null>(null);
  const [motionMode, setMotionMode] = useState<MotionPlaybackMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('motion') ? 'mocap' : 'procedural';
  });
  const [danceStyle, setDanceStyle] = useState<DanceStyle>('auto');
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('full');
  const [intensity, setIntensity] = useState<number>(1.05);
  const [volume, setVolume] = useState<number>(0.75);
  const [autoExpression, setAutoExpression] = useState<boolean>(true);
  const [themeId, setThemeId] = useState<StageThemeId>(readInitialTheme);
  const [spotlightEnabled, setSpotlightEnabled] = useState<boolean>(true);
  const [spotlightIntensity, setSpotlightIntensity] = useState<number>(1.05);
  const [characterOpen, setCharacterOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [liveBpm, setLiveBpm] = useState<number>(SYNTH_TRACKS[0].bpm);

  const initialCharacterIdRef = useRef<string>(readInitialCharacter());
  const [hudState, setHudState] = useState<StageHudSnapshot>(() => {
    const initialChar = getCharacterById(initialCharacterIdRef.current);
    return {
      modelLoaded: false,
      activeCharacterId: initialChar.id,
      modelName: initialChar.shortLabel,
      loadProgress: 0,
      loadError: null,
      activeStyle: 'hiphop',
      activeMotifLabel: 'Down-Bounce 律动',
      motionMode: 'procedural',
      activeMotionId: OPEN_SOURCE_MOTIONS[0].id,
      activeMotionLabel: OPEN_SOURCE_MOTIONS[0].label,
      motionLoading: false,
      motionError: null,
    };
  });

  const bpmUpdateAccumRef = useRef<number>(0);

  const drawDockSpectrum = useCallback((metrics: AudioMetrics) => {
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const bands = metrics.spectrumBands;
    const count = bands.length;
    if (count === 0) return;

    const gap = 2;
    const barW = Math.max(2, (w - gap * (count - 1)) / count);

    let accent = '#f59e0b';
    if (themeId !== 'auto') {
      accent = getStageThemeById(themeId).primaryHex;
    } else {
      const activeMotionMeta =
        motionMode === 'mocap'
          ? OPEN_SOURCE_MOTIONS.find((m) => m.id === hudState.activeMotionId)
          : undefined;
      const activeStyleMeta = DANCE_STYLES.find((s) => s.id === hudState.activeStyle);
      accent = activeMotionMeta?.accentHex ?? activeStyleMeta?.accentHex ?? '#f59e0b';
    }

    for (let i = 0; i < count; i++) {
      const val = bands[i] ?? 0;
      const barH = Math.max(3, val * (h - 4));
      const x = i * (barW + gap);
      const y = h - barH;
      ctx.fillStyle = val > 0.65 ? accent : 'rgba(226, 232, 240, 0.45)';
      ctx.fillRect(x, y, barW, barH);
    }
  }, [hudState.activeMotionId, hudState.activeStyle, motionMode, themeId]);

  const drawSpectrumRef = useRef(drawDockSpectrum);
  drawSpectrumRef.current = drawDockSpectrum;

  // Mount Three.js + VRM stage & MusicEngine once
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const music = new MusicEngine();
    musicRef.current = music;

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      void music.play();
    }

    const stage = new DanceStageScene(mountEl, {
      initialCharacterId: initialCharacterIdRef.current,
      onHudUpdate: (snapshot) => {
        setHudState(snapshot);
      },
      sampleAudio: (dt) => {
        const metrics = music.sampleMetrics(dt);
        drawSpectrumRef.current(metrics);
        bpmUpdateAccumRef.current += dt;
        if (bpmUpdateAccumRef.current > 0.4) {
          bpmUpdateAccumRef.current = 0;
          setLiveBpm((prev) => (prev !== metrics.bpm ? metrics.bpm : prev));
        }
        return metrics;
      },
    });
    stageRef.current = stage;

    const initialMotionId = params.get('motion');
    if (initialMotionId && OPEN_SOURCE_MOTIONS.some((m) => m.id === initialMotionId)) {
      void stage.selectOpenSourceMotion(initialMotionId);
    }

    return () => {
      stage.dispose();
      music.dispose();
      stageRef.current = null;
      musicRef.current = null;
    };
  }, []);

  // Sync React controls to 3D stage without tearing down WebGL
  useEffect(() => {
    stageRef.current?.setConfig({
      motionMode,
      danceStyle,
      intensity,
      isPlaying,
      autoExpression,
      themeId,
      spotlightEnabled,
      spotlightIntensity,
    });
  }, [
    motionMode,
    danceStyle,
    intensity,
    isPlaying,
    autoExpression,
    themeId,
    spotlightEnabled,
    spotlightIntensity,
  ]);

  const handleSelectTheme = (nextTheme: StageThemeId) => {
    setThemeId(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Ignore storage access restriction
    }
  };

  // Persist character choice only after it loads cleanly so a failed load never bricks reloads
  useEffect(() => {
    if (!hudState.modelLoaded || hudState.loadError) return;
    if (hudState.activeCharacterId === 'custom') return;
    try {
      window.localStorage.setItem(CHARACTER_STORAGE_KEY, hudState.activeCharacterId);
    } catch {
      // Ignore storage access restriction
    }
  }, [hudState.modelLoaded, hudState.loadError, hudState.activeCharacterId]);

  // Keyboard shortcuts & first-gesture audio unlock
  useEffect(() => {
    const onPointerDown = () => {
      void musicRef.current?.resumeIfNeeded();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      void musicRef.current?.resumeIfNeeded();
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => {
          const next = !prev;
          if (next) void musicRef.current?.play();
          else musicRef.current?.pause();
          return next;
        });
      } else if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const handleTogglePlay = async () => {
    setAudioError(null);
    if (!musicRef.current) return;
    if (isPlaying) {
      musicRef.current.pause();
      setIsPlaying(false);
    } else {
      await musicRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSelectTrack = async (trackId: string) => {
    setAudioError(null);
    if (!musicRef.current) return;
    const track = musicRef.current.selectSynthTrack(trackId);
    setSelectedTrackId(track.id);
    setSourceMode('synth');
    setCustomAudioName(null);
    setLiveBpm(track.bpm);
    if (!isPlaying) {
      await musicRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleUploadAudio = async (file: File) => {
    setAudioError(null);
    if (!musicRef.current) return;
    try {
      const name = await musicRef.current.loadAudioFile(file);
      setSourceMode('file');
      setCustomAudioName(name);
      setIsPlaying(true);
    } catch {
      setAudioError('无法解析该音频文件，请更换 MP3 / WAV / OGG 格式');
    }
  };

  const handleToggleMic = async () => {
    setAudioError(null);
    if (!musicRef.current) return;
    if (sourceMode === 'mic') {
      musicRef.current.disableMicrophone();
      setSourceMode('synth');
      setIsPlaying(false);
      return;
    }
    try {
      await musicRef.current.enableMicrophone();
      setSourceMode('mic');
      setCustomAudioName(null);
      setIsPlaying(true);
    } catch (err) {
      setAudioError(
        err instanceof Error ? err.message : '麦克风权限被拒绝或设备不可用',
      );
    }
  };

  const handleChangeMotionMode = async (mode: MotionPlaybackMode) => {
    setMotionMode(mode);
    if (mode === 'mocap') {
      await stageRef.current?.selectOpenSourceMotion(hudState.activeMotionId || OPEN_SOURCE_MOTIONS[0].id);
    }
  };

  const handleSelectOpenSourceMotion = async (motionId: string) => {
    setMotionMode('mocap');
    await stageRef.current?.selectOpenSourceMotion(motionId);
    if (!isPlaying && musicRef.current) {
      await musicRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleUploadMotionFile = async (file: File) => {
    setMotionMode('mocap');
    await stageRef.current?.loadCustomMotion(file);
    if (!isPlaying && musicRef.current) {
      await musicRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleChangeVolume = (val: number) => {
    setVolume(val);
    musicRef.current?.setVolume(val);
  };

  const handleSelectCamera = (preset: CameraPresetId) => {
    setCameraPreset(preset);
    stageRef.current?.setCameraPreset(preset);
  };

  const handleSelectCharacter = (characterId: string) => {
    void stageRef.current?.selectCharacter(characterId);
  };

  const handleUploadVrm = (file: File) => {
    void stageRef.current?.loadCustomVrmFile(file);
  };

  const activeTrack = SYNTH_TRACKS.find((t) => t.id === selectedTrackId) ?? SYNTH_TRACKS[0];
  const trackLabel =
    sourceMode === 'mic'
      ? '麦克风实时输入'
      : sourceMode === 'file'
        ? customAudioName ?? '本地音频'
        : activeTrack.title;

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-[#0b0d13] select-none"
      data-model-loaded={String(hudState.modelLoaded)}
      data-character={hudState.activeCharacterId}
      data-playing={String(isPlaying)}
      data-motion-mode={motionMode}
      data-active-motion={hudState.activeMotionId}
      data-dance-style={danceStyle}
      data-active-style={hudState.activeStyle}
      data-audio-source={sourceMode}
      data-theme={themeId}
      data-spotlight={String(spotlightEnabled)}
    >
      {/* Dedicated empty Three.js WebGL mount */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 h-full w-full"
        data-testid="vrm-stage-viewport"
      />

      <StageHeader
        modelLoaded={hudState.modelLoaded}
        activeCharacterId={hudState.activeCharacterId}
        modelName={hudState.modelName}
        bpm={liveBpm}
        trackLabel={trackLabel}
        motionMode={motionMode}
        activeStyle={hudState.activeStyle as ConcreteDanceStyle}
        activeMotifLabel={hudState.activeMotifLabel}
        activeMotionLabel={hudState.activeMotionLabel}
        themeId={themeId}
        characterOpen={characterOpen}
        settingsOpen={settingsOpen}
        isPlaying={isPlaying}
        onToggleCharacters={() => {
          setCharacterOpen((prev) => {
            const next = !prev;
            if (next) setSettingsOpen(false);
            return next;
          });
        }}
        onToggleSettings={() => {
          setSettingsOpen((prev) => {
            const next = !prev;
            if (next) setCharacterOpen(false);
            return next;
          });
        }}
        onResetCamera={() => handleSelectCamera('full')}
      />

      <CharacterPopover
        open={characterOpen}
        onClose={() => setCharacterOpen(false)}
        activeCharacterId={hudState.activeCharacterId}
        modelLoaded={hudState.modelLoaded}
        loadProgress={hudState.loadProgress}
        onSelectCharacter={handleSelectCharacter}
        onUploadVrm={handleUploadVrm}
      />

      <SettingsPopover
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        themeId={themeId}
        onSelectTheme={handleSelectTheme}
        spotlightEnabled={spotlightEnabled}
        onToggleSpotlight={() => setSpotlightEnabled((prev) => !prev)}
        spotlightIntensity={spotlightIntensity}
        onChangeSpotlightIntensity={setSpotlightIntensity}
        autoExpression={autoExpression}
        onToggleExpression={() => setAutoExpression((prev) => !prev)}
      />

      {/* Non-blocking VRM loading progress / error banner */}
      {!hudState.modelLoaded && !hudState.loadError && (
        <div
          role="status"
          className="pointer-events-none absolute top-16 left-1/2 z-20 -translate-x-1/2 rounded-xl border border-white/12 bg-[#0e1118]/92 px-4 py-2 text-xs text-slate-200 shadow-lg"
        >
          正在加载 VRM 人物模型…{' '}
          <span className="font-mono-tabular text-amber-400">
            {hudState.loadProgress}%
          </span>
        </div>
      )}

      {hudState.loadError && (
        <div
          role="alert"
          className="absolute top-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-950/90 px-4 py-2.5 text-xs text-rose-100 shadow-lg"
        >
          <span>{hudState.loadError}</span>
          <button
            type="button"
            onClick={() => {
              try {
                window.localStorage.removeItem(CHARACTER_STORAGE_KEY);
              } catch {
                // Ignore storage access restriction
              }
              void stageRef.current?.loadDefaultModel();
            }}
            className="rounded-md bg-rose-500 px-2.5 py-1 font-medium text-white hover:bg-rose-400"
          >
            恢复默认人物
          </button>
        </div>
      )}

      <ControlDock
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((prev) => !prev)}
        isPlaying={isPlaying}
        onTogglePlay={() => void handleTogglePlay()}
        sourceMode={sourceMode}
        selectedTrackId={selectedTrackId}
        onSelectTrack={(id) => void handleSelectTrack(id)}
        onUploadAudio={(file) => void handleUploadAudio(file)}
        onToggleMic={() => void handleToggleMic()}
        motionMode={motionMode}
        onChangeMotionMode={(mode) => void handleChangeMotionMode(mode)}
        danceStyle={danceStyle}
        onSelectStyle={setDanceStyle}
        activeMotionId={hudState.activeMotionId}
        activeMotionLabel={hudState.activeMotionLabel}
        motionLoading={hudState.motionLoading}
        motionError={hudState.motionError}
        onSelectOpenSourceMotion={(id) => void handleSelectOpenSourceMotion(id)}
        onUploadMotionFile={(file) => void handleUploadMotionFile(file)}
        cameraPreset={cameraPreset}
        onSelectCamera={handleSelectCamera}
        intensity={intensity}
        onChangeIntensity={setIntensity}
        volume={volume}
        onChangeVolume={handleChangeVolume}
        autoExpression={autoExpression}
        onToggleExpression={() => setAutoExpression((prev) => !prev)}
        spectrumCanvasRef={spectrumCanvasRef}
        audioError={audioError}
      />
    </main>
  );
}
