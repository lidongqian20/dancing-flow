import test from 'node:test';
import assert from 'node:assert/strict';
import type { AudioMetrics } from '../audio/beatDetector';
import {
  computeDancePose,
  computeIdlePose,
  DANCE_BONE_NAMES,
  DANCE_STYLE_KNOWLEDGE,
  PoseBlender,
  resolveAutoDanceStyle,
  type ConcreteDanceStyle,
} from './choreography';

const ALL_STYLES: ConcreteDanceStyle[] = [
  'hiphop',
  'idol',
  'urban',
  'robot',
  'house',
  'latin',
  'waltz',
];

function makeMetrics(overrides: Partial<AudioMetrics> = {}): AudioMetrics {
  return {
    bass: 0.72,
    mid: 0.55,
    treble: 0.48,
    overall: 0.62,
    beatPulse: 0.85,
    beatCount: 4,
    beatPhase: 0.25,
    bpm: 120,
    isBeatOnset: false,
    spectrumBands: new Array(24).fill(0.5),
    ...overrides,
  };
}

test('computeIdlePose lowers arms naturally and produces finite 20-bone joint angles', () => {
  const idle = computeIdlePose(1.5);
  assert.equal(idle.activeMotifLabel, '待机呼吸');
  assert.ok(idle.bones.leftUpperArm[2] < -1.0, 'left arm should hang downward');
  assert.ok(idle.bones.rightUpperArm[2] > 1.0, 'right arm should hang downward');
  assert.equal(DANCE_BONE_NAMES.length, 20);
  for (const bone of DANCE_BONE_NAMES) {
    for (const val of idle.bones[bone]) {
      assert.ok(Number.isFinite(val), `bone ${bone} contains non-finite value`);
    }
  }
});

test('all 7 dance styles produce distinct, anatomically clamped poses with motif labels', () => {
  const metrics = makeMetrics({ beatCount: 5, beatPhase: 0.35 });
  const poses = ALL_STYLES.map((style) => computeDancePose(style, metrics, 1.0));

  for (const pose of poses) {
    assert.ok(pose.activeMotifLabel.length > 0);
    assert.ok(pose.bones.leftLowerLeg[0] >= 0 && pose.bones.leftLowerLeg[0] <= 1.6);
    assert.ok(pose.bones.rightLowerLeg[0] >= 0 && pose.bones.rightLowerLeg[0] <= 1.6);
    assert.ok(pose.bones.leftLowerArm[1] <= 0);
    assert.ok(pose.bones.rightLowerArm[1] >= 0);
    assert.ok(pose.hipsOffset.y >= -0.065 && pose.hipsOffset.y <= 0.08);
    for (const bone of DANCE_BONE_NAMES) {
      for (const val of pose.bones[bone]) {
        assert.ok(Number.isFinite(val), `${pose.activeStyle} ${bone} has non-finite angle`);
      }
    }
  }

  // Ensure different styles produce genuinely distinct poses
  const hiphopPose = poses[0];
  const idolPose = poses[1];
  const urbanPose = poses[2];
  const robotPose = poses[3];
  const latinPose = poses[5];
  const waltzPose = poses[6];

  assert.notEqual(hiphopPose.bones.chest[0], waltzPose.bones.chest[0]);
  assert.notEqual(urbanPose.bones.leftUpperArm[0], latinPose.bones.leftUpperArm[0]);
  assert.ok(robotPose.bones.leftLowerArm[1] < -1.2, 'robot style should bend forearm sharply');
  assert.ok(idolPose.expression.happy > 0.6, 'idol style should have cheerful happy expression');
});

