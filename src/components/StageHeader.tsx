import { ChevronDown, RotateCcw, SlidersHorizontal, Users } from 'lucide-react';
import { DANCE_STYLES, type ConcreteDanceStyle } from '../dance/choreography';
import type { MotionPlaybackMode } from '../dance/motionLibrary';
import { getCharacterById } from '../scene/characterLibrary';
import { getStageThemeById, type StageThemeId } from '../scene/themes';

interface StageHeaderProps {
  modelLoaded: boolean;
  activeCharacterId: string;
  modelName: string;
  bpm: number;
  trackLabel: string;
  motionMode: MotionPlaybackMode;
  activeStyle: ConcreteDanceStyle;
  activeMotifLabel: string;
  activeMotionLabel: string;
  themeId: StageThemeId;
  characterOpen: boolean;
  settingsOpen: boolean;
  isPlaying: boolean;
  onToggleCharacters: () => void;
  onToggleSettings: () => void;
  onResetCamera: () => void;
}

export function StageHeader({
  modelLoaded,
  activeCharacterId,
  modelName,
  bpm,
  trackLabel,
  motionMode,
  activeStyle,
  activeMotifLabel,
  activeMotionLabel,
  themeId,
  characterOpen,
  settingsOpen,
  isPlaying,
  onToggleCharacters,
  onToggleSettings,
  onResetCamera,
}: StageHeaderProps) {
  const activeStyleMeta = DANCE_STYLES.find((s) => s.id === activeStyle);
  const styleLabel = activeStyleMeta?.label ?? activeStyle;
  const danceDisplay =
    motionMode === 'mocap'
      ? activeMotionLabel
      : activeMotifLabel && activeMotifLabel !== '待机呼吸'
        ? `${styleLabel} · ${activeMotifLabel}`
        : styleLabel;
  const activeTheme = getStageThemeById(themeId);
  const characterPreset =
    activeCharacterId === 'custom' ? null : getCharacterById(activeCharacterId);
  const characterButtonLabel = characterPreset ? characterPreset.shortLabel : modelName;

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-[#0e1118]/90 px-3.5 py-2 shadow-lg">
        <h1 className="font-display whitespace-nowrap text-base font-semibold tracking-tight text-slate-50 sm:text-lg">
          VRM 律动舞室
        </h1>
        <span className="hidden text-slate-600 sm:inline" aria-hidden="true">
          ·
        </span>
        <div className="hidden items-center gap-2 text-xs text-slate-300 sm:flex">
          <span className="font-mono-tabular text-amber-400" data-testid="bpm-readout">
            {bpm} BPM
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="max-w-[140px] truncate">{trackLabel}</span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span
            className="max-w-[220px] truncate whitespace-nowrap text-slate-200"
            data-testid="active-style-label"
            title={danceDisplay}
          >
            {isPlaying ? danceDisplay : '待机呼吸'}
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="max-w-[145px] truncate text-slate-400" title={modelName}>
            {modelLoaded ? modelName : '模型加载中'}
          </span>
        </div>
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          data-character-toggle="true"
          onClick={onToggleCharacters}
          aria-expanded={characterOpen}
          aria-label="打开人物模型切换面板"
          className={`inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
            characterOpen
              ? 'border-amber-400/70 bg-amber-500/20 text-amber-300'
              : 'border-white/10 bg-[#0e1118]/90 text-slate-200 hover:border-white/25 hover:bg-[#171c28]'
          }`}
        >
          <Users
            className="h-3.5 w-3.5"
            style={{ color: characterPreset?.accentHex ?? '#f59e0b' }}
            aria-hidden="true"
          />
          <span className="max-w-[84px] truncate">{characterButtonLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onResetCamera}
          className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-[#0e1118]/90 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/25 hover:bg-[#171c28] focus-visible:outline-2 focus-visible:outline-amber-400"
          aria-label="重置舞台视角"
        >
          <RotateCcw className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
          <span className="hidden sm:inline">重置视角</span>
        </button>

        <button
          type="button"
          data-settings-toggle="true"
          onClick={onToggleSettings}
          aria-expanded={settingsOpen}
          aria-label="打开颜色主题与聚光灯设置"
          className={`inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
            settingsOpen
              ? 'border-amber-400/70 bg-amber-500/20 text-amber-300'
              : 'border-white/10 bg-[#0e1118]/90 text-slate-200 hover:border-white/25 hover:bg-[#171c28]'
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">设置</span>
          {themeId !== 'auto' && (
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-sm border border-white/30"
              style={{ backgroundColor: activeTheme.primaryHex }}
            />
          )}
        </button>
      </div>
    </header>
  );
}
