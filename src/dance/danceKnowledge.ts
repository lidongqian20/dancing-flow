import type { AudioMetrics } from '../audio/beatDetector';

export type ConcreteDanceStyle =
  | 'hiphop'
  | 'idol'
  | 'urban'
  | 'robot'
  | 'house'
  | 'latin'
  | 'waltz';

export type DanceStyle = 'auto' | ConcreteDanceStyle;

export type GrooveEnvelopeKind =
  | 'down-bounce'
  | 'up-bounce'
  | 'isolation-lock'
  | 'dime-stop'
  | 'jacking-wave'
  | 'cuban-motion'
  | 'lyrical-arc';

export interface DanceMotifSpec {
  id: string;
  label: string;
  aestheticCue: string;
  energyBias: 'groove' | 'accent' | 'level-change' | 'climax';
}

export interface StyleKnowledgeProfile {
  id: ConcreteDanceStyle;
  label: string;
  shortLabel: string;
  description: string;
  accentHex: string;
  timeSignatureBeats: 3 | 4;
  phraseLengthBeats: 12 | 16;
  tempoRange: { min: number; max: number };
  grooveCurve: GrooveEnvelopeKind;
  kineticChainLag: {
    spine: number;
    chest: number;
    upperChest: number;
    head: number;
    wrist: number;
  };
  motifs: [DanceMotifSpec, DanceMotifSpec, DanceMotifSpec, DanceMotifSpec];
}

export const DANCE_STYLE_KNOWLEDGE: Record<
  ConcreteDanceStyle,
  StyleKnowledgeProfile
