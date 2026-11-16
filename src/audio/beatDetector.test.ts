import test from 'node:test';
import assert from 'node:assert/strict';
import { BeatDetector, computeRangeEnergy } from './beatDetector';

test('computeRangeEnergy averages and normalizes byte bins within frequency range', () => {
  const bins = new Uint8Array(512);
  // Sample rate 48000, fftSize 1024 -> nyquist 24000, hzPerBin = 24000 / 512 = 46.875 Hz
  const hzPerBin = 24000 / 512;
  // Put strong energy in bass bins (bins 1..3 => ~47-140 Hz)
  bins[1] = 255;
  bins[2] = 255;
  bins[3] = 255;

  const bass = computeRangeEnergy(bins, hzPerBin, 20, 180);
  const treble = computeRangeEnergy(bins, hzPerBin, 4000, 10000);

  assert.ok(bass > 0.7, `expected bass > 0.7, got ${bass}`);
  assert.equal(treble, 0);
});

test('BeatDetector triggers beat onset on strong bass transient and respects cooldown', () => {
  const detector = new BeatDetector({ beatCooldownSec: 0.25 });
  const quiet = new Uint8Array(512);
  const kick = new Uint8Array(512);
  kick[1] = 240;
  kick[2] = 230;
  kick[3] = 200;

  // Warm up with quiet frames
  for (let i = 0; i < 10; i++) {
    detector.update(quiet, 48000, 1024, 0.016);
  }

  const onset = detector.update(kick, 48000, 1024, 0.016);
  assert.equal(onset.isBeatOnset, true);
  assert.equal(onset.beatPulse, 1);
  assert.equal(onset.spectrumBands.length, 24);

  // Immediate next frame within cooldown should not re-trigger onset
  const immediate = detector.update(kick, 48000, 1024, 0.016);
  assert.equal(immediate.isBeatOnset, false);
  assert.ok(immediate.beatPulse < 1);
});

test('BeatDetector advances beatCount and beatPhase smoothly with known BPM', () => {
  const detector = new BeatDetector();
  const active = new Uint8Array(512);
  active[2] = 180;
  active[12] = 150;

  // 120 BPM = 2 beats per second -> 0.5s per beat
  let metrics = detector.update(active, 48000, 1024, 0.2, 120);
  assert.equal(metrics.bpm, 120);
  assert.ok(Math.abs(metrics.beatPhase - 0.4) < 0.01);

  // Advance 0.36s in two 0.18s steps => total 0.56s (1.12 beats) -> wraps beatCount
  detector.update(active, 48000, 1024, 0.18, 120);
  metrics = detector.update(active, 48000, 1024, 0.18, 120);
  assert.ok(metrics.beatCount >= 1);
  assert.ok(metrics.beatPhase >= 0 && metrics.beatPhase < 1);
});
