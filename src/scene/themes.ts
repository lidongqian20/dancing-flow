export type StageThemeId =
  | 'auto'
  | 'cyber'
  | 'sunset'
  | 'aurora'
  | 'sakura'
  | 'monochrome';

export interface StageThemePalette {
  id: StageThemeId;
  label: string;
  description: string;
  /** Primary accent (bass / ring / left spotlight) */
  primaryHex: string;
  /** Secondary accent (mid-treble / EQ tip / right spotlight) */
  secondaryHex: string;
  /** Peak highlight color on beat/treble spikes */
  highlightHex: string;
  /** Rim light tint */
  rimHex: string;
  /** Studio scene background & exponential fog color */
  backgroundHex: string;
  /** Dust particle tint */
  dustHex: string;
}

export const STAGE_THEMES: StageThemePalette[] = [
  {
    id: 'auto',
    label: '随舞自适应',
    description: '跟随当前舞蹈风格或开源动作自动配色',
    primaryHex: '#f59e0b',
    secondaryHex: '#38bdf8',
    highlightHex: '#fde68a',
    rimHex: '#5eead4',
    backgroundHex: '#0b0d13',
    dustHex: '#fde68a',
  },
  {
    id: 'cyber',
    label: '霓虹赛博',
    description: '电光青与洋红双色碰撞的赛博舞台',
    primaryHex: '#22d3ee',
    secondaryHex: '#f43f5e',
    highlightHex: '#a5f3fc',
    rimHex: '#818cf8',
    backgroundHex: '#070b16',
    dustHex: '#67e8f9',
  },
  {
    id: 'sunset',
    label: '琥珀落日',
    description: '暖金琥珀与珊瑚橙的日落余晖氛围',
    primaryHex: '#f59e0b',
    secondaryHex: '#fb7185',
    highlightHex: '#fef08a',
    rimHex: '#fdba74',
    backgroundHex: '#120c0d',
    dustHex: '#fed7aa',
  },
  {
    id: 'aurora',
    label: '极光翡翠',
    description: '翡翠绿与冰晶蓝交织的极夜光束',
    primaryHex: '#34d399',
    secondaryHex: '#38bdf8',
    highlightHex: '#bbf7d0',
    rimHex: '#2dd4bf',
    backgroundHex: '#071115',
    dustHex: '#a7f3d0',
  },
  {
    id: 'sakura',
    label: '樱粉星夜',
    description: '樱花粉与丁香紫交融的偶像舞台',
    primaryHex: '#f472b6',
    secondaryHex: '#c084fc',
    highlightHex: '#fbcfe8',
    rimHex: '#e879f9',
    backgroundHex: '#120a15',
    dustHex: '#f5d0fe',
  },
  {
    id: 'monochrome',
    label: '银白剧场',
    description: '高对比度纯净黑白与冷银戏剧追光',
    primaryHex: '#f8fafc',
    secondaryHex: '#94a3b8',
    highlightHex: '#ffffff',
    rimHex: '#cbd5e1',
    backgroundHex: '#090a0d',
    dustHex: '#e2e8f0',
  },
];

export interface SpectrumBandsSummary {
  lowEnergy: number;
  midEnergy: number;
  highEnergy: number;
  /** 0 (bass-heavy) .. 1 (treble-heavy) */
  spectralTilt: number;
}

export function getStageThemeById(themeId: StageThemeId): StageThemePalette {
  return STAGE_THEMES.find((t) => t.id === themeId) ?? STAGE_THEMES[0];
}

/**
 * Summarize a 24-band log spectrum into low/mid/high energies and a normalized spectral tilt [0..1]
 * to drive dynamic spotlight cone angles, sweep angles, and color transitions.
 */
export function summarizeSpectrumForSpotlight(
  spectrumBands: readonly number[],
): SpectrumBandsSummary {
  const n = spectrumBands.length;
  if (n === 0) {
    return { lowEnergy: 0, midEnergy: 0, highEnergy: 0, spectralTilt: 0.5 };
  }

  const lowEnd = Math.max(1, Math.floor(n * 0.28));
  const midEnd = Math.max(lowEnd + 1, Math.floor(n * 0.68));

  let lowSum = 0;
  for (let i = 0; i < lowEnd; i++) {
    lowSum += clamp01(spectrumBands[i] ?? 0);
  }
  const lowEnergy = lowSum / lowEnd;

  let midSum = 0;
  for (let i = lowEnd; i < midEnd; i++) {
    midSum += clamp01(spectrumBands[i] ?? 0);
  }
  const midEnergy = midSum / Math.max(1, midEnd - lowEnd);

  let highSum = 0;
  for (let i = midEnd; i < n; i++) {
    highSum += clamp01(spectrumBands[i] ?? 0);
  }
  const highEnergy = highSum / Math.max(1, n - midEnd);

  const total = lowEnergy + midEnergy + highEnergy;
  const spectralTilt =
    total > 0.02
      ? clamp01((midEnergy * 0.55 + highEnergy * 1.15) / (lowEnergy + midEnergy * 0.55 + highEnergy * 1.15))
      : 0.5;

  return {
    lowEnergy: clamp01(lowEnergy),
    midEnergy: clamp01(midEnergy),
    highEnergy: clamp01(highEnergy),
    spectralTilt,
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
