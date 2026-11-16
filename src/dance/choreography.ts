import type { AudioMetrics } from '../audio/beatDetector';
import {
  cubanHipWave,
  DANCE_STYLE_KNOWLEDGE,
  dimeStopEnvelope,
  downBounceEnvelope,
  extractMusicalBands,
  lyricalRiseFall,
  selectPhraseMotif,
  upBounceEnvelope,
  type ConcreteDanceStyle,
  type DanceStyle,
} from './danceKnowledge';

export type { ConcreteDanceStyle, DanceStyle } from './danceKnowledge';
export { DANCE_STYLE_KNOWLEDGE } from './danceKnowledge';

export interface DanceStyleMeta {
  id: DanceStyle;
  label: string;
  shortLabel: string;
  description: string;
  accentHex: string;
}

export const DANCE_STYLES: DanceStyleMeta[] = [
  {
    id: 'auto',
    label: '自动编舞',
    shortLabel: '自动',
    description: '依据音乐 BPM 与低/中/高频能量，按 16 拍乐句自动匹配舞种与招式',
    accentHex: '#f59e0b',
  },
  ...(['hiphop', 'idol', 'urban', 'robot', 'house', 'latin', 'waltz'] as const).map(
    (id) => {
      const k = DANCE_STYLE_KNOWLEDGE[id];
      return {
        id: k.id,
        label: k.label,
        shortLabel: k.shortLabel,
        description: k.description,
        accentHex: k.accentHex,
      };
    },
  ),
];

export const DANCE_BONE_NAMES = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
] as const;

export type DanceBoneName = (typeof DANCE_BONE_NAMES)[number];
export type EulerTuple = [number, number, number];

export interface ExpressionWeights {
  happy: number;
  aa: number;
  relaxed: number;
  surprised: number;
}

export interface VRMHumanoidPose {
  activeStyle: ConcreteDanceStyle;
  activeMotifLabel: string;
  hipsOffset: { x: number; y: number; z: number };
  bones: Record<DanceBoneName, EulerTuple>;
  expression: ExpressionWeights;
}

const MID_TEMPO_ROTATION: ConcreteDanceStyle[] = [
  'hiphop',
  'urban',
  'latin',
  'robot',
];

const HIGH_TEMPO_ROTATION: ConcreteDanceStyle[] = [
  'house',
  'idol',
  'urban',
  'latin',
];

const TAU = Math.PI * 2;

interface MotifContext {
  beatTotal: number;
  beatInBar: number;
  barPhase: number;
  p: number;
  bass: number;
  mid: number;
  treble: number;
  subBass: number;
  lowMid: number;
  highMid: number;
  brilliance: number;
  pulse: number;
  amp: number;
}

function createEmptyBones(): Record<DanceBoneName, EulerTuple> {
  return {
    hips: [0, 0, 0],
    spine: [0, 0, 0],
    chest: [0, 0, 0],
    upperChest: [0, 0, 0],
    neck: [0, 0, 0],
    head: [0, 0, 0],
    leftShoulder: [0, 0, 0],
    leftUpperArm: [0.06, 0.04, -1.24],
    leftLowerArm: [0, -0.2, 0],
    leftHand: [0, 0, 0],
    rightShoulder: [0, 0, 0],
    rightUpperArm: [0.06, -0.04, 1.24],
    rightLowerArm: [0, 0.2, 0],
    rightHand: [0, 0, 0],
    leftUpperLeg: [0, 0, 0],
    leftLowerLeg: [0, 0, 0],
    leftFoot: [0, 0, 0],
    rightUpperLeg: [0, 0, 0],
    rightLowerLeg: [0, 0, 0],
    rightFoot: [0, 0, 0],
  };
}

export function resolveAutoDanceStyle(metrics: AudioMetrics): ConcreteDanceStyle {
  const phraseIndex = Math.floor(metrics.beatCount / 16);
  if (metrics.bpm >= 126 && phraseIndex % 2 === 0) {
    return metrics.treble > 0.35 ? 'house' : 'idol';
  }
  if (metrics.bpm <= 96 && phraseIndex % 2 === 1) {
    return 'waltz';
  }
  if (metrics.bpm >= 122) {
    return HIGH_TEMPO_ROTATION[phraseIndex % HIGH_TEMPO_ROTATION.length];
  }
  return MID_TEMPO_ROTATION[phraseIndex % MID_TEMPO_ROTATION.length];
}

export function computeIdlePose(elapsedSec: number): VRMHumanoidPose {
  const bones = createEmptyBones();
  const breath = Math.sin(elapsedSec * 1.7);
  const breathLag = Math.sin(elapsedSec * 1.7 - 0.35);
  const sway = Math.sin(elapsedSec * 0.85);

  bones.hips = [0, sway * 0.045, sway * 0.022];
  bones.spine = [0.02 + breath * 0.014, -sway * 0.03, -sway * 0.015];
  bones.chest = [breathLag * 0.018, -sway * 0.02, 0];
  bones.upperChest = [breathLag * 0.015, sway * 0.025, 0];
  bones.head = [Math.sin(elapsedSec * 1.1) * 0.028, sway * 0.06, sway * 0.035];
  bones.leftUpperArm = [0.06 + breath * 0.02, 0.04, -1.21 - breath * 0.03];
  bones.rightUpperArm = [0.06 + breath * 0.02, -0.04, 1.21 + breath * 0.03];
  bones.leftLowerArm = [0, -0.24 - breathLag * 0.03, 0];
  bones.rightLowerArm = [0, 0.24 + breathLag * 0.03, 0];
  bones.leftHand = [0, 0, -0.05 + breathLag * 0.04];
  bones.rightHand = [0, 0, 0.05 - breathLag * 0.04];
  bones.leftUpperLeg = [-0.02, 0.03, 0.02];
  bones.rightUpperLeg = [-0.02, -0.03, -0.02];
  bones.leftLowerLeg = [0.05, 0, 0];
  bones.rightLowerLeg = [0.05, 0, 0];

  return clampPose({
    activeStyle: 'hiphop',
    activeMotifLabel: '待机呼吸',
    hipsOffset: { x: sway * 0.018, y: 0.002 + breath * 0.003, z: 0 },
    bones,
    expression: {
      happy: 0.14,
      aa: 0,
      relaxed: 0.28,
      surprised: 0,
    },
  });
}

export function computeDancePose(
  requestedStyle: DanceStyle,
  metrics: AudioMetrics,
  intensity = 1.0,
): VRMHumanoidPose {
  const activeStyle =
    requestedStyle === 'auto' ? resolveAutoDanceStyle(metrics) : requestedStyle;

  const amp = clamp(intensity, 0.35, 1.85);
  const beatTotal = metrics.beatCount + metrics.beatPhase;
  const bands = extractMusicalBands(metrics);
  const phrase = selectPhraseMotif(activeStyle, beatTotal);

  const ctx: MotifContext = {
    beatTotal,
    beatInBar: phrase.beatInBar,
    barPhase: phrase.barPhase,
    p: metrics.beatPhase,
    bass: metrics.bass,
    mid: metrics.mid,
    treble: metrics.treble,
    subBass: bands.subBass,
    lowMid: bands.lowMid,
    highMid: bands.highMid,
    brilliance: bands.brilliance,
    pulse: metrics.beatPulse,
    amp,
  };

  const primaryPose = evaluateStyleBar(activeStyle, phrase.barIndex, phrase.motif.label, ctx);

  if (phrase.blendToNext > 0.001) {
    const nextPose = evaluateStyleBar(
      activeStyle,
      phrase.nextBarIndex,
      phrase.motif.label,
      ctx,
    );
    blendPoseInPlace(primaryPose, nextPose, phrase.blendToNext);
  }

  return clampPose(primaryPose);
}

function evaluateStyleBar(
  style: ConcreteDanceStyle,
  barIndex: 0 | 1 | 2 | 3,
  motifLabel: string,
  ctx: MotifContext,
): VRMHumanoidPose {
  switch (style) {
    case 'hiphop':
      return buildHipHopMotif(barIndex, motifLabel, ctx);
    case 'idol':
      return buildIdolMotif(barIndex, motifLabel, ctx);
    case 'urban':
      return buildUrbanMotif(barIndex, motifLabel, ctx);
    case 'robot':
      return buildRobotMotif(barIndex, motifLabel, ctx);
    case 'house':
      return buildHouseMotif(barIndex, motifLabel, ctx);
    case 'latin':
      return buildLatinMotif(barIndex, motifLabel, ctx);
    case 'waltz':
      return buildWaltzMotif(barIndex, motifLabel, ctx);
  }
}

