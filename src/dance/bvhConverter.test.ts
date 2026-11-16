import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as THREE from 'three';
import { BVHLoader } from 'three/addons/loaders/BVHLoader.js';
import { convertBVHToVRMAnimation, mapSkeletonToVRM, parseBVHToVRMAnimation } from './bvhConverter.ts';

function readBvh(name: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), 'public/animations', name), 'utf8');
}

test('mapSkeletonToVRM handles MotionBuilder spine stacks (Spine..Spine3)', () => {
  const loader = new BVHLoader();
  const bvh = loader.parse(readBvh('maniac.bvh'));
  const map = mapSkeletonToVRM(bvh.skeleton);

  assert.equal(map.get('hips')?.name, 'Hips');
  assert.equal(map.get('spine')?.name, 'Spine');
  assert.equal(map.get('chest')?.name, 'Spine1');
  assert.equal(map.get('upperChest')?.name, 'Spine3');
  assert.equal(map.get('leftUpperArm')?.name, 'LeftArm');
  assert.equal(map.get('rightLowerLeg')?.name, 'RightLeg');
  assert.equal(map.get('head')?.name, 'Head');
});

test('mapSkeletonToVRM handles CMU skeletons (LowerBack, LHipJoint, Neck1)', () => {
  const loader = new BVHLoader();
  const bvh = loader.parse(readBvh('salsa.bvh'));
  const map = mapSkeletonToVRM(bvh.skeleton);

  assert.equal(map.get('hips')?.name, 'Hips');
  assert.equal(map.get('spine')?.name, 'LowerBack');
  assert.equal(map.get('chest')?.name, 'Spine');
  assert.equal(map.get('upperChest')?.name, 'Spine1');
  assert.equal(map.get('leftUpperLeg')?.name, 'LeftUpLeg');
  assert.equal(map.get('rightUpperLeg')?.name, 'RightUpLeg');
  assert.equal(map.get('head')?.name, 'Head');
});

test('convertBVHToVRMAnimation trims Frame 0, recenters XZ, and produces unit finite quaternions', () => {
  for (const filename of ['maniac.bvh', 'loveshot.bvh', 'gento.bvh', 'salsa.bvh', 'ballet.bvh']) {
    const anim = parseBVHToVRMAnimation(readBvh(filename), {
      yawOffsetRad: filename === 'salsa.bvh' ? -Math.PI / 2 : 0,
    });

    assert.ok(anim.duration > 5, `${filename} duration should be > 5s, got ${anim.duration}`);
    assert.ok(anim.restHipsPosition.y > 10, `${filename} restHipsPosition.y should be valid`);
    assert.ok(anim.humanoidTracks.rotation.size >= 17, `${filename} should map >= 17 core humanoid bones`);

    const hipsPos = anim.humanoidTracks.translation.get('hips');
    assert.ok(hipsPos, `${filename} should have hips translation track`);
    assert.equal(hipsPos.times[0], 0, `${filename} track time must start at 0`);

    // Verify centered X/Z and bounded stage radius (when scaled to 0.94m human height)
    const scale = 0.94 / anim.restHipsPosition.y;
    let maxR = 0;
    for (let i = 0; i < hipsPos.values.length; i += 3) {
      const x = hipsPos.values[i] * scale;
      const y = hipsPos.values[i + 1] * scale;
      const z = hipsPos.values[i + 2] * scale;
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
      const r = Math.hypot(x, z);
      if (r > maxR) maxR = r;
    }
    assert.ok(maxR <= 1.25, `${filename} horizontal radius ${maxR.toFixed(2)}m should stay within podium`);

    // Verify every quaternion frame is finite and unit length
    for (const [boneName, track] of anim.humanoidTracks.rotation.entries()) {
      for (let i = 0; i < track.values.length; i += 4) {
        const qx = track.values[i];
        const qy = track.values[i + 1];
        const qz = track.values[i + 2];
        const qw = track.values[i + 3];
        const norm = Math.hypot(qx, qy, qz, qw);
        assert.ok(
          Number.isFinite(norm) && Math.abs(norm - 1) < 1e-3,
          `${filename} ${boneName} quaternion norm invalid: ${norm}`,
        );
      }
    }
  }
});

test('convertBVHToVRMAnimation preserves Frame 0 T-pose identity when trimFrameZero=false', () => {
  const loader = new BVHLoader();
  const bvh = loader.parse(readBvh('salsa.bvh'));
  const anim = convertBVHToVRMAnimation(bvh, { trimFrameZero: false });

  // At frame 0 (T-pose), converted LeftUpperLeg quaternion must be near identity despite CMU -21deg offset
  const leftLegTrack = anim.humanoidTracks.rotation.get('leftUpperLeg');
  assert.ok(leftLegTrack);
  const q0 = new THREE.Quaternion().fromArray(leftLegTrack.values, 0);
  const angleFromIdentity = 2 * Math.acos(Math.min(1, Math.abs(q0.w)));
  assert.ok(
    angleFromIdentity < 0.02,
    `CMU Frame 0 T-pose calibration should normalize leftUpperLeg near identity (angle=${angleFromIdentity})`,
  );
});
