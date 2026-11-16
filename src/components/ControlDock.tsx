import {
  Camera,
  ChevronDown,
  ChevronUp,
  FileUp,
  Mic,
  MicOff,
  Music,
  Pause,
  Play,
  Smile,
  Volume2,
} from 'lucide-react';
import { useRef, type RefObject } from 'react';
import { SYNTH_TRACKS, type AudioSourceMode } from '../audio/musicEngine';
import { DANCE_STYLES, type DanceStyle } from '../dance/choreography';
import {
  OPEN_SOURCE_MOTIONS,
  type MotionPlaybackMode,
} from '../dance/motionLibrary';
import type { CameraPresetId } from '../scene/DanceStageScene';

interface ControlDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  sourceMode: AudioSourceMode;
  selectedTrackId: string;
  onSelectTrack: (trackId: string) => void;
  onUploadAudio: (file: File) => void;
  onToggleMic: () => void;
  motionMode: MotionPlaybackMode;
  onChangeMotionMode: (mode: MotionPlaybackMode) => void;
  danceStyle: DanceStyle;
  onSelectStyle: (style: DanceStyle) => void;
  activeMotionId: string;
  activeMotionLabel: string;
  motionLoading: boolean;
  motionError: string | null;
  onSelectOpenSourceMotion: (motionId: string) => void;
  onUploadMotionFile: (file: File) => void;
  cameraPreset: CameraPresetId;
  onSelectCamera: (preset: CameraPresetId) => void;
  intensity: number;
  onChangeIntensity: (value: number) => void;
  volume: number;
  onChangeVolume: (value: number) => void;
  autoExpression: boolean;
  onToggleExpression: () => void;
  spectrumCanvasRef: RefObject<HTMLCanvasElement | null>;
  audioError: string | null;
}

const CAMERA_OPTIONS: { id: CameraPresetId; label: string }[] = [
  { id: 'full', label: '全身' },
  { id: 'closeup', label: '特写' },
  { id: 'orbit', label: '环绕' },
  { id: 'low', label: '低角度' },
];

