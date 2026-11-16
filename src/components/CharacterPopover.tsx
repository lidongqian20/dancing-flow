import { Check, Upload, Users, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { BUILTIN_VRM_CHARACTERS } from '../scene/characterLibrary';

interface CharacterPopoverProps {
  open: boolean;
  onClose: () => void;
  activeCharacterId: string;
  modelLoaded: boolean;
  loadProgress: number;
  onSelectCharacter: (characterId: string) => void;
  onUploadVrm: (file: File) => void;
}

export function CharacterPopover({
  open,
  onClose,
  activeCharacterId,
  modelLoaded,
  loadProgress,
  onSelectCharacter,
  onUploadVrm,
}: CharacterPopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      if (target.closest('[data-character-toggle="true"]')) return;
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
      aria-label="选择舞台人物模型"
      className="pointer-events-auto fixed top-14 right-4 z-30 max-h-[calc(100dvh-5.5rem)] w-[min(360px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-white/14 bg-[#0e1118]/96 p-4 shadow-2xl sm:top-16 sm:right-6"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-100">切换舞台人物</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭人物切换面板"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 space-y-1.5" role="group" aria-label="内置免费 VRM 人物列表">
        {BUILTIN_VRM_CHARACTERS.map((char) => {
          const active = char.id === activeCharacterId;
          return (
            <button
              key={char.id}
              type="button"
              onClick={() => {
                onSelectCharacter(char.id);
                onClose();
              }}
              aria-pressed={active}
              className={`flex w-full items-center justify-between gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                active
                  ? 'border-amber-400/70 bg-amber-500/14 text-white'
                  : 'border-white/10 bg-[#151a25] text-slate-200 hover:border-white/25 hover:bg-[#19202e]'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 text-xs font-bold text-slate-950"
                  style={{ backgroundColor: char.accentHex }}
                >
                  {char.shortLabel.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-slate-100">
                      {char.label}
                    </span>
                    <span className="shrink-0 rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                      {char.vrmVersion}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                    {char.subtitle}
                  </p>
                  <p className="truncate text-[10px] text-slate-500">
                    {char.author} · {char.license}
                  </p>
                </div>
              </div>

              {active ? (
                <Check
                  className="h-4 w-4 shrink-0 text-amber-400"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3 border-t border-white/10 pt-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".vrm"
          className="hidden"
          aria-label="选择本地 VRM 模型文件"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onUploadVrm(file);
              e.target.value = '';
              onClose();
            }
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-[#161b26] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-amber-400/50 hover:bg-[#1c2332] hover:text-white focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          <Upload className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
          <span>导入本地自定义 .vrm 模型</span>
        </button>
        {!modelLoaded && (
          <p className="mt-2 text-center text-[11px] text-amber-300">
            正在加载人物模型… {loadProgress}%
          </p>
        )}
      </div>
    </section>
  );
}