test('each of the 7 styles progresses through 4 distinct bar motifs with changing poses', () => {
  for (const style of ALL_STYLES) {
    const barBeats = DANCE_STYLE_KNOWLEDGE[style].timeSignatureBeats;
    const motifLabels = new Set<string>();
    const armSignatures = new Set<string>();

    for (let bar = 0; bar < 4; bar++) {
      const pose = computeDancePose(
        style,
        makeMetrics({ beatCount: bar * barBeats + 1, beatPhase: 0.45 }),
        1.1,
      );
      motifLabels.add(pose.activeMotifLabel);
      armSignatures.add(
        `${pose.bones.leftUpperArm[0].toFixed(2)},${pose.bones.leftUpperArm[2].toFixed(2)},${pose.bones.rightUpperArm[0].toFixed(2)}`,
      );
    }

    assert.equal(motifLabels.size, 4, `${style} should expose 4 unique motif labels across a phrase`);
    assert.ok(
      armSignatures.size >= 3,
      `${style} should produce visually distinct choreography across bars`,
    );
  }
});

test('resolveAutoDanceStyle adapts across 16-beat phrases and tempo bands', () => {
  const stylePhrase0 = resolveAutoDanceStyle(makeMetrics({ beatCount: 0, bpm: 116 }));
  const stylePhrase1 = resolveAutoDanceStyle(makeMetrics({ beatCount: 16, bpm: 116 }));
  const styleSlow = resolveAutoDanceStyle(makeMetrics({ beatCount: 16, bpm: 88 }));
  const styleFast = resolveAutoDanceStyle(makeMetrics({ beatCount: 0, bpm: 132, treble: 0.6 }));

  assert.notEqual(stylePhrase0, stylePhrase1);
  assert.equal(styleSlow, 'waltz');
  assert.equal(styleFast, 'house');
});

test('PoseBlender smoothly converges toward target pose without snapping', () => {
  const blender = new PoseBlender();
  const target = computeDancePose('urban', makeMetrics({ beatCount: 9, beatPhase: 0.5 }), 1.2);

  const step1 = blender.step(target, 0.016);
  assert.equal(step1.activeMotifLabel, target.activeMotifLabel);
  const initialGap = Math.abs(step1.bones.leftUpperArm[2] - target.bones.leftUpperArm[2]);

  let latest = step1;
  for (let i = 0; i < 60; i++) {
    latest = blender.step(target, 0.016);
  }
  const finalGap = Math.abs(latest.bones.leftUpperArm[2] - target.bones.leftUpperArm[2]);

  assert.ok(finalGap < initialGap * 0.05, 'PoseBlender should smoothly converge to target');
});

test('high-intensity poses keep hips grounded and upper arms within non-clipping bounds across all 7 styles and 4 bars', () => {
  const highMetrics = makeMetrics({
    bass: 1,
    mid: 1,
    treble: 1,
    beatPulse: 1,
    beatPhase: 0.5,
    spectrumBands: new Array(24).fill(1),
  });

  for (const style of ALL_STYLES) {
    const barBeats = DANCE_STYLE_KNOWLEDGE[style].timeSignatureBeats;
    for (let bar = 0; bar < 4; bar++) {
      const pose = computeDancePose(
        style,
        { ...highMetrics, beatCount: bar * barBeats + 2, beatPhase: 0.55 },
        1.8,
      );
      assert.ok(pose.hipsOffset.y >= -0.065, `${style} bar ${bar} hipsOffset.y too low: ${pose.hipsOffset.y}`);
      assert.ok(pose.bones.leftUpperArm[2] >= -1.25 && pose.bones.leftUpperArm[2] <= 1.36);
      assert.ok(pose.bones.rightUpperArm[2] >= -1.36 && pose.bones.rightUpperArm[2] <= 1.25);
      assert.ok(pose.bones.leftUpperArm[0] >= -1.46 && pose.bones.leftUpperArm[0] <= 0.73);
      assert.ok(pose.bones.rightUpperArm[0] >= -1.46 && pose.bones.rightUpperArm[0] <= 0.73);
      assert.ok(pose.bones.leftShoulder[2] >= -0.11 && pose.bones.leftShoulder[2] <= 0.37);
      assert.ok(pose.bones.rightShoulder[2] >= -0.37 && pose.bones.rightShoulder[2] <= 0.11);
    }
  }
});
