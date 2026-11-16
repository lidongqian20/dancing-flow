import * as THREE from 'three';
import { BVHLoader, type BVH } from 'three/addons/loaders/BVHLoader.js';
import { VRMHumanBoneParentMap, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { VRMAnimation } from '@pixiv/three-vrm-animation';

export interface BVHConvertOptions {
  /** Frame 0 in many BVH mocap datasets (CMU, dance-dataset) is a calibration T-pose. Default: true */
  trimFrameZero?: boolean;
  /** Recenter hips X/Z around trajectory midpoint so the dancer stays centered on the stage podium. Default: true */
  recenterXZ?: boolean;
  /** Max horizontal excursion radius in meters (at 0.94m hips height) to keep traveling dances on podium. Default: 1.15 */
  maxRadiusMeters?: number;
  /** Initial Y-axis rotation offset in radians (applied to hips orientation & X/Z trajectory). Default: 0 */
  yawOffsetRad?: number;
}

const EXACT_BONE_ALIASES: Record<string, VRMHumanBoneName> = {
  hips: 'hips',
  pelvis: 'hips',
  root: 'hips',
  spine: 'spine',
  lowerback: 'spine',
  spine1: 'chest',
  chest: 'chest',
  spine2: 'upperChest',
  spine3: 'upperChest',
  upperchest: 'upperChest',
  neck: 'neck',
  head: 'head',
  leftshoulder: 'leftShoulder',
  lshoulder: 'leftShoulder',
  leftclavicle: 'leftShoulder',
  leftarm: 'leftUpperArm',
  leftupperarm: 'leftUpperArm',
  larm: 'leftUpperArm',
  leftforearm: 'leftLowerArm',
  leftlowerarm: 'leftLowerArm',
  lforearm: 'leftLowerArm',
  lefthand: 'leftHand',
  lhand: 'leftHand',
  rightshoulder: 'rightShoulder',
  rshoulder: 'rightShoulder',
  rightclavicle: 'rightShoulder',
  rightarm: 'rightUpperArm',
  rightupperarm: 'rightUpperArm',
  rarm: 'rightUpperArm',
  rightforearm: 'rightLowerArm',
  rightlowerarm: 'rightLowerArm',
  rforearm: 'rightLowerArm',
  righthand: 'rightHand',
  rhand: 'rightHand',
  leftupleg: 'leftUpperLeg',
  leftupperleg: 'leftUpperLeg',
  leftthigh: 'leftUpperLeg',
  lupleg: 'leftUpperLeg',
  leftleg: 'leftLowerLeg',
  leftlowerleg: 'leftLowerLeg',
  leftshin: 'leftLowerLeg',
  lleg: 'leftLowerLeg',
  leftfoot: 'leftFoot',
  lfoot: 'leftFoot',
  lefttoebase: 'leftToes',
  lefttoes: 'leftToes',
  ltoebase: 'leftToes',
  rightupleg: 'rightUpperLeg',
  rightupperleg: 'rightUpperLeg',
  rightthigh: 'rightUpperLeg',
  rupleg: 'rightUpperLeg',
  rightleg: 'rightLowerLeg',
  rightlowerleg: 'rightLowerLeg',
  rightshin: 'rightLowerLeg',
  rleg: 'rightLowerLeg',
  rightfoot: 'rightFoot',
  rfoot: 'rightFoot',
  righttoebase: 'rightToes',
  righttoes: 'rightToes',
  rtoebase: 'rightToes',
  // Finger mappings (optional, enhances CMU & full-body rigs)
  leftthumb1: 'leftThumbMetacarpal',
  lthumb: 'leftThumbProximal',
  lefthandthumb1: 'leftThumbMetacarpal',
  lefthandthumb2: 'leftThumbProximal',
  lefthandthumb3: 'leftThumbDistal',
  lefthandindex1: 'leftIndexProximal',
  lefthandindex2: 'leftIndexIntermediate',
  lefthandindex3: 'leftIndexDistal',
  rightthumb1: 'rightThumbMetacarpal',
  rthumb: 'rightThumbProximal',
  righthandthumb1: 'rightThumbMetacarpal',
  righthandthumb2: 'rightThumbProximal',
  righthandthumb3: 'rightThumbDistal',
  righthandindex1: 'rightIndexProximal',
  righthandindex2: 'rightIndexIntermediate',
  righthandindex3: 'rightIndexDistal',
};

function normalizeBoneKey(rawName: string): string {
  // Strip common rig namespace prefixes like "mixamorig:" or "Character1_"
  const stripped = rawName.includes(':') ? rawName.split(':').pop() ?? rawName : rawName;
  return stripped.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Find the structural hips root bone in a BVH skeleton hierarchy.
 */
export function getRootBone(skeleton: THREE.Skeleton): THREE.Bone {
  const rootBones = skeleton.bones.filter((b) => !(b.parent instanceof THREE.Bone));
  for (const bone of rootBones) {
    if (normalizeBoneKey(bone.name) === 'hips') {
      return bone;
    }
  }
  // Fallback: pick the bone whose subtree has the most children (main body)
  let best = rootBones[0] ?? skeleton.bones[0];
  let bestCount = -1;
  for (const bone of rootBones) {
    let count = 0;
    bone.traverse(() => {
      count++;
    });
    if (count > bestCount) {
      bestCount = count;
      best = bone;
    }
  }
  return best;
}

/**
 * Map a BVH skeleton's bones to standard VRMHumanBoneName targets.
 * Handles MotionBuilder (Hips/Spine1/Spine2/Spine3), CMU (LowerBack/LHipJoint/Neck1),
 * and Mixamo naming conventions, plus structural spine disambiguation.
 */
export function mapSkeletonToVRM(
  skeleton: THREE.Skeleton,
): Map<VRMHumanBoneName, THREE.Bone> {
  const map = new Map<VRMHumanBoneName, THREE.Bone>();
  const usedBones = new Set<THREE.Bone>();

  const root = getRootBone(skeleton);
  const allBones: THREE.Bone[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Bone) {
      allBones.push(obj);
    }
  });

  // Pass 1: Special CMU / MotionBuilder spine stack disambiguation
  // - MotionBuilder: Spine -> Spine1 -> Spine2 -> Spine3
  //   Map Spine -> spine, Spine1 -> chest, Spine3 -> upperChest (leaving Spine2 to compose cleanly)
  // - CMU: LowerBack -> Spine -> Spine1
  //   Map LowerBack -> spine, Spine -> chest, Spine1 -> upperChest
  const byKey = new Map<string, THREE.Bone>();
  for (const bone of allBones) {
    const key = normalizeBoneKey(bone.name);
    if (!byKey.has(key)) byKey.set(key, bone);
  }

  const assign = (vrmName: VRMHumanBoneName, bone: THREE.Bone | undefined) => {
    if (!bone || map.has(vrmName) || usedBones.has(bone)) return;
    map.set(vrmName, bone);
    usedBones.add(bone);
  };

  if (byKey.has('lowerback') && byKey.has('spine')) {
    assign('spine', byKey.get('lowerback'));
    assign('chest', byKey.get('spine'));
    if (byKey.has('spine1')) {
      assign('upperChest', byKey.get('spine1'));
    }
  } else if (byKey.has('spine3') && byKey.has('spine1') && byKey.has('spine')) {
    assign('spine', byKey.get('spine'));
    assign('chest', byKey.get('spine1'));
    assign('upperChest', byKey.get('spine3'));
  }

  // Pass 2: Standard exact / alias matching
  for (const bone of allBones) {
    if (usedBones.has(bone)) continue;
    const key = normalizeBoneKey(bone.name);
    const target = EXACT_BONE_ALIASES[key];
    if (target) {
      assign(target, bone);
    }
  }

  // Pass 3: Ensure hips is mapped
  if (!map.has('hips')) {
    assign('hips', root);
  }

  return map;
}