> = {
  hiphop: {
    id: 'hiphop',
    label: '街舞 Hip-Hop',
    shortLabel: '街舞',
    description: 'Down-Bounce 重拍下沉、胸腔隔离、Milly Rock 摆臂与第 4 小节定格回眸',
    accentHex: '#fb923c',
    timeSignatureBeats: 4,
    phraseLengthBeats: 16,
    tempoRange: { min: 86, max: 124 },
    grooveCurve: 'down-bounce',
    kineticChainLag: {
      spine: 0.08,
      chest: 0.14,
      upperChest: 0.19,
      head: 0.24,
      wrist: 0.28,
    },
    motifs: [
      {
        id: 'hh-down-bounce',
        label: 'Down-Bounce 律动',
        aestheticCue: '重拍屈膝下沉、肩部交替顶胯、手腕低位随拍甩动',
        energyBias: 'groove',
      },
      {
        id: 'hh-chest-rock',
        label: '胸腔 Rock 隔离',
        aestheticCue: '脊柱顺滑 C 型波浪接 1/3 拍胸腔前顶，头部滞后轻点',
        energyBias: 'accent',
      },
      {
        id: 'hh-milly-rock',
        label: 'Milly Rock 摆臂',
        aestheticCue: '横向重心滑步配双前臂画圆摇摆与肩部对侧拧转',
        energyBias: 'level-change',
      },
      {
        id: 'hh-freeze-look',
        label: '定格回眸 Hit',
        aestheticCue: '第 13–14 拍蓄力下蹲，第 15 拍斜向开胸定格并转头聚焦',
        energyBias: 'climax',
      },
    ],
  },
  idol: {
    id: 'idol',
    label: '流行 Idol Pop',
    shortLabel: '流行',
    description: '元气 Up-Bounce 弹跳、双臂彩虹弧线、舞台指点与甜美 Finale 定格',
    accentHex: '#f472b6',
    timeSignatureBeats: 4,
    phraseLengthBeats: 16,
    tempoRange: { min: 112, max: 148 },
    grooveCurve: 'up-bounce',
    kineticChainLag: {
      spine: 0.06,
      chest: 0.11,
      upperChest: 0.16,
      head: 0.2,
      wrist: 0.25,
    },
    motifs: [
      {
        id: 'idol-cheer-frame',
        label: '元气比心框架',
        aestheticCue: '反拍轻盈弹起，胸前手臂对称勾勒配俏皮歪头（Épaulement）',
        energyBias: 'groove',
      },
      {
        id: 'idol-rainbow-step',
        label: '侧点步彩虹挥臂',
        aestheticCue: '左右轻点步延伸脚背，双臂划出高低错落的弧形波浪',
        energyBias: 'accent',
      },
      {
        id: 'idol-spotlight-point',
        label: '舞台指点互动',
        aestheticCue: 'S 型送胯配合单手叉腰外展、单手向镜头斜前方节奏点指',
        energyBias: 'level-change',
      },
      {
        id: 'idol-star-finale',
        label: '星光高举定格',
        aestheticCue: '14 拍轻屈蓄力后 15–16 拍双臂斜上高举舒展并灿烂微笑',
        energyBias: 'climax',
      },
    ],
  },
  urban: {
    id: 'urban',
    label: 'Urban / K-Pop 编舞',
    shortLabel: 'Urban',
    description: '现代舞台质感：反拍顿点锁定、面框几何线条、自上而下 Body Wave 与 Kill-Part',
    accentHex: '#e879f9',
    timeSignatureBeats: 4,
    phraseLengthBeats: 16,
    tempoRange: { min: 96, max: 136 },
    grooveCurve: 'isolation-lock',
    kineticChainLag: {
      spine: 0.1,
      chest: 0.17,
      upperChest: 0.24,
      head: 0.14,
      wrist: 0.3,
    },
    motifs: [
      {
        id: 'urban-snare-lock',
        label: '反拍顿点锁胸',
        aestheticCue: '2/4 拍鼓点瞬间锁住胸廓与斜向手刀，余拍丝滑卸力缓冲',
        energyBias: 'accent',
      },
      {
        id: 'urban-face-frame',
        label: '斜角面框线',
        aestheticCue: '小臂沿锁骨与面庞斜侧构建利落折线，配合胯部反向拧转',
        energyBias: 'groove',
      },
      {
        id: 'urban-body-wave',
        label: '颈胸胯波浪 Wave',
        aestheticCue: '自上胸—脊柱—骨盆依次传递 S 形波浪，腕部柔顺拖尾',
        energyBias: 'level-change',
      },
      {
        id: 'urban-kill-part',
        label: 'Kill-Part 聚焦',
        aestheticCue: '收肩低颌凝视镜头，单臂斜伸划出修长对角舞台剪影',
        energyBias: 'climax',
      },
    ],
  },
  robot: {
    id: 'robot',
    label: '机械舞 Popping',
    shortLabel: '机械舞',
    description: 'Dime-Stop 急停回弹、King Tutting 直角折框、伺服扫视与断电重启 Pop',
    accentHex: '#38bdf8',
    timeSignatureBeats: 4,
    phraseLengthBeats: 16,
    tempoRange: { min: 88, max: 128 },
    grooveCurve: 'dime-stop',
    kineticChainLag: {
      spine: 0.0,
      chest: 0.02,
      upperChest: 0.04,
      head: 0.05,
      wrist: 0.08,
    },
    motifs: [
      {
        id: 'robot-dime-stop',
        label: 'Dime-Stop 震点',
        aestheticCue: '关节高速到位后瞬间刹车并带微幅惯性回弹，胸胯独立锁止',
        energyBias: 'accent',
      },
      {
        id: 'robot-tutting-box',
        label: 'Tutting 几何折框',
        aestheticCue: '前臂与腕部依次切换 90° L 型框架、头顶方框与交错折叠',
        energyBias: 'groove',
      },
      {
        id: 'robot-hydraulic-scan',
        label: '伺服分段扫视',
        aestheticCue: '头胸如步进电机般伴随十六分音符微颤平扫，稳健屈膝重心',
        energyBias: 'level-change',
      },
      {
        id: 'robot-reboot-pop',
        label: '断电重启爆发',
        aestheticCue: '13–14 拍渐进垂首卸力，15 拍瞬间胸肩震点爆发起立定格',
        energyBias: 'climax',
      },
    ],
  },
  house: {
    id: 'house',
    label: '轻快 House',
    shortLabel: 'House',
    description: '经典 Jacking 胸胯波、高抬膝 Shuffle、Loose-Legs 滑步与舒展开放摆臂',
    accentHex: '#34d399',
    timeSignatureBeats: 4,
    phraseLengthBeats: 16,
    tempoRange: { min: 116, max: 142 },
    grooveCurve: 'jacking-wave',
    kineticChainLag: {
      spine: 0.07,
      chest: 0.14,
      upperChest: 0.2,
      head: 0.25,
      wrist: 0.24,
    },
    motifs: [
      {
        id: 'house-classic-jack',
        label: 'Classic Jacking',
        aestheticCue: '胸廓与骨盆持续做前后弹性波浪（Jack），双臂自然随律动甩开',
        energyBias: 'groove',
      },
      {
        id: 'house-high-shuffle',
        label: '高抬膝 Shuffle',
        aestheticCue: '交替轻快抬膝点地配脚踝弹性勾绷，上身保持反向呼吸波',
        energyBias: 'accent',
      },
      {
        id: 'house-loose-legs',
        label: 'Loose-Legs 外摆滑步',
        aestheticCue: '双膝与髋部做流畅外旋侧滑，手臂舒展交叉划出空气感',
        energyBias: 'level-change',
      },
      {
        id: 'house-loft-release',
        label: 'Loft 展臂释放',
        aestheticCue: '后半小节双臂随高频能量敞开向上扬起，落拍稳沉回 Jack',
        energyBias: 'climax',
      },
    ],
  },
  latin: {
    id: 'latin',
    label: '拉丁 Salsa 律动',
    shortLabel: '拉丁',
    description: '古巴式 8 字摆胯、Cucaracha 侧踩、肩胸分离抖动与手腕花式收尾',
    accentHex: '#fb7185',
    timeSignatureBeats: 4,
    phraseLengthBeats: 16,
    tempoRange: { min: 92, max: 132 },
    grooveCurve: 'cuban-motion',
    kineticChainLag: {
      spine: 0.09,
      chest: 0.15,
      upperChest: 0.22,
      head: 0.18,
      wrist: 0.32,
    },
    motifs: [
      {
        id: 'latin-cuban-8',
        label: 'Cuban 8 字摆胯',
        aestheticCue: '快快慢（1-2-3）膝关节交替伸直推动骨盆画 8 字，上身挺拔',
        energyBias: 'groove',
      },
      {
        id: 'latin-cucaracha',
        label: 'Cucaracha 侧踩',
        aestheticCue: '左右重心外探破步，胸肋对侧挤压与双肩弹性律动',
        energyBias: 'accent',
      },
      {
        id: 'latin-cross-lead',
        label: '斜线转身与花手',
        aestheticCue: '躯干随领舞弧线斜转，腕部带出流畅优雅的拉丁绕腕曲线',
        energyBias: 'level-change',
      },
      {
        id: 'latin-check-flair',
        label: 'Check 定格甩尾',
        aestheticCue: '第 7 拍帅气斜踏 Check 定格，单臂上扬展胸配高傲回眸',
        energyBias: 'climax',
      },
    ],
  },
  waltz: {
    id: 'waltz',
    label: '优雅华尔兹',
    shortLabel: '华尔兹',
    description: '三拍子升降呼吸（Rise & Fall）、古典 Port de Bras 手位、螺旋波浪与舞台谢礼',
    accentHex: '#a78bfa',
    timeSignatureBeats: 3,
    phraseLengthBeats: 12,
    tempoRange: { min: 72, max: 112 },
    grooveCurve: 'lyrical-arc',
    kineticChainLag: {
      spine: 0.12,
      chest: 0.22,
      upperChest: 0.32,
      head: 0.4,
      wrist: 0.48,
    },
    motifs: [
      {
        id: 'waltz-rise-fall',
        label: '三拍升降波浪',
        aestheticCue: '第 1 拍深 Plié 沉降，第 2–3 拍延展脊柱高升并悬停呼吸',
        energyBias: 'groove',
      },
      {
        id: 'waltz-port-de-bras',
        label: 'Port de Bras 古典手位',
        aestheticCue: '单臂如芭蕾高位圆弧举起，另臂斜展延伸，颈肩柔和倾斜',
        energyBias: 'accent',
      },
      {
        id: 'waltz-spiral-sway',
        label: '螺旋摇曳延伸',
        aestheticCue: '脊柱与上胸呈多节段延迟螺旋倾斜，后脚轻柔后点拉伸线条',
        energyBias: 'level-change',
      },
      {
        id: 'waltz-reverence',
        label: '舒展谢礼悬停',
        aestheticCue: '第 10–11 拍大开胸怀扬臂吸气，第 12 拍柔缓低头微鞠谢幕',
        energyBias: 'climax',
      },
    ],
  },
};

