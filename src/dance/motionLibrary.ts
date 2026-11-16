import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { VRM } from '@pixiv/three-vrm';
import {
  createVRMAnimationClip,
  VRMAnimation,
  VRMAnimationLoaderPlugin,
} from '@pixiv/three-vrm-animation';
import * as THREE from 'three';
import { parseBVHToVRMAnimation } from './bvhConverter';

export type MotionPlaybackMode = 'procedural' | 'mocap';

export interface OpenSourceMotionPreset {
  id: string;
  label: string;
  shortLabel: string;
  category: string;
  durationLabel: string;
  nativeBpm: number;
  url: string;
  format: 'bvh' | 'vrma';
  sourceRepo: string;
  license: string;
  accentHex: string;
  yawOffsetRad?: number;
  maxRadiusMeters?: number;
  description: string;
}

export const OPEN_SOURCE_MOTIONS: OpenSourceMotionPreset[] = [
  {
    id: 'maniac',
    label: 'K-Pop · MANIAC 舞台编舞',
    shortLabel: 'MANIAC 编舞',
    category: 'K-Pop',
    durationLabel: '27s',
    nativeBpm: 120,
    url: '/animations/maniac.bvh',
    format: 'bvh',
    sourceRepo: 'tulay-hub/dance-dataset',
    license: 'MIT',
    accentHex: '#f59e0b',
    yawOffsetRad: 0,
    maxRadiusMeters: 1.05,
    description: '手部折返与律动切换丰富的完整流行舞台动作',
  },
  {
    id: 'loveshot',
    label: 'R&B · Love Shot 流行舞',
    shortLabel: 'Love Shot',
    category: 'Pop',
    durationLabel: '35s',
    nativeBpm: 112,
    url: '/animations/loveshot.bvh',
    format: 'bvh',
    sourceRepo: 'tulay-hub/dance-dataset',
    license: 'MIT',
    accentHex: '#ec4899',
    yawOffsetRad: 0,
    maxRadiusMeters: 1.05,
    description: '重心流动、胸胯 Wave 与转身衔接自然的流行舞步',
  },
  {
    id: 'gento',
    label: 'Hip-Hop · GENTO 街舞',
    shortLabel: 'GENTO 街舞',
    category: 'Hip-Hop',
    durationLabel: '35s',
    nativeBpm: 116,
    url: '/animations/gento.bvh',
    format: 'bvh',
    sourceRepo: 'tulay-hub/dance-dataset',
    license: 'MIT',
    accentHex: '#38bdf8',
    yawOffsetRad: 0,
    maxRadiusMeters: 1.05,
    description: '节拍点卡点鲜明、下沉 Bounce 感强的街舞混合编舞',
  },
  {
    id: 'salsa',
    label: '拉丁 · Salsa 莎莎舞',
    shortLabel: 'Salsa 莎莎',
    category: 'Latin',
    durationLabel: '14s',
    nativeBpm: 128,
    url: '/animations/salsa.bvh',
    format: 'bvh',
    sourceRepo: 'CMU Mocap DB #60_05',
    license: 'Public Mocap',
    accentHex: '#f43f5e',
    yawOffsetRad: -Math.PI * 0.5,
    maxRadiusMeters: 1.1,
    description: '脚步敏捷交叉、转向与胯部摆动的热情拉丁舞动捕',
  },
  {
    id: 'ballet',
    label: '古典 · Ballet 芭蕾跳跃',
    shortLabel: 'Ballet 芭蕾',
    category: 'Ballet',
    durationLabel: '7.4s',
    nativeBpm: 92,
    url: '/animations/ballet.bvh',
    format: 'bvh',
    sourceRepo: 'CMU Mocap DB #05_06',
    license: 'Public Mocap',
    accentHex: '#a78bfa',
    yawOffsetRad: 0,
    maxRadiusMeters: 1.15,
    description: '旋转与腾跃结合的现代芭蕾全身动作捕捉序列',
  },
];

const animationCache = new Map<string, VRMAnimation>();

async function loadVrmaFromUrl(url: string): Promise<VRMAnimation> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const vrmAnimations = (gltf.userData as { vrmAnimations?: VRMAnimation[] }).vrmAnimations;
  const anim = vrmAnimations?.[0];
  if (!anim) {
    throw new Error('VRMA 文件中未包含有效的 VRMAnimation 轨道');
  }
  return anim;
}

export async function loadPresetVRMAnimation(
  preset: OpenSourceMotionPreset,
): Promise<VRMAnimation> {
  const cached = animationCache.get(preset.id);
  if (cached) return cached;

  let vrmAnim: VRMAnimation;
  if (preset.format === 'vrma') {
    vrmAnim = await loadVrmaFromUrl(preset.url);
  } else {
    const response = await fetch(preset.url);
    if (!response.ok) {
      throw new Error(`动作文件加载失败 (${response.status})`);
    }
    const text = await response.text();
    vrmAnim = parseBVHToVRMAnimation(text, {
      trimFrameZero: true,
      recenterXZ: true,
      yawOffsetRad: preset.yawOffsetRad ?? 0,
      maxRadiusMeters: preset.maxRadiusMeters ?? 1.15,
    });
  }

  animationCache.set(preset.id, vrmAnim);
  return vrmAnim;
}

export async function loadCustomMotionFile(
  file: File,
): Promise<{ name: string; nativeBpm: number; vrmAnimation: VRMAnimation }> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.bvh')) {
    const text = await file.text();
    const vrmAnimation = parseBVHToVRMAnimation(text, {
      trimFrameZero: true,
      recenterXZ: true,
      maxRadiusMeters: 1.15,
    });
    return { name: file.name, nativeBpm: 120, vrmAnimation };
  }

  if (lowerName.endsWith('.vrma') || lowerName.endsWith('.glb')) {
    const blobUrl = URL.createObjectURL(file);
    try {
      const vrmAnimation = await loadVrmaFromUrl(blobUrl);
      return { name: file.name, nativeBpm: 120, vrmAnimation };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  throw new Error('仅支持 .bvh 或 .vrma 格式的动作文件');
}

export function buildClipForVrm(
  vrmAnimation: VRMAnimation,
  vrm: VRM,
  clipName: string,
): THREE.AnimationClip {
  const clip = createVRMAnimationClip(vrmAnimation, vrm);
  clip.name = clipName;
  return clip;
}
