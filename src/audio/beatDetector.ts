export interface AudioMetrics {
  bass: number;
  mid: number;
  treble: number;
  overall: number;
  beatPulse: number;
  beatCount: number;
  beatPhase: number;
  bpm: number;
  isBeatOnset: boolean;
  spectrumBands: number[];
}

export interface BeatDetectorConfig {
  bandCount?: number;
  minBpm?: number;
  maxBpm?: number;
  beatCooldownSec?: number;
  onsetThresholdRatio?: number;
}

const DEFAULT_BAND_COUNT = 24;

export class BeatDetector {
  private readonly bandCount: number;
  private readonly minBpm: number;
  private readonly maxBpm: number;
  private readonly beatCooldownSec: number;
  private readonly onsetThresholdRatio: number;

  private bass = 0;
  private mid = 0;
  private treble = 0;
  private overall = 0;
  private beatPulse = 0;
  private beatCount = 0;
  private beatPhase = 0;
  private bpm = 116;

  private avgBassEnergy = 0.12;
  private timeSinceLastBeat = 1.0;
  private recentBeatIntervals: number[] = [];
  private prevBands: number[];

  constructor(config: BeatDetectorConfig = {}) {
    this.bandCount = config.bandCount ?? DEFAULT_BAND_COUNT;
    this.minBpm = config.minBpm ?? 68;
    this.maxBpm = config.maxBpm ?? 175;
    this.beatCooldownSec = config.beatCooldownSec ?? 0.24;
    this.onsetThresholdRatio = config.onsetThresholdRatio ?? 1.32;
    this.prevBands = new Array(this.bandCount).fill(0);
  }

  public reset(initialBpm = 116): void {
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
    this.overall = 0;
    this.beatPulse = 0;
    this.beatCount = 0;
    this.beatPhase = 0;
    this.bpm = clamp(initialBpm, this.minBpm, this.maxBpm);
    this.avgBassEnergy = 0.12;
    this.timeSinceLastBeat = 1.0;
    this.recentBeatIntervals = [];
    this.prevBands.fill(0);
  }

  public setKnownBpm(bpm: number): void {
    if (Number.isFinite(bpm) && bpm > 0) {
      this.bpm = clamp(bpm, this.minBpm, this.maxBpm);
    }
  }

  public update(
    frequencyBins: ArrayLike<number>,
    sampleRate: number,
    fftSize: number,
    dt: number,
    knownBpm?: number,
  ): AudioMetrics {
    const safeDt = clamp(Number.isFinite(dt) ? dt : 0.016, 0.001, 0.2);

    if (knownBpm && Number.isFinite(knownBpm)) {
      this.bpm = clamp(knownBpm, this.minBpm, this.maxBpm);
    }

    const binCount = frequencyBins.length;
    const nyquist = sampleRate > 0 ? sampleRate * 0.5 : 22050;
    const hzPerBin = binCount > 0 ? nyquist / binCount : nyquist / (fftSize * 0.5 || 512);

    // Extract raw band energies
    const rawBass = computeRangeEnergy(frequencyBins, hzPerBin, 20, 180);
    const rawMid = computeRangeEnergy(frequencyBins, hzPerBin, 180, 2200);
    const rawTreble = computeRangeEnergy(frequencyBins, hzPerBin, 2200, 12000);
    const rawOverall = rawBass * 0.45 + rawMid * 0.35 + rawTreble * 0.2;

    // Fast attack, smooth exponential release
    this.bass = smoothEnvelope(this.bass, rawBass, 26, 8, safeDt);
    this.mid = smoothEnvelope(this.mid, rawMid, 24, 9, safeDt);
    this.treble = smoothEnvelope(this.treble, rawTreble, 28, 12, safeDt);
    this.overall = smoothEnvelope(this.overall, rawOverall, 22, 8, safeDt);

    // Log-spaced spectrum bands for stage equalizer & UI bar meter
    const spectrumBands = extractLogSpectrum(
      frequencyBins,
      hzPerBin,
      this.bandCount,
      this.prevBands,
      safeDt,
    );
    this.prevBands = spectrumBands;

    // Decay beat pulse prior to checking for new beat onset
    this.beatPulse = Math.max(0, this.beatPulse * Math.exp(-6.5 * safeDt));

    // Beat onset detection using adaptive bass average
    this.timeSinceLastBeat += safeDt;
    const avgAlpha = 1 - Math.exp(-2.4 * safeDt);
    this.avgBassEnergy = this.avgBassEnergy + (rawBass - this.avgBassEnergy) * avgAlpha;

    let isBeatOnset = false;
    const threshold = Math.max(0.18, this.avgBassEnergy * this.onsetThresholdRatio);

    if (
      rawBass > threshold &&
      rawBass - this.avgBassEnergy > 0.06 &&
      this.timeSinceLastBeat >= this.beatCooldownSec
    ) {
      isBeatOnset = true;
      if (!knownBpm && this.timeSinceLastBeat >= 0.28 && this.timeSinceLastBeat <= 1.2) {
        this.recordBeatInterval(this.timeSinceLastBeat);
      }
      this.timeSinceLastBeat = 0;
      this.beatPulse = 1.0;

      // Snap beat phase cleanly toward beat boundary when a clear onset fires
      if (!knownBpm) {
        this.beatCount += 1;
        this.beatPhase = 0;
      }
    }

    // Advance phase continuously based on BPM
    const beatsPerSecond = this.bpm / 60;
    const phaseDelta = beatsPerSecond * safeDt;
    const nextPhase = this.beatPhase + phaseDelta;

    if (nextPhase >= 1.0) {
      const wrappedBeats = Math.floor(nextPhase);
      this.beatPhase = nextPhase - wrappedBeats;
      if (knownBpm || !isBeatOnset) {
        this.beatCount += wrappedBeats;
      }
      // Subtle synthetic pulse on grid downbeat if track has known BPM & audio signal is active
      if (knownBpm && rawOverall > 0.04) {
        this.beatPulse = Math.max(this.beatPulse, 0.72);
        isBeatOnset = true;
      }
    } else {
      this.beatPhase = nextPhase;
    }

    return {
      bass: clamp(this.bass, 0, 1),
      mid: clamp(this.mid, 0, 1),
      treble: clamp(this.treble, 0, 1),
      overall: clamp(this.overall, 0, 1),
      beatPulse: clamp(this.beatPulse, 0, 1),
      beatCount: this.beatCount,
      beatPhase: clamp(this.beatPhase, 0, 0.999999),
      bpm: Math.round(this.bpm),
      isBeatOnset,
      spectrumBands,
    };
  }