export interface PhraseTimingState {
  barIndex: 0 | 1 | 2 | 3;
  nextBarIndex: 0 | 1 | 2 | 3;
  beatInBar: number;
  barPhase: number;
  blendToNext: number;
  motif: DanceMotifSpec;
  nextMotif: DanceMotifSpec;
}

/**
 * Computes deterministic 4-bar phrase coordinates and smooth crossfade factor
 * across the end of each bar so choreographic transitions flow naturally.
 */
export function selectPhraseMotif(
  style: ConcreteDanceStyle,
  beatTotal: number,
): PhraseTimingState {
  const profile = DANCE_STYLE_KNOWLEDGE[style];
  const barBeats = profile.timeSignatureBeats;
  const safeBeats = Number.isFinite(beatTotal) && beatTotal >= 0 ? beatTotal : 0;
  const absoluteBar = Math.floor(safeBeats / barBeats);
  const barIndex = (absoluteBar % 4) as 0 | 1 | 2 | 3;
  const nextBarIndex = ((barIndex + 1) % 4) as 0 | 1 | 2 | 3;
  const beatInBar = safeBeats - absoluteBar * barBeats;
  const barPhase = Math.max(0, Math.min(0.999999, beatInBar / barBeats));

  // Crossfade over the final 14% of each bar (~0.56 beat in 4/4) except snappy robot
  const transitionWindow = style === 'robot' ? 0.06 : 0.14;
  const transitionStart = 1 - transitionWindow;
  let blendToNext = 0;
  if (barPhase > transitionStart) {
    const t = (barPhase - transitionStart) / transitionWindow;
    blendToNext = t * t * (3 - 2 * t);
  }

  return {
    barIndex,
    nextBarIndex,
    beatInBar,
    barPhase,
    blendToNext,
    motif: profile.motifs[barIndex],
    nextMotif: profile.motifs[nextBarIndex],
  };
}