export function ControlDock({
  collapsed,
  onToggleCollapse,
  isPlaying,
  onTogglePlay,
  sourceMode,
  selectedTrackId,
  onSelectTrack,
  onUploadAudio,
  onToggleMic,
  motionMode,
  onChangeMotionMode,
  danceStyle,
  onSelectStyle,
  activeMotionId,
  activeMotionLabel,
  motionLoading,
  motionError,
  onSelectOpenSourceMotion,
  onUploadMotionFile,
  cameraPreset,
  onSelectCamera,
  intensity,
  onChangeIntensity,
  volume,
  onChangeVolume,
  autoExpression,
  onToggleExpression,
  spectrumCanvasRef,
  audioError,
}: ControlDockProps) {
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const motionInputRef = useRef<HTMLInputElement | null>(null);

  const selectedPreset = OPEN_SOURCE_MOTIONS.find((m) => m.id === activeMotionId);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-2.5 z-20 flex flex-col items-center px-3 sm:bottom-4">
      <div className="pointer-events-auto flex flex-col items-center">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? '展开控制栏' : '收起控制栏'}
          className="inline-flex min-h-[32px] items-center gap-1.5 rounded-xl border border-white/12 bg-[#0e1118]/94 px-3.5 py-1 text-xs font-medium text-slate-300 shadow-lg transition-colors hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          {collapsed ? (
            <>
              <ChevronUp className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              <span>展开控制栏 (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span>收起控制栏 (H)</span>
            </>
          )}
        </button>

        {/* Main unified bottom dock */}
        {!collapsed && (
          <section
            aria-label="舞台与音乐控制栏"
            className="mt-1.5 w-[min(1040px,96vw)] rounded-2xl border border-white/12 bg-[#0e1118]/94 p-2.5 shadow-2xl sm:px-3.5 sm:py-2.5"
          >
            {(audioError || motionError) && (
              <div
                role="alert"
                className="mb-2 rounded-lg border border-rose-500/30 bg-rose-950/60 px-3 py-1.5 text-xs text-rose-200"
              >
                {audioError ?? motionError}
              </div>
            )}

            {/* Row 1: Transport, Music Source, Live Spectrum & Intensity */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onTogglePlay}
                  className="inline-flex min-h-[36px] items-center gap-2 whitespace-nowrap rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-amber-300"
                  aria-label={isPlaying ? '暂停音乐与舞蹈' : '播放音乐并起舞'}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
                      <span>暂停</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                      <span>播放起舞</span>
                    </>
                  )}
                </button>

                <label className="sr-only" htmlFor="synth-track-select">
                  内置节拍曲目
                </label>
                <select
                  id="synth-track-select"
                  value={sourceMode === 'synth' ? selectedTrackId : ''}
                  onChange={(e) => {
                    if (e.target.value) onSelectTrack(e.target.value);
                  }}
                  aria-label="选择内置音乐曲目"
                  className="min-h-[36px] rounded-xl border border-white/12 bg-[#161b26] px-2.5 py-1 text-xs font-medium text-slate-100 outline-none transition-colors hover:border-white/25 focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  {sourceMode !== 'synth' && (
                    <option value="" disabled>
                      {sourceMode === 'file' ? '本地音频播放中' : '麦克风实时输入'}
                    </option>
                  )}
                  {SYNTH_TRACKS.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.title} ({track.bpm} BPM)
                    </option>
                  ))}
                </select>

                <input
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  aria-label="选择本地音频文件"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onUploadAudio(file);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                    sourceMode === 'file'
                      ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                      : 'border-white/12 bg-[#161b26] text-slate-200 hover:border-white/25'
                  }`}
                  aria-label="上传本地音乐文件"
                >
                  <Music className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>上传音乐</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleMic}
                  aria-pressed={sourceMode === 'mic'}
                  aria-label={sourceMode === 'mic' ? '关闭麦克风输入' : '开启麦克风实时律动'}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                    sourceMode === 'mic'
                      ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-300'
                      : 'border-white/12 bg-[#161b26] text-slate-200 hover:border-white/25'
                  }`}
                >
                  {sourceMode === 'mic' ? (
                    <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <MicOff className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  )}
                  <span>麦克风</span>
                </button>
              </div>

              {/* Live frequency analyzer + sliders */}
              <div className="flex flex-1 items-center justify-end gap-3.5">
                <canvas
                  ref={spectrumCanvasRef}
                  width={144}
                  height={28}
                  aria-label="实时音频频谱波形"
                  className="hidden h-7 w-36 rounded-lg bg-[#090b10] px-1 md:block"
                />

                <div className="flex items-center gap-2">
                  <label
                    htmlFor="dance-intensity-slider"
                    className="whitespace-nowrap text-xs text-slate-300"
                  >
                    幅度
                  </label>
                  <input
                    id="dance-intensity-slider"
                    type="range"
                    min={0.5}
                    max={1.65}
                    step={0.05}
                    value={intensity}
                    onChange={(e) => onChangeIntensity(parseFloat(e.target.value))}
                    aria-label="舞蹈律动幅度"
                    className="studio-slider w-20 sm:w-24"
                  />
                  <span className="font-mono-tabular w-9 text-right text-xs text-slate-300">
                    {intensity.toFixed(1)}x
                  </span>
                </div>

                <div className="hidden items-center gap-2 sm:flex">
                  <Volume2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
                    aria-label="主音量"
                    className="studio-slider w-16"
                  />
                </div>
              </div>
            </div>

            {/* Row 2: Motion Mode Toggle + Choreography / Open-Source Mocap Library */}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex max-w-full flex-wrap items-center gap-1.5">
                <div
                  role="tablist"
                  aria-label="动作来源模式"
                  className="flex shrink-0 items-center gap-1 rounded-xl border border-white/8 bg-[#121620] p-0.5"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={motionMode === 'procedural'}
                    onClick={() => onChangeMotionMode('procedural')}
                    className={`min-h-[30px] whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                      motionMode === 'procedural'
                        ? 'bg-slate-200 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    实时编舞
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={motionMode === 'mocap'}
                    onClick={() => onChangeMotionMode('mocap')}
                    className={`min-h-[30px] whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                      motionMode === 'mocap'
                        ? 'bg-slate-200 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    开源动作库
                  </button>
                </div>

                {motionMode === 'procedural' ? (
                  <div
                    role="group"
                    aria-label="选择舞蹈类型"
                    className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-[#161b26] p-0.5"
                  >
                    {DANCE_STYLES.map((style) => {
                      const active = danceStyle === style.id;
                      return (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() => onSelectStyle(style.id)}
                          aria-pressed={active}
                          title={style.description}
                          className={`min-h-[30px] shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                            active
                              ? 'bg-amber-500 text-slate-950 shadow-sm'
                              : 'text-slate-300 hover:bg-white/6 hover:text-white'
                          }`}
                        >
                          {style.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    role="group"
                    aria-label="选择开源动捕舞蹈"
                    className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-[#161b26] p-0.5"
                  >
                    {OPEN_SOURCE_MOTIONS.map((motion) => {
                      const active = activeMotionId === motion.id;
                      return (
                        <button
                          key={motion.id}
                          type="button"
                          onClick={() => onSelectOpenSourceMotion(motion.id)}
                          aria-pressed={active}
                          title={`${motion.label} · ${motion.sourceRepo} (${motion.license})`}
                          className={`min-h-[30px] shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                            active
                              ? 'bg-amber-500 text-slate-950 shadow-sm'
                              : 'text-slate-300 hover:bg-white/6 hover:text-white'
                          }`}
                        >
                          {motion.shortLabel}
                        </button>
                      );
                    })}

                    <input
                      ref={motionInputRef}
                      type="file"
                      accept=".bvh,.vrma"
                      className="hidden"
                      aria-label="导入本地 BVH 或 VRMA 动作文件"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          onUploadMotionFile(file);
                          e.target.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => motionInputRef.current?.click()}
                      aria-label="导入本地 BVH 或 VRMA 动作"
                      className={`inline-flex min-h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                        activeMotionId === 'custom'
                          ? 'bg-cyan-400 text-slate-950'
                          : 'text-slate-300 hover:bg-white/6 hover:text-white'
                      }`}
                    >
                      <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>导入</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <div
                  role="group"
                  aria-label="选择相机视角"
                  className="flex items-center gap-1 rounded-xl bg-[#161b26] p-0.5"
                >
                  <Camera
                    className="mx-1 hidden h-3.5 w-3.5 text-slate-400 sm:block"
                    aria-hidden="true"
                  />
                  {CAMERA_OPTIONS.map((cam) => {
                    const active = cameraPreset === cam.id;
                    return (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => onSelectCamera(cam.id)}
                        aria-pressed={active}
                        className={`min-h-[30px] shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                          active
                            ? 'bg-slate-200 text-slate-950'
                            : 'text-slate-300 hover:bg-white/6 hover:text-white'
                        }`}
                      >
                        {cam.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={onToggleExpression}
                  aria-pressed={autoExpression}
                  aria-label="切换随音乐自动表情"
                  className={`inline-flex min-h-[34px] shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                    autoExpression
                      ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                      : 'border-white/12 bg-[#161b26] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Smile className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden lg:inline">自动表情</span>
                </button>
              </div>
            </div>

            {/* Compact attribution bar only when Open-Source Mocap tab is active */}
            {motionMode === 'mocap' && (
              <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-white/6 pt-1.5 text-[11px] text-slate-400">
                <span className="truncate">
                  {motionLoading
                    ? `正在解析并重定向骨骼动作「${activeMotionLabel}」…`
                    : selectedPreset
                      ? `${selectedPreset.label}（${selectedPreset.durationLabel} · 原速 ${selectedPreset.nativeBpm} BPM）— ${selectedPreset.description}`
                      : `已加载自定义动作：${activeMotionLabel}`}
                </span>
                <span className="hidden shrink-0 font-mono-tabular text-slate-500 sm:inline">
                  {selectedPreset
                    ? `${selectedPreset.sourceRepo} (${selectedPreset.license})`
                    : 'BVH / VRMA'}
                </span>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
