import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStageThemeById,
  STAGE_THEMES,
  summarizeSpectrumForSpotlight,
} from './themes.ts';

test('STAGE_THEMES provides unique valid hex palettes', () => {
  const ids = new Set(STAGE_THEMES.map((t) => t.id));
  assert.equal(ids.size, STAGE_THEMES.length);
  assert.ok(STAGE_THEMES.length >= 5);

  const hexPattern = /^#[0-9a-f]{6}$/i;
  for (const theme of STAGE_THEMES) {
    assert.match(theme.primaryHex, hexPattern);
    assert.match(theme.secondaryHex, hexPattern);
    assert.match(theme.highlightHex, hexPattern);
    assert.match(theme.rimHex, hexPattern);
    assert.match(theme.backgroundHex, hexPattern);
    assert.match(theme.dustHex, hexPattern);
  }

  assert.equal(getStageThemeById('cyber').id, 'cyber');
});

test('summarizeSpectrumForSpotlight distinguishes bass-heavy vs treble-heavy spectra', () => {
  const bassHeavy = new Array(24).fill(0).map((_, i) => (i < 6 ? 0.92 : 0.08));
  const trebleHeavy = new Array(24).fill(0).map((_, i) => (i >= 15 ? 0.9 : 0.1));

  const bassSummary = summarizeSpectrumForSpotlight(bassHeavy);
  const trebleSummary = summarizeSpectrumForSpotlight(trebleHeavy);

  assert.ok(bassSummary.lowEnergy > 0.75);
  assert.ok(bassSummary.spectralTilt < 0.35);

  assert.ok(trebleSummary.highEnergy > 0.75);
  assert.ok(trebleSummary.spectralTilt > 0.65);
});

test('summarizeSpectrumForSpotlight handles empty and non-finite inputs safely', () => {
  const empty = summarizeSpectrumForSpotlight([]);
  assert.equal(empty.lowEnergy, 0);
  assert.equal(empty.spectralTilt, 0.5);

  const noisy = summarizeSpectrumForSpotlight([NaN, Infinity, -2, 0.5]);
  assert.ok(Number.isFinite(noisy.lowEnergy));
  assert.ok(Number.isFinite(noisy.midEnergy));
  assert.ok(Number.isFinite(noisy.highEnergy));
  assert.ok(noisy.spectralTilt >= 0 && noisy.spectralTilt <= 1);
});