/**
 * Hip-Hop down-bounce: quick drop into beat (phase ~0.12), buoyant rise toward '&' (~0.55).
 */
export function downBounceEnvelope(beatPhase: number): number {
  const p = wrapUnit(beatPhase);
  // Peaked drop shortly after beat onset, cushioned rebound before next beat
  return Math.pow(0.5 + 0.5 * Math.cos((p - 0.1) * Math.PI * 2), 1.35);
}

/**
 * Idol Pop up-bounce: lifts cheerfully on '&' off-beats while touching down crisply on beat.
 */
export function upBounceEnvelope(beatPhase: number): number {
  const p = wrapUnit(beatPhase);
  return Math.pow(Math.abs(Math.sin(p * Math.PI)), 0.85);
}

/**
 * Popping/Robot dime-stop curve: snaps rapidly to target pose with slight micro-rebound.
 */
export function dimeStopEnvelope(
  beatTotal: number,
  stepsPerBeat: number,
  sharpness = 0.18,
): { stepIndex: number; smoothStep: number; hitRebound: number } {
  const scaled = Math.max(0, beatTotal) * stepsPerBeat;
  const stepIndex = Math.floor(scaled);
  const frac = scaled - stepIndex;
  const snapped = Math.pow(frac, sharpness);
  // Subtle muscle-hit rebound right after snap (frac 0.08..0.32)
  const hitRebound =
    frac < 0.35 ? Math.sin((frac / 0.35) * Math.PI) * (1 - frac / 0.35) : 0;
  return {
    stepIndex,
    smoothStep: stepIndex + snapped,
    hitRebound,
  };
}

/**
 * Latin Cuban figure-8 pelvic pendulum aligned to quick-quick-slow (1-2-3, 5-6-7) phrasing.
 */
export function cubanHipWave(beatInBar: number): {
  lateral: number;
  yaw: number;
  roll: number;
} {
  // 4-beat Salsa cycle: sharp hip settles on 1, 2, 3 and lingers lusciously on 4
  const phase = (beatInBar / 4) * Math.PI * 2;
  const lateral = Math.sin(phase) * 0.72 + Math.sin(phase * 2) * 0.28;
  const yaw = Math.cos(phase) * 0.65 - Math.sin(phase * 2) * 0.22;
  const roll = Math.sin(phase + 0.35) * 0.85;
  return { lateral, yaw, roll };
}

/**
 * Classical 3/4 Waltz Rise & Fall: deep grounded plié on Beat 1, soaring lift through Beat 2–3.
 */
export function lyricalRiseFall(barPhase: number): {
  rise: number;
  breath: number;
} {
  const p = wrapUnit(barPhase);
  // Lowest on beat 1 (p=0.05), highest suspension around beat 2.6 (p=0.68)
  const rise = 0.5 - 0.5 * Math.cos((p - 0.05) * Math.PI * 2);
  const breath = Math.sin(p * Math.PI * 2 - 0.4);
  return { rise, breath };
}

/**
 * Extracts granular 4-band energy profile from 24-bin spectrum for nuanced musicality.
 */
export function extractMusicalBands(metrics: AudioMetrics): {
  subBass: number;
  lowMid: number;
  highMid: number;
  brilliance: number;
} {
  const bands = metrics.spectrumBands;
  if (!bands || bands.length === 0) {
    return {
      subBass: metrics.bass,
      lowMid: metrics.mid,
      highMid: metrics.mid,
      brilliance: metrics.treble,
    };
  }
  return {
    subBass: avgSlice(bands, 0, 4, metrics.bass),
    lowMid: avgSlice(bands, 4, 10, metrics.mid),
    highMid: avgSlice(bands, 10, 17, metrics.mid),
    brilliance: avgSlice(bands, 17, bands.length, metrics.treble),
  };
}

function avgSlice(
  arr: number[],
  start: number,
  end: number,
  fallback: number,
): number {
  const s = Math.max(0, start);
  const e = Math.min(arr.length, end);
  if (e <= s) return fallback;
  let sum = 0;
  for (let i = s; i < e; i++) {
    sum += Number.isFinite(arr[i]) ? arr[i] : 0;
  }
  return Math.max(0, Math.min(1, sum / (e - s)));
}

function wrapUnit(v: number): number {
  const mod = v % 1;
  return mod < 0 ? mod + 1 : mod;
}