/**
 * Parse raw BVH text into Three.js BVH structure and convert directly into VRMAnimation.
 */
export function parseBVHToVRMAnimation(
  bvhText: string,
  options?: BVHConvertOptions,
): VRMAnimation {
  const loader = new BVHLoader();
  const bvh = loader.parse(bvhText);
  return convertBVHToVRMAnimation(bvh, options);
}

/**
 * Convert a parsed Three.js BVH object directly into an in-memory VRMAnimation
 * ready for @pixiv/three-vrm-animation `createVRMAnimationClip(vrmAnimation, vrm)`.
 *
 * Key retargeting guarantees:
 * 1. Frame 0 is evaluated on the BVH hierarchy to extract true T-pose world orientations
 *    (critical for CMU skeletons whose raw OFFSET pose has 21-deg A-pose legs).
 * 2. Intermediate unmapped joints (e.g. CMU `LHipJoint`, `Neck1`, MotionBuilder `Spine2`)
 *    have their local rotations composed into the next mapped child bone so zero motion is lost.
 * 3. Frame 0 is trimmed from playback tracks (when >= 2 frames exist) so looping never flashes a T-pose.
 * 4. Hips X/Z translation is centered on the dance trajectory midpoint and bounded within stage radius.
 */
export function convertBVHToVRMAnimation(
  bvh: BVH,
  options: BVHConvertOptions = {},
): VRMAnimation {
  const {
    trimFrameZero = true,
    recenterXZ = true,
    maxRadiusMeters = 1.15,
    yawOffsetRad = 0,
  } = options;

  const rootBone = getRootBone(bvh.skeleton);
  const vrmBoneMap = mapSkeletonToVRM(bvh.skeleton);
  const boneToVrm = new Map<THREE.Bone, VRMHumanBoneName>();
  for (const [vrmName, bone] of vrmBoneMap.entries()) {
    boneToVrm.set(bone, vrmName);
  }

  // Index original BVH tracks by bone name
  const posTrackByBone = new Map<string, THREE.VectorKeyframeTrack>();
  const rotTrackByBone = new Map<string, THREE.QuaternionKeyframeTrack>();
  for (const track of bvh.clip.tracks) {
    const dotIdx = track.name.lastIndexOf('.');
    if (dotIdx < 0) continue;
    const boneName = track.name.slice(0, dotIdx);
    const prop = track.name.slice(dotIdx + 1);
    if (prop === 'position' && track instanceof THREE.VectorKeyframeTrack) {
      posTrackByBone.set(boneName, track);
    } else if (prop === 'quaternion' && track instanceof THREE.QuaternionKeyframeTrack) {
      rotTrackByBone.set(boneName, track);
    }
  }

  // Evaluate Frame 0 on the BVH skeleton to obtain true T-pose world matrices
  for (const bone of bvh.skeleton.bones) {
    const posTrack = posTrackByBone.get(bone.name);
    const rotTrack = rotTrackByBone.get(bone.name);
    if (posTrack && posTrack.values.length >= 3) {
      bone.position.fromArray(posTrack.values, 0);
    }
    if (rotTrack && rotTrack.values.length >= 4) {
      bone.quaternion.fromArray(rotTrack.values, 0);
    }
  }
  rootBone.updateWorldMatrix(true, true);

  const worldQuatMap = new Map<THREE.Bone, THREE.Quaternion>();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  for (const bone of bvh.skeleton.bones) {
    bone.matrixWorld.decompose(tmpPos, tmpQuat, tmpScale);
    worldQuatMap.set(bone, tmpQuat.clone());
  }

  const hipsBone = vrmBoneMap.get('hips') ?? rootBone;
  const restHipsPosition = new THREE.Vector3();
  hipsBone.getWorldPosition(restHipsPosition);

  // Determine frame slice [startFrame .. totalFrames - 1]
  const sampleRotTrack = rotTrackByBone.get(hipsBone.name) ?? rotTrackByBone.values().next().value;
  const totalFrames = sampleRotTrack ? sampleRotTrack.times.length : 0;
  const startFrame = trimFrameZero && totalFrames >= 2 ? 1 : 0;
  const frameCount = Math.max(0, totalFrames - startFrame);

  // Fallback for restHipsPosition.y if frame 0 was zeroed out
  if (restHipsPosition.y <= 0.01) {
    const hipsPosTrack = posTrackByBone.get(hipsBone.name);
    if (hipsPosTrack && hipsPosTrack.values.length > startFrame * 3 + 1) {
      restHipsPosition.y = hipsPosTrack.values[startFrame * 3 + 1];
    }
  }
  if (restHipsPosition.y <= 0.01) {
    restHipsPosition.y = 1.0;
  }

  const result = new VRMAnimation();
  result.restHipsPosition.copy(restHipsPosition);

  if (frameCount === 0) {
    result.duration = 0;
    return result;
  }

  const rawTimes = sampleRotTrack!.times;
  const t0 = rawTimes[startFrame];
  const times = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    times[i] = Math.max(0, rawTimes[startFrame + i] - t0);
  }
  result.duration = times[times.length - 1] || bvh.clip.duration;

  const yawQuat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    yawOffsetRad,
  );

  // Convert Hips translation track
  const hipsPosTrack = posTrackByBone.get(hipsBone.name);
  if (hipsPosTrack && hipsPosTrack.values.length >= (startFrame + frameCount) * 3) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < frameCount; i++) {
      const idx = (startFrame + i) * 3;
      const x = hipsPosTrack.values[idx];
      const z = hipsPosTrack.values[idx + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    const centerX = recenterXZ ? (minX + maxX) * 0.5 : 0;
    const centerZ = recenterXZ ? (minZ + maxZ) * 0.5 : 0;

    // Limit horizontal travel so wide traveling choreographies remain on the circular stage podium
    const maxRawSpan = Math.max((maxX - minX) * 0.5, (maxZ - minZ) * 0.5);
    const estMetersScale = 0.94 / restHipsPosition.y;
    const maxRawRadiusInBvh = maxRadiusMeters / estMetersScale;
    const xzScale =
      maxRawSpan > maxRawRadiusInBvh && maxRawSpan > 1e-5
        ? maxRawRadiusInBvh / maxRawSpan
        : 1;

    const translatedValues = new Float32Array(frameCount * 3);
    const cosY = Math.cos(yawOffsetRad);
    const sinY = Math.sin(yawOffsetRad);

    for (let i = 0; i < frameCount; i++) {
      const srcIdx = (startFrame + i) * 3;
      const dx = (hipsPosTrack.values[srcIdx] - centerX) * xzScale;
      const dy = hipsPosTrack.values[srcIdx + 1];
      const dz = (hipsPosTrack.values[srcIdx + 2] - centerZ) * xzScale;

      const rx = dx * cosY + dz * sinY;
      const rz = -dx * sinY + dz * cosY;

      translatedValues[i * 3] = rx;
      translatedValues[i * 3 + 1] = dy;
      translatedValues[i * 3 + 2] = rz;
    }

    result.humanoidTracks.translation.set(
      'hips',
      new THREE.VectorKeyframeTrack('hips.position', times, translatedValues),
    );
  }

  // Convert each mapped humanoid bone rotation track into VRM normalized T-pose space
  const qParentWorld = new THREE.Quaternion();
  const qBoneWorldInv = new THREE.Quaternion();
  const qChain = new THREE.Quaternion();
  const qStep = new THREE.Quaternion();
  const qOut = new THREE.Quaternion();
  const qPrev = new THREE.Quaternion();

  for (const [vrmName, bvhBone] of vrmBoneMap.entries()) {
    // Collect chain from nearest mapped BVH ancestor down to bvhBone
    const chain: THREE.Bone[] = [bvhBone];
    let cursor = bvhBone.parent;
    let mappedParentBone: THREE.Bone | null = null;
    while (cursor instanceof THREE.Bone) {
      if (boneToVrm.has(cursor)) {
        mappedParentBone = cursor;
        break;
      }
      chain.unshift(cursor);
      cursor = cursor.parent;
    }

    // Verify we follow VRM parent hierarchy cleanly
    if (mappedParentBone) {
      qParentWorld.copy(worldQuatMap.get(mappedParentBone) ?? new THREE.Quaternion());
    } else {
      // Root parent is world identity unless skeleton root had a parent object
      qParentWorld.identity();
      const parentVrm = VRMHumanBoneParentMap[vrmName];
      void parentVrm;
    }

    qBoneWorldInv.copy(worldQuatMap.get(bvhBone) ?? new THREE.Quaternion()).invert();

    const chainTracks = chain.map((b) => rotTrackByBone.get(b.name) ?? null);
    const hasAnyTrack = chainTracks.some((t) => t !== null);
    if (!hasAnyTrack) continue;

    const rotValues = new Float32Array(frameCount * 4);
    for (let i = 0; i < frameCount; i++) {
      const frameIdx = startFrame + i;
      qChain.identity();
      for (let c = 0; c < chain.length; c++) {
        const tr = chainTracks[c];
        if (tr && tr.values.length >= (frameIdx + 1) * 4) {
          qStep.fromArray(tr.values, frameIdx * 4);
        } else {
          qStep.copy(chain[c].quaternion);
        }
        qChain.multiply(qStep);
      }

      // q_vrm = W_0(parent) * qChain * W_0(bone)^-1
      qOut.copy(qParentWorld).multiply(qChain).multiply(qBoneWorldInv);
      if (vrmName === 'hips' && yawOffsetRad !== 0) {
        qOut.premultiply(yawQuat);
      }
      qOut.normalize();

      // Shortest-path sign continuity across frames
      if (i > 0 && qOut.dot(qPrev) < 0) {
        qOut.set(-qOut.x, -qOut.y, -qOut.z, -qOut.w);
      }
      qPrev.copy(qOut);
      qOut.toArray(rotValues, i * 4);
    }

    result.humanoidTracks.rotation.set(
      vrmName,
      new THREE.QuaternionKeyframeTrack(`${vrmName}.quaternion`, times, rotValues),
    );
  }

  return result;
}