  private recordBeatInterval(intervalSec: number): void {
    this.recentBeatIntervals.push(intervalSec);
    if (this.recentBeatIntervals.length > 8) {
      this.recentBeatIntervals.shift();
    }
    if (this.recentBeatIntervals.length < 3) return;

    const sorted = [...this.recentBeatIntervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    let estimatedBpm = 60 / median;
    while (estimatedBpm < this.minBpm) estimatedBpm *= 2;
    while (estimatedBpm > this.maxBpm) estimatedBpm /= 2;

    // Smooth BPM update so tempo never jitters wildly
    this.bpm = this.bpm * 0.75 + clamp(estimatedBpm, this.minBpm, this.maxBpm) * 0.25;
  }
}

export function computeRangeEnergy(
  bins: ArrayLike<number>,
  hzPerBin: number,
  minHz: number,
  maxHz: number,
): number {
  if (bins.length === 0 || hzPerBin <= 0) return 0;
  const start = clamp(Math.floor(minHz / hzPerBin), 0, bins.length - 1);
  const end = clamp(Math.ceil(maxHz / hzPerBin), start, bins.length - 1);

  let sum = 0;
  let peak = 0;
  let count = 0;

  for (let i = start; i <= end; i++) {
    const val = (bins[i] ?? 0) / 255;
    sum += val;
    if (val > peak) peak = val;
    count++;
  }

  if (count === 0) return 0;
  const avg = sum / count;
  // Blend average & peak for punchy musical response
  return clamp(avg * 0.65 + peak * 0.35, 0, 1);
}

function extractLogSpectrum(
  bins: ArrayLike<number>,
  hzPerBin: number,
  bandCount: number,
  prevBands: number[],
  dt: number,
): number[] {
  const result = new Array<number>(bandCount);
  if (bins.length === 0 || hzPerBin <= 0) {
    result.fill(0);
    return result;
  }

  const minFreq = 35;
  const maxFreq = 6500;
  const logRatio = maxFreq / minFreq;

  for (let b = 0; b < bandCount; b++) {
    const f0 = minFreq * Math.pow(logRatio, b / bandCount);
    const f1 = minFreq * Math.pow(logRatio, (b + 1) / bandCount);
    const raw = computeRangeEnergy(bins, hzPerBin, f0, f1);
    const prev = prevBands[b] ?? 0;
    result[b] = smoothEnvelope(prev, raw, 28, 11, dt);
  }

  return result;
}

function smoothEnvelope(
  current: number,
  target: number,
  attackRate: number,
  releaseRate: number,
  dt: number,
): number {
  const rate = target >= current ? attackRate : releaseRate;
  const alpha = 1 - Math.exp(-rate * dt);
  return current + (target - current) * alpha;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
