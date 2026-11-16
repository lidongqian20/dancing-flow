import { Check, Sparkles, SunMedium, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { STAGE_THEMES, type StageThemeId } from '../scene/themes';

interface SettingsPopoverProps {
  open: boolean;
  onClose: () => void;
  themeId: StageThemeId;
  onSelectTheme: (themeId: StageThemeId) => void;
  spotlightEnabled: boolean;
  onToggleSpotlight: () => void;
  spotlightIntensity: number;
  onChangeSpotlightIntensity: (value: number) => void;
  autoExpression: boolean;
  onToggleExpression: () => void;
}

export function SettingsPopover({
  open,
  onClose,
  themeId,
  onSelectTheme,
  spotlightEnabled,
  onToggleSpotlight,
  spotlightIntensity,
  onChangeSpotlightIntensity,
  autoExpression,
  onToggleExpression,
}: SettingsPopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-settings-toggle="true"]')) return;
      if (panelRef.current && !panelRef.current.contains(target)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <section
      ref={panelRef}
      role="dialog"
      aria-label="舞台与视觉设置"
      className="pointer-events-auto fixed top-14 right-4 z-30 w-[min(350px,calc(100vw-2rem))] rounded-2xl border border-white/14 bg-[#0e1118]/96 p-4 shadow-2xl sm:top-16 sm:right-6"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-100">舞台与视觉设置</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭设置面板"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Color Theme Grid */}
      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">颜色主题</span>
          <span className="text-[11px] text-slate-500">同步舞台灯光与背景</span>
        </div>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="选择舞台颜色主题">
          {STAGE_THEMES.map((theme) => {
            const active = theme.id === themeId;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onSelectTheme(theme.id)}
                aria-pressed={active}
                title={theme.description}
                className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                  active
                    ? 'border-amber-400/70 bg-amber-500/14 text-white'
                    : 'border-white/10 bg-[#151a25] text-slate-300 hover:border-white/25 hover:text-white'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex h-4 w-4 shrink-0 overflow-hidden rounded-md border border-white/20"
                  >
                    <span
                      className="h-full w-1/2"
                      style={{ backgroundColor: theme.primaryHex }}
                    />
                    <span
                      className="h-full w-1/2"
                      style={{ backgroundColor: theme.secondaryHex }}
                    />
                  </span>
                  <span className="truncate text-xs font-medium">{theme.label}</span>
                </span>
                {active && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Spectrum Spotlight Controls */}
      <div className="mt-4 space-y-2.5 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
            <SunMedium className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            <span>频谱动态聚光灯</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={spotlightEnabled}
            onClick={onToggleSpotlight}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
              spotlightEnabled
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-300'
                : 'border-white/12 bg-[#161b26] text-slate-400 hover:text-slate-200'
            }`}
          >
            {spotlightEnabled ? '已开启' : '已关闭'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="spotlight-intensity-slider"
            className="whitespace-nowrap text-xs text-slate-400"
          >
            光束亮度
          </label>
          <input
            id="spotlight-intensity-slider"
            type="range"
            min={0.4}
            max={1.8}
            step={0.05}
            value={spotlightIntensity}
            disabled={!spotlightEnabled}
            onChange={(e) => onChangeSpotlightIntensity(parseFloat(e.target.value))}
            aria-label="聚光灯光束亮度"
            className="studio-slider flex-1 disabled:opacity-40"
          />
          <span className="font-mono-tabular w-9 text-right text-xs text-slate-300">
            {spotlightIntensity.toFixed(1)}x
          </span>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-slate-300">随音乐自动表情</span>
          <button
            type="button"
            role="switch"
            aria-checked={autoExpression}
            onClick={onToggleExpression}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
              autoExpression
                ? 'border-amber-400/60 bg-amber-500/20 text-amber-300'
                : 'border-white/12 bg-[#161b26] text-slate-400 hover:text-slate-200'
            }`}
          >
            {autoExpression ? '已开启' : '已关闭'}
          </button>
        </div>
      </div>
    </section>
  );
}
