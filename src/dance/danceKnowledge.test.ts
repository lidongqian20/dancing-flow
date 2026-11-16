import test from 'node:test';
import assert from 'node:assert/strict';
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
} from './danceKnowledge';

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
    bass: 0.6,
    mid: 0.5,
    treble: 0.4,
    overall: 0.55,
    beatPulse: 0.7,
    beatCount: 0,
    beatPhase: 0.25,
    bpm: 120,
    isBeatOnset: false,
    spectrumBands: new Array(24).fill(0.4),
    ...overrides,
  };
}

test('DANCE_STYLE_KNOWLEDGE defines 7 styles with 4 unique motifs each (28 motifs total)', () => {
  const motifIds = new Set<string>();
  for (const style of ALL_STYLES) {
    const profile = DANCE_STYLE_KNOWLEDGE[style];
    assert.equal(profile.motifs.length, 4, `${style} must have 4 bar motifs`);
    assert.equal(
      profile.phraseLengthBeats,
      profile.timeSignatureBeats * 4,
      `${style} phrase length must equal 4 bars`,
    );
    for (const motif of profile.motifs) {
      assert.ok(motif.label.length > 0);
      assert.ok(motif.aestheticCue.length > 0);
      motifIds.add(motif.id);
    }
  }
  assert.equal(motifIds.size, 28, 'all 28 motifs must have unique IDs');
});

test('selectPhraseMotif cycles cleanly across 4 bars in both 4/4 and 3/4 meters', () => {
  // 4/4 style (hiphop): 4 beats per bar
  const hhBar0 = selectPhraseMotif('hiphop', 0.5);
  const hhBar1 = selectPhraseMotif('hiphop', 4.5);
  const hhBar2 = selectPhraseMotif('hiphop', 8.5);
  const hhBar3 = selectPhraseMotif('hiphop', 12.5);
  const hhWrap = selectPhraseMotif('hiphop', 16.5);

  assert.equal(hhBar0.barIndex, 0);
  assert.equal(hhBar1.barIndex, 1);
  assert.equal(hhBar2.barIndex, 2);
  assert.equal(hhBar3.barIndex, 3);
  assert.equal(hhWrap.barIndex, 0);

  const hhLabels = new Set([
    hhBar0.motif.label,
    hhBar1.motif.label,
    hhBar2.motif.label,
    hhBar3.motif.label,
  ]);
  assert.equal(hhLabels.size, 4);

  // Bar transition crossfade activates near the end of a bar
  const midBar = selectPhraseMotif('urban', 2.0);
  const endBar = selectPhraseMotif('urban', 3.9);
  assert.equal(midBar.blendToNext, 0);
  assert.ok(endBar.blendToNext > 0 && endBar.blendToNext <= 1);

  // 3/4 style (waltz): 3 beats per bar
  assert.equal(selectPhraseMotif('waltz', 2.5).barIndex, 0);
  assert.equal(selectPhraseMotif('waltz', 3.5).barIndex, 1);
  assert.equal(selectPhraseMotif('waltz', 6.5).barIndex, 2);
  assert.equal(selectPhraseMotif('waltz', 9.5).barIndex, 3);
  assert.equal(selectPhraseMotif('waltz', 12.5).barIndex, 0);

  // Negative/NaN beats clamp safely
  const safeNeg = selectPhraseMotif('latin', -3);
  assert.equal(safeNeg.barIndex, 0);
  assert.equal(safeNeg.beatInBar, 0);
});

test('groove envelopes produce bounded, distinct rhythmic profiles', () => {
  // Down-bounce peaks near beat onset (0.1) and dips near off-beat (0.6)
  const dbOn = downBounceEnvelope(0.1);
  const dbOff = downBounceEnvelope(0.6);
  assert.ok(dbOn > dbOff && dbOn <= 1 && dbOff >= 0);

  // Up-bounce lifts on off-beat (0.5) and drops near beat touch (0.0)
  const ubTouch = upBounceEnvelope(0.0);
  const ubLift = upBounceEnvelope(0.5);
  assert.ok(ubLift > ubTouch && ubLift <= 1 && ubTouch >= 0);

  // Dime-stop snaps early and exhibits post-snap muscle rebound
  const snapStart = dimeStopEnvelope(1.01, 1, 0.16);
  const snapMid = dimeStopEnvelope(1.15, 1, 0.16);
  const snapLate = dimeStopEnvelope(1.85, 1, 0.16);
  assert.equal(snapStart.stepIndex, 1);
  assert.ok(snapMid.hitRebound > 0.2);
  assert.equal(snapLate.hitRebound, 0);

  // Cuban motion & lyrical rise-fall stay bounded
  const cuban = cubanHipWave(1.5);
  assert.ok(Math.abs(cuban.lateral) <= 1.1);
  assert.ok(Math.abs(cuban.yaw) <= 1.1);

  const waltzLow = lyricalRiseFall(0.05);
  const waltzPeak = lyricalRiseFall(0.55);
  assert.ok(waltzPeak.rise > waltzLow.rise);
  assert.ok(waltzLow.rise >= 0 && waltzPeak.rise <= 1);
});

test('extractMusicalBands averages 24 spectrum bins cleanly and handles empty fallback', () => {
  const bands = Array.from({ length: 24 }, (_, idx) =>
    idx < 4 ? 0.9 : idx < 10 ? 0.6 : idx < 17 ? 0.4 : 0.2,
  );
  const parsed = extractMusicalBands(makeMetrics({ spectrumBands: bands }));
  assert.ok(Math.abs(parsed.subBass - 0.9) < 1e-6);
  assert.ok(Math.abs(parsed.lowMid - 0.6) < 1e-6);
  assert.ok(Math.abs(parsed.highMid - 0.4) < 1e-6);
  assert.ok(Math.abs(parsed.brilliance - 0.2) < 1e-6);

  const fallback = extractMusicalBands(
    makeMetrics({ bass: 0.77, mid: 0.44, treble: 0.22, spectrumBands: [] }),
  );
  assert.equal(fallback.subBass, 0.77);
  assert.equal(fallback.lowMid, 0.44);
  assert.equal(fallback.highMid, 0.44);
  assert.equal(fallback.brilliance, 0.22);
});