/* -------------------------------------------------------------------------- */
/* 1. HIP-HOP (Down-Bounce · Chest Rock · Milly Rock · Freeze Hit)            */
/* -------------------------------------------------------------------------- */
function buildHipHopMotif(
  barIndex: 0 | 1 | 2 | 3,
  motifLabel: string,
  c: MotifContext,
): VRMHumanoidPose {
  const bones = createEmptyBones();
  const lag = DANCE_STYLE_KNOWLEDGE.hiphop.kineticChainLag;
  const bounce = downBounceEnvelope(c.p);
  const chestLagBounce = downBounceEnvelope(c.p - lag.chest);
  const headLagBounce = downBounceEnvelope(c.p - lag.head);
  const halfBeat = Math.sin(c.beatTotal * Math.PI);
  const quarterPhrase = Math.sin(c.beatTotal * Math.PI * 0.5);
  const wristWave = Math.sin((c.beatTotal - lag.wrist) * Math.PI);

  let hipX = halfBeat * 0.065;
  let hipY = -(0.012 + c.subBass * 0.015 + c.pulse * 0.008) * bounce;
  let kneeFlex = 0.25 + bounce * (0.24 + c.subBass * 0.2);

  if (barIndex === 0) {
    // Bar 1: Grounded Down-Bounce & Alternating Shoulder Pop
    bones.hips = [0.05 * bounce * c.amp, halfBeat * 0.2 * c.amp, quarterPhrase * 0.08 * c.amp];
    bones.spine = [(0.07 + bounce * 0.08) * c.amp, -halfBeat * 0.14 * c.amp, -quarterPhrase * 0.06 * c.amp];
    bones.chest = [(0.04 + chestLagBounce * 0.08) * c.amp, halfBeat * 0.12 * c.amp, 0];
    bones.upperChest = [(chestLagBounce * 0.06) * c.amp, -halfBeat * 0.08 * c.amp, quarterPhrase * 0.05 * c.amp];
    bones.head = [(0.06 + headLagBounce * 0.16) * c.amp, -halfBeat * 0.12 * c.amp, quarterPhrase * 0.07 * c.amp];

    bones.leftShoulder = [0, 0.06 * c.amp, (0.09 + Math.max(0, halfBeat) * 0.14) * c.amp];
    bones.rightShoulder = [0, -0.06 * c.amp, (-0.09 - Math.max(0, -halfBeat) * 0.14) * c.amp];
    bones.leftUpperArm = [(-0.26 + halfBeat * 0.32) * c.amp, 0.18 * c.amp, -0.9 + Math.sin(c.beatTotal * Math.PI + 0.5) * 0.22 * c.amp];
    bones.rightUpperArm = [(-0.26 - halfBeat * 0.32) * c.amp, -0.18 * c.amp, 0.9 + Math.sin(c.beatTotal * Math.PI + 0.5) * 0.22 * c.amp];
    bones.leftLowerArm = [0, -1.18 - Math.abs(halfBeat) * 0.3 * c.amp, 0];
    bones.rightLowerArm = [0, 1.18 + Math.abs(halfBeat) * 0.3 * c.amp, 0];
    bones.leftHand = [0, 0, wristWave * (0.28 + c.brilliance * 0.2) * c.amp];
    bones.rightHand = [0, 0, -wristWave * (0.28 + c.brilliance * 0.2) * c.amp];
  } else if (barIndex === 1) {
    // Bar 2: Chest Pop Rock (forward chest hit on 1 & 3, C-curve back on 2 & 4)
    const chestSnap = Math.sin(c.p * TAU - 0.35);
    bones.hips = [0.08 * bounce * c.amp, quarterPhrase * 0.18 * c.amp, halfBeat * 0.06 * c.amp];
    bones.spine = [(-0.04 + bounce * 0.12) * c.amp, -quarterPhrase * 0.12 * c.amp, 0];
    bones.chest = [(chestSnap * 0.2 + c.lowMid * 0.08) * c.amp, 0, 0];
    bones.upperChest = [(chestSnap * 0.16) * c.amp, halfBeat * 0.1 * c.amp, 0];
    bones.neck = [-chestSnap * 0.08 * c.amp, 0, 0];
    bones.head = [(0.08 + headLagBounce * 0.18) * c.amp, -quarterPhrase * 0.14 * c.amp, 0.08 * halfBeat * c.amp];

    const sweep = Math.sin(c.beatTotal * Math.PI);
    bones.leftUpperArm = [(-0.42 + sweep * 0.4) * c.amp, (0.35 + sweep * 0.25) * c.amp, -0.78 + Math.max(0, sweep) * 0.35 * c.amp];
    bones.rightUpperArm = [(-0.42 - sweep * 0.4) * c.amp, (-0.35 + sweep * 0.25) * c.amp, 0.78 - Math.max(0, -sweep) * 0.35 * c.amp];
    bones.leftLowerArm = [0, (-1.28 - chestLagBounce * 0.25) * c.amp, 0];
    bones.rightLowerArm = [0, (1.28 + chestLagBounce * 0.25) * c.amp, 0];
    bones.leftHand = [0, 0, (0.25 + c.brilliance * 0.25) * sweep * c.amp];
    bones.rightHand = [0, 0, -(0.25 + c.brilliance * 0.25) * sweep * c.amp];
  } else if (barIndex === 2) {
    // Bar 3: Milly Rock lateral glide & alternating circular forearm wave
    const millyPhase = c.beatTotal * Math.PI;
    const armCircleX = Math.sin(millyPhase);
    const armCircleY = Math.cos(millyPhase);
    hipX = Math.sin(c.beatTotal * Math.PI * 0.5) * 0.11;

    bones.hips = [0.04 * bounce * c.amp, Math.sin(millyPhase * 0.5) * 0.25 * c.amp, -Math.sin(millyPhase * 0.5) * 0.12 * c.amp];
    bones.spine = [0.08 * bounce * c.amp, -Math.sin(millyPhase * 0.5) * 0.16 * c.amp, Math.sin(millyPhase * 0.5) * 0.1 * c.amp];
    bones.chest = [chestLagBounce * 0.08 * c.amp, armCircleY * 0.14 * c.amp, -armCircleX * 0.06 * c.amp];
    bones.upperChest = [0.04 * c.amp, armCircleY * 0.1 * c.amp, 0];
    bones.head = [0.05 * c.amp, -Math.sin(millyPhase * 0.5) * 0.18 * c.amp, armCircleX * 0.11 * c.amp];

    bones.leftUpperArm = [(-0.45 + armCircleX * 0.45) * c.amp, (0.25 + armCircleY * 0.28) * c.amp, -0.76 + Math.max(0, armCircleY) * 0.26 * c.amp];
    bones.rightUpperArm = [(-0.45 - armCircleX * 0.45) * c.amp, (-0.25 + armCircleY * 0.28) * c.amp, 0.76 - Math.max(0, -armCircleY) * 0.26 * c.amp];
    bones.leftLowerArm = [0, -1.35 + armCircleX * 0.25 * c.amp, 0];
    bones.rightLowerArm = [0, 1.35 + armCircleX * 0.25 * c.amp, 0];
    bones.leftHand = [0, 0, armCircleY * 0.35 * c.amp];
    bones.rightHand = [0, 0, armCircleY * 0.35 * c.amp];
  } else {
    // Bar 4: Prep crouch (beats 0..2) -> Crisp Diagonal Hit & Look-Back Freeze (beats 2..4)
    const isHit = c.beatInBar >= 2.0;
    const hitSnap = isHit ? Math.min(1, Math.pow((c.beatInBar - 2.0) / 0.35, 0.32)) : 0;
    const prepDip = !isHit ? Math.sin((c.beatInBar / 2) * Math.PI) : 0;
    hipX = isHit ? 0.095 * hitSnap : -0.05 * prepDip;
    hipY = isHit ? -0.018 * hitSnap : -0.036 * prepDip;
    kneeFlex = isHit ? 0.22 + 0.14 * hitSnap : 0.34 + 0.26 * prepDip;

    bones.hips = [0.06 * prepDip * c.amp, (isHit ? -0.34 * hitSnap : 0.14 * prepDip) * c.amp, (isHit ? 0.1 : -0.06 * prepDip) * c.amp];
    bones.spine = [(0.12 * prepDip - 0.04 * hitSnap) * c.amp, (isHit ? 0.18 * hitSnap : -0.08 * prepDip) * c.amp, 0];
    bones.chest = [(isHit ? -0.08 * hitSnap : 0.08 * prepDip) * c.amp, (isHit ? 0.22 * hitSnap : 0) * c.amp, (isHit ? -0.09 * hitSnap : 0) * c.amp];
    bones.upperChest = [0, (isHit ? 0.16 * hitSnap : 0) * c.amp, 0];
    bones.head = [(-0.04 * hitSnap + 0.12 * prepDip) * c.amp, (isHit ? -0.32 * hitSnap : 0.08 * prepDip) * c.amp, (isHit ? 0.12 * hitSnap : 0) * c.amp];

    bones.leftUpperArm = [
      (-0.32 * prepDip - 0.85 * hitSnap) * c.amp,
      (0.15 + 0.32 * hitSnap) * c.amp,
      -0.95 + 0.72 * hitSnap * c.amp,
    ];
    bones.leftLowerArm = [0, (-1.15 * (1 - hitSnap * 0.55)) * c.amp, 0];
    bones.leftHand = [0, 0, (0.3 * hitSnap) * c.amp];

    bones.rightUpperArm = [
      (-0.35 - 0.18 * hitSnap) * c.amp,
      (-0.2 - 0.2 * hitSnap) * c.amp,
      0.85 - 0.28 * hitSnap * c.amp,
    ];
    bones.rightLowerArm = [0, (1.28 + 0.28 * hitSnap) * c.amp, 0];
    bones.rightHand = [0, 0, (-0.25 * hitSnap) * c.amp];
  }

  const leftKneeExtra = Math.max(0, halfBeat) * 0.15 * c.amp;
  const rightKneeExtra = Math.max(0, -halfBeat) * 0.15 * c.amp;
  bones.leftUpperLeg = [-(kneeFlex * 0.55 + leftKneeExtra), 0.1, 0.1];
  bones.leftLowerLeg = [kneeFlex + leftKneeExtra * 1.25, 0, 0];
  bones.leftFoot = [-kneeFlex * 0.42, 0, 0];
  bones.rightUpperLeg = [-(kneeFlex * 0.55 + rightKneeExtra), -0.1, -0.1];
  bones.rightLowerLeg = [kneeFlex + rightKneeExtra * 1.25, 0, 0];
  bones.rightFoot = [-kneeFlex * 0.42, 0, 0];

  return {
    activeStyle: 'hiphop',
    activeMotifLabel: motifLabel,
    hipsOffset: { x: hipX * c.amp, y: hipY * c.amp - 0.004, z: 0 },
    bones,
    expression: {
      happy: 0.22 + c.lowMid * 0.22,
      aa: c.brilliance * 0.35,
      relaxed: 0.12,
      surprised: barIndex === 3 && c.beatInBar >= 2 ? 0.22 : c.pulse * 0.14,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 2. IDOL POP (Cheer Frame · Rainbow Step · Spotlight Point · Star Finale)   */
/* -------------------------------------------------------------------------- */
function buildIdolMotif(
  barIndex: 0 | 1 | 2 | 3,
  motifLabel: string,
  c: MotifContext,
): VRMHumanoidPose {
  const bones = createEmptyBones();
  const upBounce = upBounceEnvelope(c.p);
  const doubleBounce = Math.abs(Math.sin(c.p * TAU));
  const sway = Math.sin(c.beatTotal * Math.PI);
  const armWave = Math.sin(c.beatTotal * Math.PI * 0.5);
  const handFlick = Math.sin((c.beatTotal - 0.15) * TAU);

  let hipX = sway * 0.095;
  let hipY = doubleBounce * (0.025 + c.pulse * 0.018) - 0.004;
  let leftStep = Math.max(0, sway) * (0.28 + c.subBass * 0.16) * c.amp;
  let rightStep = Math.max(0, -sway) * (0.28 + c.subBass * 0.16) * c.amp;

  bones.hips = [-0.03, sway * 0.16 * c.amp, sway * 0.14 * c.amp];
  bones.spine = [0.04 + upBounce * 0.06 * c.amp, -sway * 0.1 * c.amp, -sway * 0.08 * c.amp];
  bones.chest = [upBounce * 0.07 * c.amp, sway * 0.08 * c.amp, -sway * 0.05 * c.amp];
  bones.upperChest = [doubleBounce * 0.05 * c.amp, -sway * 0.06 * c.amp, sway * 0.06 * c.amp];
  bones.head = [0.04 - upBounce * 0.08 * c.amp, -sway * 0.14 * c.amp, sway * 0.2 * c.amp];

  if (barIndex === 0) {
    // Bar 1: Cute chest-level framing & alternating idol wave
    const leftLift = Math.max(0, armWave);
    const rightLift = Math.max(0, -armWave);
    bones.leftUpperArm = [(-0.46 - leftLift * 0.44) * c.amp, 0.24 * c.amp, -0.9 + leftLift * (1.26 + c.brilliance * 0.22) * c.amp];
    bones.leftLowerArm = [0, (-0.95 - (1 - leftLift) * 0.45 + handFlick * 0.18) * c.amp, 0];
    bones.leftHand = [0, 0, handFlick * 0.36 * c.amp];
    bones.rightUpperArm = [(-0.46 - rightLift * 0.44) * c.amp, -0.24 * c.amp, 0.9 - rightLift * (1.26 + c.brilliance * 0.22) * c.amp];
    bones.rightLowerArm = [0, (0.95 + (1 - rightLift) * 0.45 + handFlick * 0.18) * c.amp, 0];
    bones.rightHand = [0, 0, -handFlick * 0.36 * c.amp];
  } else if (barIndex === 1) {
    // Bar 2: Side Step-Touch with sweeping rainbow arm arc
    const arc = Math.sin((c.beatInBar / 4) * Math.PI);
    const dir = c.beatInBar < 2 ? 1 : -1;
    hipX = dir * arc * 0.14;
    leftStep = dir > 0 ? arc * 0.34 * c.amp : 0.06 * c.amp;
    rightStep = dir < 0 ? arc * 0.34 * c.amp : 0.06 * c.amp;

    bones.hips = [-0.02, dir * arc * 0.18 * c.amp, dir * arc * 0.16 * c.amp];
    bones.head = [-0.04 * c.amp, -dir * 0.18 * c.amp, dir * 0.22 * c.amp];
    bones.leftUpperArm = [(-0.52 - Math.max(0, dir) * 0.52 * arc) * c.amp, 0.22 * c.amp, -0.82 + Math.max(0, dir) * 1.45 * arc * c.amp];
    bones.rightUpperArm = [(-0.52 - Math.max(0, -dir) * 0.52 * arc) * c.amp, -0.22 * c.amp, 0.82 - Math.max(0, -dir) * 1.45 * arc * c.amp];
    bones.leftLowerArm = [0, (-0.65 - (1 - arc) * 0.55) * c.amp, 0];
    bones.rightLowerArm = [0, (0.65 + (1 - arc) * 0.55) * c.amp, 0];
    bones.leftHand = [0, 0, Math.sin(c.beatTotal * TAU) * 0.35 * c.amp];
    bones.rightHand = [0, 0, -Math.sin(c.beatTotal * TAU) * 0.35 * c.amp];
  } else if (barIndex === 2) {
    // Bar 3: Spotlight Finger-Point & Hip Sway (one hand framed on hip cleanly, one pointing forward/up)
    const pointSide = c.beatInBar < 2 ? 1 : -1;
    const pulseTap = Math.pow(0.5 + 0.5 * Math.cos(c.p * TAU), 0.7);
    bones.hips = [-0.04, pointSide * 0.22 * c.amp, pointSide * 0.18 * c.amp];
    bones.upperChest = [0.04 * c.amp, -pointSide * 0.16 * c.amp, -pointSide * 0.08 * c.amp];
    bones.head = [0.04 * c.amp, pointSide * 0.12 * c.amp, -pointSide * 0.18 * c.amp];

    if (pointSide > 0) {
      bones.leftUpperArm = [(-0.92 - pulseTap * 0.22) * c.amp, 0.15 * c.amp, -0.35 + pulseTap * 0.3 * c.amp];
      bones.leftLowerArm = [0, -0.35 * c.amp, 0];
      bones.leftHand = [0, 0, 0.28 * pulseTap * c.amp];
      bones.rightUpperArm = [-0.15 * c.amp, -0.15 * c.amp, 0.62];
      bones.rightLowerArm = [0, 1.52 * c.amp, 0];
      bones.rightHand = [0, 0, -0.22 * c.amp];
    } else {
      bones.rightUpperArm = [(-0.92 - pulseTap * 0.22) * c.amp, -0.15 * c.amp, 0.35 - pulseTap * 0.3 * c.amp];
      bones.rightLowerArm = [0, 0.35 * c.amp, 0];
      bones.rightHand = [0, 0, -0.28 * pulseTap * c.amp];
      bones.leftUpperArm = [-0.15 * c.amp, 0.15 * c.amp, -0.62];
      bones.leftLowerArm = [0, -1.52 * c.amp, 0];
      bones.leftHand = [0, 0, 0.22 * c.amp];
    }
  } else {
    // Bar 4: Star Finale Lift & Cheer Hold
    const isFinale = c.beatInBar >= 2;
    const starLift = isFinale ? Math.min(1, Math.pow((c.beatInBar - 2) / 0.45, 0.45)) : 0;
    const dip = !isFinale ? Math.sin((c.beatInBar / 2) * Math.PI) : 0;
    hipX = isFinale ? 0.04 * starLift : -0.04 * dip;
    hipY = isFinale ? 0.038 * starLift : -0.025 * dip;

    bones.hips = [-0.04 * starLift, (0.14 * starLift - 0.1 * dip) * c.amp, 0.1 * starLift * c.amp];
    bones.chest = [(-0.08 * starLift + 0.08 * dip) * c.amp, -0.08 * starLift * c.amp, 0];
    bones.upperChest = [-0.06 * starLift * c.amp, 0, 0.08 * starLift * c.amp];
    bones.head = [(-0.06 * starLift + 0.08 * dip) * c.amp, 0.1 * starLift * c.amp, 0.22 * starLift * c.amp];

    bones.leftUpperArm = [(-0.42 - 0.72 * starLift) * c.amp, 0.22 * c.amp, -0.9 + 1.55 * starLift * c.amp];
    bones.rightUpperArm = [(-0.42 - 0.72 * starLift) * c.amp, -0.22 * c.amp, 0.9 - 1.55 * starLift * c.amp];
    bones.leftLowerArm = [0, (-0.95 + 0.55 * starLift) * c.amp, 0];
    bones.rightLowerArm = [0, (0.95 - 0.55 * starLift) * c.amp, 0];
    bones.leftHand = [0, 0, (0.35 * starLift + handFlick * 0.18) * c.amp];
    bones.rightHand = [0, 0, (-0.35 * starLift - handFlick * 0.18) * c.amp];
  }

  const baseKnee = (0.15 + doubleBounce * 0.17) * c.amp;
  bones.leftUpperLeg = [-(baseKnee * 0.5 + leftStep), 0.08, 0.05];
  bones.leftLowerLeg = [baseKnee + leftStep * 1.65, 0, 0];
  bones.leftFoot = [-baseKnee * 0.38 + leftStep * 0.48, 0, 0];
  bones.rightUpperLeg = [-(baseKnee * 0.5 + rightStep), -0.08, -0.05];
  bones.rightLowerLeg = [baseKnee + rightStep * 1.65, 0, 0];
  bones.rightFoot = [-baseKnee * 0.38 + rightStep * 0.48, 0, 0];

  return {
    activeStyle: 'idol',
    activeMotifLabel: motifLabel,
    hipsOffset: { x: hipX * c.amp, y: hipY * c.amp, z: 0 },
    bones,
    expression: {
      happy: clamp(0.68 + c.lowMid * 0.32, 0, 1),
      aa: clamp(0.18 + c.highMid * 0.55, 0, 1),
      relaxed: 0,
      surprised: 0,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 3. URBAN / K-POP (Snare Lock · Face Frame · Body Wave · Kill-Part)         */
/* -------------------------------------------------------------------------- */
function buildUrbanMotif(
  barIndex: 0 | 1 | 2 | 3,
  motifLabel: string,
  c: MotifContext,
): VRMHumanoidPose {
  const bones = createEmptyBones();
  const lag = DANCE_STYLE_KNOWLEDGE.urban.kineticChainLag;
  // Backbeat snap on beats 1 and 3 (counts 2 and 4 in 1-based counting)
  const snap = dimeStopEnvelope(c.beatTotal, 1, 0.22);
  const halfBeat = Math.sin(c.beatTotal * Math.PI);
  const backbeat = Math.sin(c.beatTotal * Math.PI * 0.5);
  const groove = downBounceEnvelope(c.p);

  let hipX = backbeat * 0.075;
  let hipY = -0.012 * groove;
  let kneeFlex = 0.22 + groove * 0.22;

  if (barIndex === 0) {
    // Bar 1: Groove-to-Snare Isolation Lock
    const hit = snap.hitRebound;
    const side = snap.stepIndex % 2 === 0 ? 1 : -1;
    bones.hips = [0.03 * groove * c.amp, side * 0.22 * c.amp, side * 0.1 * c.amp];
    bones.spine = [0.05 * groove * c.amp, -side * 0.12 * c.amp, 0];
    bones.chest = [(0.08 * hit + 0.04 * groove) * c.amp, -side * 0.18 * c.amp, -side * 0.07 * c.amp];
    bones.upperChest = [(0.1 * hit) * c.amp, side * 0.14 * c.amp, 0];
    bones.head = [(0.04 - 0.08 * hit) * c.amp, side * 0.16 * c.amp, -side * 0.12 * c.amp];

    bones.leftUpperArm = [(-0.72 - 0.25 * Math.max(0, side)) * c.amp, (0.38 * side) * c.amp, -0.78 + Math.max(0, side) * 0.55 * c.amp];
    bones.rightUpperArm = [(-0.72 - 0.25 * Math.max(0, -side)) * c.amp, (0.38 * side) * c.amp, 0.78 - Math.max(0, -side) * 0.55 * c.amp];
    bones.leftLowerArm = [0, (-1.35 + (side > 0 ? 0.3 : -0.15)) * c.amp, 0];
    bones.rightLowerArm = [0, (1.35 + (side < 0 ? -0.3 : 0.15)) * c.amp, 0];
    bones.leftHand = [0, 0, (0.35 * side) * c.amp];
    bones.rightHand = [0, 0, (-0.35 * side) * c.amp];
  } else if (barIndex === 1) {
    // Bar 2: Clean Diagonal Face/Collarbone Framing
    const frameAlt = Math.floor(c.beatInBar) % 2 === 0 ? 1 : -1;
    const frameEase = Math.pow(c.p, 0.3);
    hipX = frameAlt * 0.09 * frameEase;

    bones.hips = [0, -frameAlt * 0.26 * frameEase * c.amp, frameAlt * 0.12 * c.amp];
    bones.spine = [0.04 * c.amp, frameAlt * 0.14 * c.amp, -frameAlt * 0.06 * c.amp];
    bones.chest = [0.02 * c.amp, frameAlt * 0.16 * c.amp, 0];
    bones.upperChest = [-0.03 * c.amp, frameAlt * 0.1 * c.amp, 0];
    bones.head = [0.06 * c.amp, -frameAlt * 0.15 * c.amp, frameAlt * 0.14 * c.amp];

    // Left/Right alternating clean K-Pop frame near collarbone/chin
    bones.leftUpperArm = [(-0.88 - (frameAlt > 0 ? 0.24 : 0)) * c.amp, 0.36 * c.amp, -0.68 + (frameAlt > 0 ? 0.42 : 0) * c.amp];
    bones.leftLowerArm = [0, (-1.45 - (frameAlt > 0 ? 0.35 : 0)) * c.amp, 0];
    bones.rightUpperArm = [(-0.88 - (frameAlt < 0 ? 0.24 : 0)) * c.amp, -0.36 * c.amp, 0.68 - (frameAlt < 0 ? 0.42 : 0) * c.amp];
    bones.rightLowerArm = [0, (1.45 + (frameAlt < 0 ? 0.35 : 0)) * c.amp, 0];
    bones.leftHand = [0, 0, (0.28 * frameAlt) * c.amp];
    bones.rightHand = [0, 0, (0.28 * frameAlt) * c.amp];
  } else if (barIndex === 2) {
    // Bar 3: Top-to-Bottom Spinal Body Wave + Trailing Wrists
    const wPhase = c.barPhase * TAU * 2;
    const wHead = Math.sin(wPhase);
    const wUpper = Math.sin(wPhase - lag.upperChest * TAU);
    const wChest = Math.sin(wPhase - lag.chest * TAU);
    const wSpine = Math.sin(wPhase - lag.spine * TAU);
    const wHips = Math.sin(wPhase - 0.36 * TAU);
    hipX = wHips * 0.065;
    hipY = -0.015 - Math.abs(wHips) * 0.018;
    kneeFlex = 0.24 + (0.5 + 0.5 * wHips) * 0.24;

    bones.hips = [wHips * 0.14 * c.amp, halfBeat * 0.12 * c.amp, wHips * 0.08 * c.amp];
    bones.spine = [wSpine * 0.16 * c.amp, -halfBeat * 0.08 * c.amp, 0];
    bones.chest = [wChest * 0.18 * c.amp, 0, 0];
    bones.upperChest = [wUpper * 0.16 * c.amp, 0, 0];
    bones.head = [wHead * 0.14 * c.amp, -halfBeat * 0.1 * c.amp, wHead * 0.08 * c.amp];

    const wristLag = Math.sin(wPhase - lag.wrist * TAU);
    bones.leftUpperArm = [(-0.45 + wUpper * 0.38) * c.amp, 0.22 * c.amp, -0.84 + (0.5 + 0.5 * wChest) * 0.35 * c.amp];
    bones.rightUpperArm = [(-0.45 + wUpper * 0.38) * c.amp, -0.22 * c.amp, 0.84 - (0.5 + 0.5 * wChest) * 0.35 * c.amp];
    bones.leftLowerArm = [0, (-0.95 - (0.5 - 0.5 * wChest) * 0.45) * c.amp, 0];
    bones.rightLowerArm = [0, (0.95 + (0.5 - 0.5 * wChest) * 0.45) * c.amp, 0];
    bones.leftHand = [0, 0, wristLag * 0.42 * c.amp];
    bones.rightHand = [0, 0, -wristLag * 0.42 * c.amp];
  } else {
    // Bar 4: Kill-Part Center Gaze & Sleek Diagonal Extension
    const isKill = c.beatInBar >= 1.5;
    const killEase = isKill ? Math.min(1, Math.pow((c.beatInBar - 1.5) / 0.4, 0.3)) : 0;
    hipX = isKill ? -0.075 * killEase : 0.06 * Math.sin(c.beatInBar * Math.PI);
    kneeFlex = isKill ? 0.18 + 0.12 * killEase : 0.28;

    bones.hips = [-0.04 * killEase, (0.28 * killEase) * c.amp, (-0.12 * killEase) * c.amp];
    bones.spine = [0.05 * killEase * c.amp, (-0.16 * killEase) * c.amp, 0];
    bones.chest = [-0.04 * killEase * c.amp, (-0.18 * killEase) * c.amp, 0.06 * killEase * c.amp];
    bones.upperChest = [0, -0.1 * killEase * c.amp, 0];
    bones.head = [(0.14 * killEase) * c.amp, (0.18 * killEase) * c.amp, (-0.14 * killEase) * c.amp];

    bones.leftUpperArm = [(-0.48 - 0.55 * killEase) * c.amp, (0.2 + 0.25 * killEase) * c.amp, -0.82 + 0.92 * killEase * c.amp];
    bones.leftLowerArm = [0, (-1.1 + 0.72 * killEase) * c.amp, 0];
    bones.leftHand = [0, 0, 0.25 * killEase * c.amp];
    bones.rightUpperArm = [-0.35 * c.amp, -0.18 * c.amp, 0.92];
    bones.rightLowerArm = [0, (1.15 + 0.3 * killEase) * c.amp, 0];
    bones.rightHand = [0, 0, -0.22 * killEase * c.amp];
  }

  const legAlt = Math.max(0, halfBeat) * 0.14 * c.amp;
  const legAltR = Math.max(0, -halfBeat) * 0.14 * c.amp;
  bones.leftUpperLeg = [-(kneeFlex * 0.52 + legAlt), 0.08, 0.08];
  bones.leftLowerLeg = [kneeFlex + legAlt * 1.2, 0, 0];
  bones.leftFoot = [-kneeFlex * 0.42, 0, 0];
  bones.rightUpperLeg = [-(kneeFlex * 0.52 + legAltR), -0.08, -0.08];
  bones.rightLowerLeg = [kneeFlex + legAltR * 1.2, 0, 0];
  bones.rightFoot = [-kneeFlex * 0.42, 0, 0];

  return {
    activeStyle: 'urban',
    activeMotifLabel: motifLabel,
    hipsOffset: { x: hipX * c.amp, y: hipY * c.amp - 0.003, z: 0 },
    bones,
    expression: {
      happy: 0.18 + c.lowMid * 0.15,
      aa: c.brilliance * 0.25,
      relaxed: 0.18,
      surprised: barIndex === 3 && c.beatInBar >= 1.5 ? 0.18 : 0,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 4. ROBOT / POPPING (Dime-Stop · King Tutting · Hydraulic Scan · Reboot)    */
/* -------------------------------------------------------------------------- */
function buildRobotMotif(
  barIndex: 0 | 1 | 2 | 3,
  motifLabel: string,
  c: MotifContext,
): VRMHumanoidPose {
  const bones = createEmptyBones();
  const s1 = dimeStopEnvelope(c.beatTotal, 1, 0.16);
  const s2 = dimeStopEnvelope(c.beatTotal, 2, 0.2);
  const poseIdx = s1.stepIndex % 4;
  const stepWave = Math.sin(s1.smoothStep * Math.PI * 0.5);
  const fastWave = Math.cos(s2.smoothStep * Math.PI * 0.5);
  const popHit = s1.hitRebound * (0.65 + c.pulse * 0.55);

  let hipX = stepWave * 0.03;
  let hipY = -0.005 - c.pulse * 0.012;
  let lockKnee = (0.14 + c.pulse * 0.18 * c.subBass) * c.amp;

  if (barIndex === 0) {
    // Bar 1: Classic Dime-Stop & Chest Hit-Rebound
    bones.hips = [0, stepWave * 0.14 * c.amp, 0];
    bones.spine = [fastWave * 0.07 * c.amp, -stepWave * 0.12 * c.amp, 0];
    bones.chest = [popHit * 0.12 * c.amp, stepWave * 0.22 * c.amp, fastWave * 0.08 * c.amp];
    bones.upperChest = [popHit * 0.1 * c.amp, -stepWave * 0.1 * c.amp, 0];
    bones.head = [(poseIdx === 2 ? 0.16 : -0.06) * c.amp, (poseIdx % 2 === 0 ? 0.3 : -0.3) * c.amp, (poseIdx === 1 ? 0.2 : poseIdx === 3 ? -0.2 : 0) * c.amp];

    const leftFrameZ = poseIdx === 0 || poseIdx === 3 ? -0.04 : -1.12;
    const rightFrameZ = poseIdx === 1 || poseIdx === 2 ? 0.04 : 1.12;
    bones.leftUpperArm = [(poseIdx === 1 ? -1.2 : -0.28) * c.amp, 0.15 * stepWave * c.amp, leftFrameZ];
    bones.leftLowerArm = [0, -1.52 * clamp(0.85 + c.lowMid * 0.2, 0.72, 1.0), 0];
    bones.leftHand = [0, 0, (poseIdx % 2 === 0 ? 0.52 : -0.52) * c.amp];
    bones.rightUpperArm = [(poseIdx === 3 ? -1.2 : -0.28) * c.amp, -0.15 * stepWave * c.amp, rightFrameZ];
    bones.rightLowerArm = [0, 1.52 * clamp(0.85 + c.brilliance * 0.2, 0.72, 1.0), 0];
    bones.rightHand = [0, 0, (poseIdx % 2 === 1 ? -0.52 : 0.52) * c.amp];
  } else if (barIndex === 1) {
    // Bar 2: King Tutting 90-degree geometric box sequence
    const boxStep = s2.stepIndex % 4;
    bones.hips = [0, 0, 0];
    bones.chest = [0, (boxStep % 2 === 0 ? 0.12 : -0.12) * c.amp, 0];
    bones.upperChest = [popHit * 0.08 * c.amp, 0, 0];
    bones.head = [0, (boxStep === 1 ? 0.24 : boxStep === 3 ? -0.24 : 0) * c.amp, 0];

    const tutConfigs: Array<{ lx: number; lz: number; le: number; rx: number; rz: number; re: number }> = [
      { lx: -0.95, lz: -0.15, le: -1.57, rx: -0.95, rz: 0.15, re: 1.57 },
      { lx: -1.25, lz: 0.45, le: -1.57, rx: -0.35, rz: 0.25, re: 1.57 },
      { lx: -0.35, lz: -0.25, le: -1.57, rx: -1.25, rz: -0.45, re: 1.57 },
      { lx: -0.95, lz: -0.65, le: -1.57, rx: -0.95, rz: 0.65, re: 1.57 },
    ];
    const cfg = tutConfigs[boxStep];
    bones.leftUpperArm = [cfg.lx * c.amp, 0.18 * c.amp, cfg.lz];
    bones.leftLowerArm = [0, cfg.le, 0];
    bones.leftHand = [0, 0, (boxStep % 2 === 0 ? 0.65 : -0.65) * c.amp];
    bones.rightUpperArm = [cfg.rx * c.amp, -0.18 * c.amp, cfg.rz];
    bones.rightLowerArm = [0, cfg.re, 0];
    bones.rightHand = [0, 0, (boxStep % 2 === 0 ? -0.65 : 0.65) * c.amp];
  } else if (barIndex === 2) {
    // Bar 3: Hydraulic Servo Scan with 16th-note micro-ticks
    const scan = Math.sin(c.barPhase * Math.PI * 2);
    const microTick = Math.sin(c.beatTotal * TAU * 4) * 0.025;
    bones.hips = [0, scan * 0.1 * c.amp, 0];
    bones.spine = [0.04 * c.amp, scan * 0.16 * c.amp, 0];
    bones.chest = [0, (scan * 0.26 + microTick) * c.amp, 0];
    bones.upperChest = [0, scan * 0.14 * c.amp, 0];
    bones.head = [-0.04 * c.amp, (scan * 0.36 + microTick * 1.4) * c.amp, scan * 0.08 * c.amp];

    bones.leftUpperArm = [(-0.75 + microTick * 2) * c.amp, 0.2 * c.amp, -0.38];
    bones.leftLowerArm = [0, -1.55, 0];
    bones.leftHand = [0, 0, 0.45 * c.amp];
    bones.rightUpperArm = [(-0.75 - microTick * 2) * c.amp, -0.2 * c.amp, 0.38];
    bones.rightLowerArm = [0, 1.55, 0];
    bones.rightHand = [0, 0, -0.45 * c.amp];
  } else {
    // Bar 4: Power-down slump (beats 0..2) -> Explosive Reboot Pop & Freeze (beats 2..4)
    const isReboot = c.beatInBar >= 2.0;
    const slump = !isReboot ? Math.min(1, c.beatInBar / 1.8) : 0;
    const rebootSnap = isReboot ? dimeStopEnvelope(c.beatInBar - 2.0, 1, 0.14).hitRebound : 0;
    hipX = 0;
    hipY = !isReboot ? -0.032 * slump : -0.008 + rebootSnap * 0.014;
    lockKnee = (!isReboot ? 0.2 + 0.32 * slump : 0.14 + rebootSnap * 0.1) * c.amp;

    bones.hips = [0.08 * slump * c.amp, 0, 0];
    bones.spine = [0.22 * slump * c.amp, 0, 0];
    bones.chest = [(0.24 * slump - 0.1 * rebootSnap) * c.amp, 0, 0];
    bones.upperChest = [(0.18 * slump - 0.12 * rebootSnap) * c.amp, 0, 0];
    bones.head = [(0.36 * slump - 0.14 * rebootSnap) * c.amp, (isReboot ? 0.25 : 0) * c.amp, 0];

    bones.leftUpperArm = [(-0.18 * slump - 0.95 * (isReboot ? 1 : 0)) * c.amp, 0.12 * c.amp, -1.1 + (isReboot ? 0.85 : 0) * c.amp];
    bones.leftLowerArm = [0, isReboot ? -1.48 : -0.35, 0];
    bones.rightUpperArm = [(-0.18 * slump - 0.95 * (isReboot ? 1 : 0)) * c.amp, -0.12 * c.amp, 1.1 - (isReboot ? 0.85 : 0) * c.amp];
    bones.rightLowerArm = [0, isReboot ? 1.48 : 0.35, 0];
    bones.leftHand = [0, 0, isReboot ? 0.55 * c.amp : 0];
    bones.rightHand = [0, 0, isReboot ? -0.55 * c.amp : 0];
  }

  bones.leftUpperLeg = [-lockKnee * 0.5, 0.05, 0.07];
  bones.leftLowerLeg = [lockKnee, 0, 0];
  bones.leftFoot = [-lockKnee * 0.5, 0, 0];
  bones.rightUpperLeg = [-lockKnee * 0.5, -0.05, -0.07];
  bones.rightLowerLeg = [lockKnee, 0, 0];
  bones.rightFoot = [-lockKnee * 0.5, 0, 0];

  return {
    activeStyle: 'robot',
    activeMotifLabel: motifLabel,
    hipsOffset: { x: hipX * c.amp, y: hipY * c.amp, z: 0 },
    bones,
    expression: {
      happy: 0.05,
      aa: 0,
      relaxed: 0,
      surprised: clamp(c.pulse * 0.5, 0, 0.65),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 5. HOUSE (Classic Jack · High Shuffle · Loose-Legs Skate · Loft Release)   */
/* -------------------------------------------------------------------------- */
function buildHouseMotif(
  barIndex: 0 | 1 | 2 | 3,
  motifLabel: string,
  c: MotifContext,
): VRMHumanoidPose {
  const bones = createEmptyBones();
  const lag = DANCE_STYLE_KNOWLEDGE.house.kineticChainLag;
  const jack = Math.sin(c.p * TAU);
  const jackChest = Math.sin((c.p - lag.chest) * TAU);
  const jackHead = Math.sin((c.p - lag.head) * TAU);
  const footCycle = Math.sin(c.beatTotal * Math.PI);
  const armCross = Math.cos(c.beatTotal * Math.PI);

  let hipX = footCycle * 0.085;
  let hipY = -0.01 + (0.5 + 0.5 * jack) * (0.026 + c.pulse * 0.018);
  let liftL = Math.max(0, footCycle) * (0.56 + c.subBass * 0.2) * c.amp;
  let liftR = Math.max(0, -footCycle) * (0.56 + c.subBass * 0.2) * c.amp;
  let legTwistL = 0.12;
  let legTwistR = -0.12;

  // Underlying House jacking torso wave across all motifs
  bones.hips = [0.05 + jack * 0.09 * c.amp, footCycle * 0.2 * c.amp, -footCycle * 0.08 * c.amp];
  bones.spine = [(0.08 - jack * 0.15) * c.amp, -footCycle * 0.14 * c.amp, footCycle * 0.07 * c.amp];
  bones.chest = [(jackChest * 0.15 + c.subBass * 0.07) * c.amp, footCycle * 0.1 * c.amp, 0];
  bones.upperChest = [(jackChest * 0.12) * c.amp, -footCycle * 0.08 * c.amp, 0];
  bones.head = [(-jackHead * 0.11 + 0.04) * c.amp, -footCycle * 0.1 * c.amp, footCycle * 0.05 * c.amp];

  if (barIndex === 0) {
    // Bar 1: Classic Jacking & Wide Swinging Arms
    bones.leftUpperArm = [(-0.52 + armCross * 0.48) * c.amp, (0.38 + armCross * 0.4) * c.amp, -0.82 + Math.sin(c.p * TAU) * (0.28 + c.brilliance * 0.2) * c.amp];
    bones.rightUpperArm = [(-0.52 - armCross * 0.48) * c.amp, (-0.38 + armCross * 0.4) * c.amp, 0.82 - Math.sin(c.p * TAU) * (0.28 + c.brilliance * 0.2) * c.amp];
    bones.leftLowerArm = [0, (-0.85 - c.lowMid * 0.35) * c.amp, 0];
    bones.rightLowerArm = [0, (0.85 + c.lowMid * 0.35) * c.amp, 0];
    bones.leftHand = [0, 0, Math.sin((c.p - lag.wrist) * TAU) * 0.32 * c.amp];
    bones.rightHand = [0, 0, -Math.sin((c.p - lag.wrist) * TAU) * 0.32 * c.amp];
  } else if (barIndex === 1) {
    // Bar 2: High-Knee Shuffle & Syncopated Pump
    liftL = Math.max(0, Math.sin(c.beatTotal * TAU * 0.5)) * (0.72 + c.subBass * 0.2) * c.amp;
    liftR = Math.max(0, -Math.sin(c.beatTotal * TAU * 0.5)) * (0.72 + c.subBass * 0.2) * c.amp;
    bones.leftUpperArm = [(-0.62 + Math.sin(c.beatTotal * TAU) * 0.35) * c.amp, 0.24 * c.amp, -0.85 + Math.max(0, liftL) * 0.35];
    bones.rightUpperArm = [(-0.62 - Math.sin(c.beatTotal * TAU) * 0.35) * c.amp, -0.24 * c.amp, 0.85 - Math.max(0, liftR) * 0.35];
    bones.leftLowerArm = [0, (-1.15 - jack * 0.25) * c.amp, 0];
    bones.rightLowerArm = [0, (1.15 + jack * 0.25) * c.amp, 0];
    bones.leftHand = [0, 0, armCross * 0.28 * c.amp];
    bones.rightHand = [0, 0, -armCross * 0.28 * c.amp];
  } else if (barIndex === 2) {
    // Bar 3: Loose-Legs Outward Skate & Lateral Glide
    const glide = Math.sin((c.beatInBar / 4) * TAU);
    hipX = glide * 0.135;
    legTwistL = 0.28 + Math.max(0, glide) * 0.22;
    legTwistR = -0.28 - Math.max(0, -glide) * 0.22;
    liftL = Math.max(0, glide) * 0.36 * c.amp;
    liftR = Math.max(0, -glide) * 0.36 * c.amp;

    bones.hips = [0.04 + jack * 0.08 * c.amp, glide * 0.26 * c.amp, -glide * 0.12 * c.amp];
    bones.leftUpperArm = [(-0.45 + glide * 0.42) * c.amp, (0.35 + glide * 0.3) * c.amp, -0.78 + Math.abs(glide) * 0.32 * c.amp];
    bones.rightUpperArm = [(-0.45 - glide * 0.42) * c.amp, (-0.35 + glide * 0.3) * c.amp, 0.78 - Math.abs(glide) * 0.32 * c.amp];
    bones.leftLowerArm = [0, -0.68 * c.amp, 0];
    bones.rightLowerArm = [0, 0.68 * c.amp, 0];
    bones.leftHand = [0, 0, glide * 0.35 * c.amp];
    bones.rightHand = [0, 0, glide * 0.35 * c.amp];
  } else {
    // Bar 4: Loft Open-Arm Release & Grounded Drop
    const open = Math.sin(c.barPhase * Math.PI);
    hipY = -0.008 + open * 0.032;
    bones.chest = [(-0.08 * open + jackChest * 0.1) * c.amp, footCycle * 0.12 * c.amp, 0];
    bones.upperChest = [-0.06 * open * c.amp, 0, 0];
    bones.head = [(-0.06 * open + 0.04) * c.amp, -footCycle * 0.12 * c.amp, 0];

    bones.leftUpperArm = [(-0.55 - 0.52 * open) * c.amp, (0.2 + 0.35 * open) * c.amp, -0.82 + 1.38 * open * c.amp];
    bones.rightUpperArm = [(-0.55 - 0.52 * open) * c.amp, (-0.2 - 0.35 * open) * c.amp, 0.82 - 1.38 * open * c.amp];
    bones.leftLowerArm = [0, (-0.9 + 0.45 * open) * c.amp, 0];
    bones.rightLowerArm = [0, (0.9 - 0.45 * open) * c.amp, 0];
    bones.leftHand = [0, 0, open * 0.36 * c.amp];
    bones.rightHand = [0, 0, -open * 0.36 * c.amp];
  }

  const supportKnee = (0.21 + (0.5 - 0.5 * Math.cos(c.p * TAU)) * 0.15) * c.amp;
  bones.leftUpperLeg = [-(supportKnee * 0.4 + liftL), legTwistL, 0.08];
  bones.leftLowerLeg = [supportKnee + liftL * 1.45, 0, 0];
  bones.leftFoot = [-supportKnee * 0.3 + liftL * 0.35, 0, 0];
  bones.rightUpperLeg = [-(supportKnee * 0.4 + liftR), legTwistR, -0.08];
  bones.rightLowerLeg = [supportKnee + liftR * 1.45, 0, 0];
  bones.rightFoot = [-supportKnee * 0.3 + liftR * 0.35, 0, 0];

  return {
    activeStyle: 'house',
    activeMotifLabel: motifLabel,
    hipsOffset: {
      x: hipX * c.amp,
      y: hipY * c.amp,
      z: Math.sin(c.beatTotal * Math.PI * 0.5) * 0.04 * c.amp,
    },
    bones,
    expression: {
      happy: 0.48 + c.lowMid * 0.3,
      aa: c.brilliance * 0.42,
      relaxed: 0,
      surprised: 0,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 6. LATIN / SALSA (Cuban 8 · Cucaracha · Cross-Body Lead · Check Flair)     */
/* -------------------------------------------------------------------------- */
function buildLatinMotif(
  barIndex: 0 | 1 | 2 | 3,
  motifLabel: string,
  c: MotifContext,
): VRMHumanoidPose {
  const bones = createEmptyBones();
  const cuban = cubanHipWave(c.beatInBar);
  const quickStep = Math.sin((c.beatInBar / 4) * TAU * 2);
  const wristFlourish = Math.sin((c.beatTotal - 0.3) * TAU);

  let hipX = cuban.lateral * 0.085;
  let hipY = -0.006 + Math.abs(cuban.roll) * 0.012;

  // Poised upright Latin spine opposing the Cuban figure-8 pelvis
  bones.hips = [-0.03, cuban.yaw * 0.28 * c.amp, cuban.roll * 0.16 * c.amp];
  bones.spine = [0.02 * c.amp, -cuban.yaw * 0.18 * c.amp, -cuban.roll * 0.12 * c.amp];
  bones.chest = [-0.03 * c.amp, -cuban.yaw * 0.14 * c.amp, -cuban.roll * 0.08 * c.amp];
  bones.upperChest = [-0.02 * c.amp, cuban.yaw * 0.1 * c.amp, 0];
  bones.head = [-0.02 * c.amp, -cuban.yaw * 0.16 * c.amp, cuban.roll * 0.08 * c.amp];

  let leftKnee = (0.14 + Math.max(0, -cuban.lateral) * 0.28) * c.amp;
  let rightKnee = (0.14 + Math.max(0, cuban.lateral) * 0.28) * c.amp;
  let stepOutL = Math.max(0, cuban.lateral) * 0.18 * c.amp;
  let stepOutR = Math.max(0, -cuban.lateral) * 0.18 * c.amp;

  if (barIndex === 0) {
    // Bar 1: Cuban Figure-8 & Lead Frame
    bones.leftUpperArm = [(-0.48 + quickStep * 0.14) * c.amp, (0.28 + cuban.yaw * 0.18) * c.amp, -0.78 + 0.16 * Math.abs(cuban.lateral)];
    bones.rightUpperArm = [(-0.48 - quickStep * 0.14) * c.amp, (-0.28 + cuban.yaw * 0.18) * c.amp, 0.78 - 0.16 * Math.abs(cuban.lateral)];
    bones.leftLowerArm = [0, (-1.22 - c.lowMid * 0.25) * c.amp, 0];
    bones.rightLowerArm = [0, (1.22 + c.lowMid * 0.25) * c.amp, 0];
    bones.leftHand = [0, 0, wristFlourish * 0.38 * c.amp];
    bones.rightHand = [0, 0, -wristFlourish * 0.38 * c.amp];
  } else if (barIndex === 1) {
    // Bar 2: Cucaracha Side Break & Shoulder Shimmy
    const sideBreak = Math.sin((c.beatInBar / 4) * TAU);
    const shimmy = Math.sin(c.beatTotal * TAU * 2) * (0.08 + c.brilliance * 0.08);
    hipX = sideBreak * 0.12;
    stepOutL = Math.max(0, sideBreak) * 0.26 * c.amp;
    stepOutR = Math.max(0, -sideBreak) * 0.26 * c.amp;

    bones.leftShoulder = [0, 0.05 * c.amp, (0.08 + shimmy) * c.amp];
    bones.rightShoulder = [0, -0.05 * c.amp, (-0.08 + shimmy) * c.amp];
    bones.leftUpperArm = [(-0.42 + Math.max(0, sideBreak) * 0.28) * c.amp, 0.3 * c.amp, -0.72 + Math.max(0, sideBreak) * 0.35 * c.amp];
    bones.rightUpperArm = [(-0.42 + Math.max(0, -sideBreak) * 0.28) * c.amp, -0.3 * c.amp, 0.72 - Math.max(0, -sideBreak) * 0.35 * c.amp];
    bones.leftLowerArm = [0, -1.05 * c.amp, 0];
    bones.rightLowerArm = [0, 1.05 * c.amp, 0];
    bones.leftHand = [0, 0, wristFlourish * 0.42 * c.amp];
    bones.rightHand = [0, 0, wristFlourish * 0.42 * c.amp];
  } else if (barIndex === 2) {
    // Bar 3: Cross-Body Turn Line & Graceful Wrist Flourish
    const turn = Math.sin((c.beatInBar / 4) * Math.PI);
    bones.hips = [-0.03, turn * 0.42 * c.amp, cuban.roll * 0.14 * c.amp];
    bones.spine = [0.02 * c.amp, turn * 0.18 * c.amp, 0];
    bones.chest = [-0.04 * c.amp, -turn * 0.2 * c.amp, 0];
    bones.head = [-0.03 * c.amp, -turn * 0.32 * c.amp, 0.08 * turn * c.amp];

    bones.leftUpperArm = [(-0.68 - turn * 0.28) * c.amp, 0.32 * c.amp, -0.68 + turn * 0.78 * c.amp];
    bones.rightUpperArm = [-0.45 * c.amp, -0.25 * c.amp, 0.78];
    bones.leftLowerArm = [0, (-0.75 - (1 - turn) * 0.45) * c.amp, 0];
    bones.rightLowerArm = [0, 1.25 * c.amp, 0];
    bones.leftHand = [0, 0, Math.sin(c.beatTotal * TAU) * 0.48 * c.amp];
    bones.rightHand = [0, 0, -Math.sin(c.beatTotal * TAU) * 0.35 * c.amp];
  } else {
    // Bar 4: Beat-7 Check Pose & Flair Hold
    const isCheck = c.beatInBar >= 2.0;
    const check = isCheck ? Math.min(1, Math.pow((c.beatInBar - 2.0) / 0.35, 0.38)) : 0;
    hipX = isCheck ? 0.11 * check : cuban.lateral * 0.07;
    hipY = isCheck ? -0.022 * check : -0.006;
    leftKnee = (isCheck ? 0.34 * check : leftKnee) * c.amp;
    rightKnee = (isCheck ? 0.12 : rightKnee) * c.amp;

    bones.hips = [-0.02, -0.32 * check * c.amp, 0.14 * check * c.amp];
    bones.chest = [-0.06 * check * c.amp, 0.24 * check * c.amp, -0.08 * check * c.amp];
    bones.upperChest = [-0.04 * check * c.amp, 0.12 * check * c.amp, 0];
    bones.head = [-0.04 * check * c.amp, 0.22 * check * c.amp, 0.14 * check * c.amp];

    bones.leftUpperArm = [(-0.55 - 0.55 * check) * c.amp, 0.24 * c.amp, -0.78 + 1.48 * check * c.amp];
    bones.leftLowerArm = [0, (-1.1 + 0.55 * check) * c.amp, 0];
    bones.leftHand = [0, 0, 0.42 * check * c.amp];
    bones.rightUpperArm = [-0.45 * c.amp, -0.25 * c.amp, 0.85 - 0.25 * check];
    bones.rightLowerArm = [0, (1.1 + 0.35 * check) * c.amp, 0];
    bones.rightHand = [0, 0, -0.3 * check * c.amp];
  }

  bones.leftUpperLeg = [-(leftKnee * 0.52 + stepOutL * 0.6), 0.12, 0.06 + stepOutL * 0.35];
  bones.leftLowerLeg = [leftKnee, 0, 0];
  bones.leftFoot = [-leftKnee * 0.42 + stepOutL * 0.25, 0, 0];
  bones.rightUpperLeg = [-(rightKnee * 0.52 + stepOutR * 0.6), -0.12, -0.06 - stepOutR * 0.35];
  bones.rightLowerLeg = [rightKnee, 0, 0];
  bones.rightFoot = [-rightKnee * 0.42 + stepOutR * 0.25, 0, 0];

  return {
    activeStyle: 'latin',
    activeMotifLabel: motifLabel,
    hipsOffset: { x: hipX * c.amp, y: hipY * c.amp, z: Math.sin(c.beatInBar * Math.PI * 0.5) * 0.03 * c.amp },
    bones,
    expression: {
      happy: clamp(0.45 + c.lowMid * 0.3, 0, 1),
      aa: c.brilliance * 0.32,
      relaxed: 0.12,
      surprised: 0,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 7. WALTZ / CONTEMPORARY (3/4 Rise & Fall · Port de Bras · Spiral · Reverence)*/
/* -------------------------------------------------------------------------- */
function buildWaltzMotif(
  barIndex: 0 | 1 | 2 | 3,
  motifLabel: string,
  c: MotifContext,
): VRMHumanoidPose {
  const bones = createEmptyBones();
  const lag = DANCE_STYLE_KNOWLEDGE.waltz.kineticChainLag;
  const { rise, breath } = lyricalRiseFall(c.barPhase);
  const waltzPhase = c.barPhase * TAU;
  const slowArc = (c.beatTotal / 6) * TAU;
  const waveSpine = Math.sin(waltzPhase - lag.spine * TAU);
  const waveChest = Math.sin(waltzPhase - lag.chest * TAU);
  const waveUpper = Math.sin(waltzPhase - lag.upperChest * TAU);
  const waveHead = Math.sin(waltzPhase - lag.head * TAU);
  const sway = Math.sin(slowArc);

  const plie = (0.12 + (1 - rise) * (0.24 + c.subBass * 0.14)) * c.amp;
  let hipX = sway * 0.085;
  let hipY = -0.008 - (1 - rise) * 0.028 + rise * 0.024;
  let stepL = Math.max(0, sway) * 0.2 * c.amp;
  let stepR = Math.max(0, -sway) * 0.2 * c.amp;

  bones.hips = [0.03 * Math.cos(waltzPhase) * c.amp, sway * 0.26 * c.amp, waveSpine * 0.09 * c.amp];
  bones.spine = [(0.04 + waveSpine * 0.07) * c.amp, sway * 0.12 * c.amp, waveSpine * 0.1 * c.amp];
  bones.chest = [(-0.04 + waveChest * 0.09) * c.amp, sway * 0.1 * c.amp, waveChest * 0.11 * c.amp];
  bones.upperChest = [(-0.03 + waveUpper * 0.08) * c.amp, -sway * 0.08 * c.amp, waveUpper * 0.08 * c.amp];
  bones.neck = [-0.03 * c.amp, -sway * 0.06 * c.amp, waveUpper * 0.06 * c.amp];
  bones.head = [(-0.04 + waveHead * 0.08) * c.amp, -sway * 0.15 * c.amp, waveHead * 0.15 * c.amp];

  if (barIndex === 0) {
    // Bar 1: Lyrical Rise & Fall sweeping arms
    const sweepL = Math.sin(slowArc);
    const sweepR = Math.sin(slowArc + 1.1);
    bones.leftUpperArm = [(-0.34 - (0.5 + 0.5 * sweepL) * (0.44 + c.lowMid * 0.22)) * c.amp, (0.24 + waveChest * 0.22) * c.amp, -0.68 + (0.5 + 0.5 * sweepL) * (0.94 + c.brilliance * 0.2) * c.amp];
    bones.leftLowerArm = [0, -0.44 - (0.5 - 0.5 * sweepL) * 0.34 * c.amp, 0];
    bones.leftHand = [0, 0, Math.sin(waltzPhase - lag.wrist * TAU) * 0.24 * c.amp];
    bones.rightUpperArm = [(-0.34 - (0.5 + 0.5 * sweepR) * (0.44 + c.lowMid * 0.22)) * c.amp, (-0.24 + waveChest * 0.22) * c.amp, 0.68 - (0.5 + 0.5 * sweepR) * (0.94 + c.brilliance * 0.2) * c.amp];
    bones.rightLowerArm = [0, 0.44 + (0.5 - 0.5 * sweepR) * 0.34 * c.amp, 0];
    bones.rightHand = [0, 0, -Math.sin(waltzPhase - lag.wrist * TAU) * 0.24 * c.amp];
  } else if (barIndex === 1) {
    // Bar 2: Classical Port de Bras (left high fifth crown, right allongé side extension)
    const arc = Math.sin(c.barPhase * Math.PI);
    bones.head = [-0.04 * c.amp, -0.18 * arc * c.amp, 0.18 * arc * c.amp];
    bones.leftUpperArm = [(-0.62 - 0.46 * arc) * c.amp, 0.22 * c.amp, -0.55 + 1.38 * arc * c.amp];
    bones.leftLowerArm = [0, (-0.75 - 0.35 * arc) * c.amp, 0];
    bones.leftHand = [0, 0, 0.26 * arc * c.amp];
    bones.rightUpperArm = [(-0.35 - 0.25 * arc) * c.amp, -0.25 * c.amp, 0.72 - 0.65 * arc * c.amp];
    bones.rightLowerArm = [0, 0.32 * c.amp, 0];
    bones.rightHand = [0, 0, -0.22 * arc * c.amp];
  } else if (barIndex === 2) {
    // Bar 3: Spiral Torso Wave & Soft Trailing Leg Extension
    const spiral = Math.sin(c.barPhase * Math.PI);
    hipX = -0.07 * spiral;
    stepL = 0.05 * c.amp;
    stepR = -0.18 * spiral * c.amp; // soft arabesque-like trail back
    bones.hips = [0.06 * spiral * c.amp, -0.26 * spiral * c.amp, 0.1 * spiral * c.amp];
    bones.chest = [(-0.08 * spiral + breath * 0.05) * c.amp, 0.22 * spiral * c.amp, -0.1 * spiral * c.amp];
    bones.upperChest = [-0.06 * spiral * c.amp, 0.14 * spiral * c.amp, 0];
    bones.leftUpperArm = [(-0.48 - 0.36 * spiral) * c.amp, 0.28 * c.amp, -0.68 + 0.75 * spiral * c.amp];
    bones.rightUpperArm = [(-0.48 - 0.56 * spiral) * c.amp, -0.28 * c.amp, 0.68 - 1.15 * spiral * c.amp];
    bones.leftLowerArm = [0, -0.45 * c.amp, 0];
    bones.rightLowerArm = [0, (0.55 + 0.35 * spiral) * c.amp, 0];
    bones.leftHand = [0, 0, waveHead * 0.25 * c.amp];
    bones.rightHand = [0, 0, -waveHead * 0.25 * c.amp];
  } else {
    // Bar 4: Lyrical Chest Expansion -> Soft Révérence Bow
    const bow = Math.max(0, (c.barPhase - 0.55) / 0.45);
    const open = Math.sin(Math.min(1, c.barPhase / 0.65) * Math.PI);
    hipY = -0.006 + open * 0.025 - bow * 0.028;
    bones.spine = [(0.12 * bow - 0.06 * open) * c.amp, sway * 0.08 * c.amp, 0];
    bones.chest = [(0.14 * bow - 0.08 * open) * c.amp, 0, 0];
    bones.upperChest = [(0.1 * bow - 0.06 * open) * c.amp, 0, 0];
    bones.head = [(0.18 * bow - 0.08 * open) * c.amp, -0.1 * bow * c.amp, 0.08 * open * c.amp];

    bones.leftUpperArm = [(-0.45 - 0.38 * open + 0.2 * bow) * c.amp, 0.28 * c.amp, -0.78 + 1.05 * open * c.amp];
    bones.rightUpperArm = [(-0.45 - 0.38 * open + 0.2 * bow) * c.amp, -0.28 * c.amp, 0.78 - 1.05 * open * c.amp];
    bones.leftLowerArm = [0, (-0.38 - 0.35 * bow) * c.amp, 0];
    bones.rightLowerArm = [0, (0.38 + 0.35 * bow) * c.amp, 0];
    bones.leftHand = [0, 0, (0.25 * open - 0.15 * bow) * c.amp];
    bones.rightHand = [0, 0, (-0.25 * open + 0.15 * bow) * c.amp];
  }

  bones.leftUpperLeg = [-(plie * 0.5 + stepL), 0.1, 0.06];
  bones.leftLowerLeg = [plie + Math.max(0, stepL) * 1.1, 0, 0];
  bones.leftFoot = [-plie * 0.45, 0, 0];
  bones.rightUpperLeg = [-(plie * 0.5 + stepR), -0.1, -0.06];
  bones.rightLowerLeg = [plie + Math.max(0, stepR) * 1.1, 0, 0];
  bones.rightFoot = [-plie * 0.45, 0, 0];

  return {
    activeStyle: 'waltz',
    activeMotifLabel: motifLabel,
    hipsOffset: { x: hipX * c.amp, y: hipY * c.amp, z: Math.cos(slowArc) * 0.03 * c.amp },
    bones,
    expression: {
      happy: 0.24 + c.lowMid * 0.16,
      aa: 0,
      relaxed: 0.55,
      surprised: 0,
    },
  };
}

function blendPoseInPlace(
  target: VRMHumanoidPose,
  next: VRMHumanoidPose,
  alpha: number,
): void {
  const t = clamp(alpha, 0, 1);
  target.hipsOffset.x = lerp(target.hipsOffset.x, next.hipsOffset.x, t);
  target.hipsOffset.y = lerp(target.hipsOffset.y, next.hipsOffset.y, t);
  target.hipsOffset.z = lerp(target.hipsOffset.z, next.hipsOffset.z, t);

  for (const bone of DANCE_BONE_NAMES) {
    const a = target.bones[bone];
    const b = next.bones[bone];
    a[0] = lerp(a[0], b[0], t);
    a[1] = lerp(a[1], b[1], t);
    a[2] = lerp(a[2], b[2], t);
  }

  target.expression.happy = lerp(target.expression.happy, next.expression.happy, t);
  target.expression.aa = lerp(target.expression.aa, next.expression.aa, t);
  target.expression.relaxed = lerp(target.expression.relaxed, next.expression.relaxed, t);
  target.expression.surprised = lerp(target.expression.surprised, next.expression.surprised, t);
}

function clampPose(pose: VRMHumanoidPose): VRMHumanoidPose {
  // Grounding adjustment: keep hips drop proportional to true leg-bend vertical shortening
  const avgKnee =
    (pose.bones.leftLowerLeg[0] + pose.bones.rightLowerLeg[0]) * 0.5;
  const kneeDrop = Math.max(0, avgKnee - 0.1) * 0.028;

  pose.hipsOffset.x = clamp(pose.hipsOffset.x, -0.22, 0.22);
  pose.hipsOffset.y = clamp(pose.hipsOffset.y - kneeDrop, -0.065, 0.08);
  pose.hipsOffset.z = clamp(pose.hipsOffset.z, -0.15, 0.15);

  // Clamp anatomical joint ranges safely to prevent self-clipping into torso & sleeves
  pose.bones.leftLowerLeg[0] = clamp(pose.bones.leftLowerLeg[0], 0, 1.55);
  pose.bones.rightLowerLeg[0] = clamp(pose.bones.rightLowerLeg[0], 0, 1.55);
  pose.bones.leftUpperArm[0] = clamp(pose.bones.leftUpperArm[0], -1.45, 0.72);
  pose.bones.rightUpperArm[0] = clamp(pose.bones.rightUpperArm[0], -1.45, 0.72);
  pose.bones.leftUpperArm[1] = clamp(pose.bones.leftUpperArm[1], -0.75, 0.75);
  pose.bones.rightUpperArm[1] = clamp(pose.bones.rightUpperArm[1], -0.75, 0.75);
  pose.bones.leftUpperArm[2] = clamp(pose.bones.leftUpperArm[2], -1.24, 1.35);
  pose.bones.rightUpperArm[2] = clamp(pose.bones.rightUpperArm[2], -1.35, 1.24);
  pose.bones.leftLowerArm[1] = clamp(pose.bones.leftLowerArm[1], -2.0, 0);
  pose.bones.rightLowerArm[1] = clamp(pose.bones.rightLowerArm[1], 0, 2.0);

  // Proportional clavicle/shoulder follow keeps loose T-shirt sleeves aligned with upper arms
  const leftLift = Math.max(0, pose.bones.leftUpperArm[2] + 0.9);
  const rightLift = Math.max(0, -pose.bones.rightUpperArm[2] + 0.9);
  pose.bones.leftShoulder[2] = clamp(pose.bones.leftShoulder[2] + leftLift * 0.12, -0.1, 0.36);
  pose.bones.rightShoulder[2] = clamp(pose.bones.rightShoulder[2] - rightLift * 0.12, -0.36, 0.1);

  for (const boneName of DANCE_BONE_NAMES) {
    const rot = pose.bones[boneName];
    rot[0] = sanitizeAngle(rot[0]);
    rot[1] = sanitizeAngle(rot[1]);
    rot[2] = sanitizeAngle(rot[2]);
  }

  return pose;
}

export class PoseBlender {
  private current: VRMHumanoidPose;

  constructor() {
    this.current = computeIdlePose(0);
  }

  public step(target: VRMHumanoidPose, dt: number): VRMHumanoidPose {
    const safeDt = clamp(Number.isFinite(dt) ? dt : 0.016, 0.001, 0.15);
    const lambda =
      target.activeStyle === 'robot'
        ? 22
        : target.activeStyle === 'urban'
          ? 17
          : target.activeStyle === 'waltz'
            ? 8.5
            : target.activeStyle === 'latin'
              ? 13
              : 14.5;
    const alpha = 1 - Math.exp(-lambda * safeDt);

    this.current.activeStyle = target.activeStyle;
    this.current.activeMotifLabel = target.activeMotifLabel;
    this.current.hipsOffset.x = lerp(this.current.hipsOffset.x, target.hipsOffset.x, alpha);
    this.current.hipsOffset.y = lerp(this.current.hipsOffset.y, target.hipsOffset.y, alpha);
    this.current.hipsOffset.z = lerp(this.current.hipsOffset.z, target.hipsOffset.z, alpha);

    for (const bone of DANCE_BONE_NAMES) {
      const cur = this.current.bones[bone];
      const tgt = target.bones[bone];
      cur[0] = lerp(cur[0], tgt[0], alpha);
      cur[1] = lerp(cur[1], tgt[1], alpha);
      cur[2] = lerp(cur[2], tgt[2], alpha);
    }

    const expAlpha = 1 - Math.exp(-10 * safeDt);
    this.current.expression.happy = lerp(this.current.expression.happy, target.expression.happy, expAlpha);
    this.current.expression.aa = lerp(this.current.expression.aa, target.expression.aa, expAlpha);
    this.current.expression.relaxed = lerp(this.current.expression.relaxed, target.expression.relaxed, expAlpha);
    this.current.expression.surprised = lerp(this.current.expression.surprised, target.expression.surprised, expAlpha);

    return this.current;
  }
}

function sanitizeAngle(rad: number): number {
  if (!Number.isFinite(rad)) return 0;
  return clamp(rad, -Math.PI, Math.PI);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
