import { BeatDetector, type AudioMetrics } from './beatDetector';
import type { DanceStyle } from '../dance/choreography';

export type AudioSourceMode = 'synth' | 'file' | 'mic';

export interface SynthTrackMeta {
  id: string;
  title: string;
  subtitle: string;
  bpm: number;
  suggestedStyle: Exclude<DanceStyle, 'auto'>;
  bassNotes: number[];
  leadNotes: number[];
  chordRoot: number[];
  hasThreeFourFeel?: boolean;
}

export const SYNTH_TRACKS: SynthTrackMeta[] = [
  {
    id: 'neon-funk',
    title: 'Neon Funk',
    subtitle: '放克贝斯与律动鼓组',
    bpm: 116,
    suggestedStyle: 'hiphop',
    bassNotes: [55, 0, 55, 65.41, 73.42, 0, 82.41, 65.41],
    leadNotes: [220, 261.63, 329.63, 392, 440, 392, 329.63, 293.66],
    chordRoot: [110, 146.83, 130.81, 98],
  },
  {
    id: 'starlight-pop',
    title: 'Starlight Pop',
    subtitle: '明快电子流行舞曲',
    bpm: 128,
    suggestedStyle: 'idol',
    bassNotes: [65.41, 65.41, 73.42, 0, 82.41, 82.41, 98, 73.42],
    leadNotes: [523.25, 659.25, 783.99, 659.25, 587.33, 659.25, 783.99, 1046.5],
    chordRoot: [130.81, 146.83, 164.81, 196],
  },
  {
    id: 'cyber-robot',
    title: 'Cyber Mechanics',
    subtitle: '重低音机械电子节拍',
    bpm: 104,
    suggestedStyle: 'robot',
    bassNotes: [49, 0, 49, 0, 58.27, 49, 0, 65.41],
    leadNotes: [196, 0, 293.66, 261.63, 196, 392, 0, 329.63],
    chordRoot: [98, 98, 116.54, 130.81],
  },
  {
    id: 'midnight-waltz',
    title: 'Midnight Waltz',
    subtitle: '舒展三拍子梦幻合成器',
    bpm: 92,
    suggestedStyle: 'waltz',
    bassNotes: [65.41, 0, 0, 73.42, 0, 0, 82.41, 0, 0, 73.42, 0, 0],
    leadNotes: [392, 440, 523.25, 493.88, 440, 392, 329.63, 392, 440, 392, 349.23, 329.63],
    chordRoot: [130.81, 146.83, 164.81, 146.83],
    hasThreeFourFeel: true,
  },
];

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private frequencyData = new Uint8Array(512);
  private syntheticBins = new Uint8Array(512);
  private readonly detector = new BeatDetector({ bandCount: 24 });

  private sourceMode: AudioSourceMode = 'synth';
  private activeTrack: SynthTrackMeta = SYNTH_TRACKS[0];
  private isPlaying = false;
  private volume = 0.75;

  // Synth scheduler state
  private schedulerTimer: number | null = null;
  private nextStepTime = 0;
  private currentStep = 0;
  private fallbackClockSec = 0;

  // Local file state
  private audioEl: HTMLAudioElement | null = null;
  private mediaElSource: MediaElementAudioSourceNode | null = null;
  private currentFileUrl: string | null = null;

  // Microphone state
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  public getTrack(): SynthTrackMeta {
    return this.activeTrack;
  }

  public getSourceMode(): AudioSourceMode {
    return this.sourceMode;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
    }
    if (this.audioEl) {
      this.audioEl.volume = this.volume;
    }
  }

  public selectSynthTrack(trackId: string): SynthTrackMeta {
    const found = SYNTH_TRACKS.find((t) => t.id === trackId) ?? SYNTH_TRACKS[0];
    this.activeTrack = found;
    this.sourceMode = 'synth';
    this.stopMicStream();
    if (this.audioEl) {
      this.audioEl.pause();
    }
    this.detector.setKnownBpm(found.bpm);
    this.currentStep = 0;
    if (this.ctx) {
      this.nextStepTime = this.ctx.currentTime + 0.04;
    }
    return found;
  }

  public async resumeIfNeeded(): Promise<void> {
    if (this.isPlaying && this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
        if (this.sourceMode === 'synth') {
          this.nextStepTime = this.ctx.currentTime + 0.03;
          this.startSynthScheduler();
        }
      } catch {
        // Ignore if browser still blocks
      }
    }
  }

  public async play(): Promise<void> {
    this.ensureAudioGraph();
    this.isPlaying = true;

    if (this.sourceMode === 'synth') {
      this.detector.setKnownBpm(this.activeTrack.bpm);
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // Headless or blocked autoplay continues with synthetic clock envelope
      }
    }

    if (!this.isPlaying) return;

    if (this.sourceMode === 'synth') {
      this.startSynthScheduler();
    } else if (this.sourceMode === 'file' && this.audioEl) {
      try {
        await this.audioEl.play();
      } catch {
        // Ignore browser autoplay rejection if triggered programmatically
      }
    }
  }

  public pause(): void {
    this.isPlaying = false;
    this.stopSynthScheduler();
    if (this.audioEl && !this.audioEl.paused) {
      this.audioEl.pause();
    }
  }

  public async loadAudioFile(file: File): Promise<string> {
    this.ensureAudioGraph();
    this.stopSynthScheduler();
    this.stopMicStream();

    if (this.currentFileUrl) {
      URL.revokeObjectURL(this.currentFileUrl);
      this.currentFileUrl = null;
    }

    const url = URL.createObjectURL(file);
    this.currentFileUrl = url;

    if (!this.audioEl) {
      this.audioEl = new Audio();
      this.audioEl.crossOrigin = 'anonymous';
      this.audioEl.loop = true;
      this.audioEl.volume = this.volume;
    }

    this.audioEl.src = url;

    if (this.ctx && this.analyser && !this.mediaElSource) {
      this.mediaElSource = this.ctx.createMediaElementSource(this.audioEl);
      this.mediaElSource.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }

    this.sourceMode = 'file';
    this.detector.reset(118);
    await this.play();
    return file.name;
  }

  public async enableMicrophone(): Promise<void> {
    this.ensureAudioGraph();
    this.stopSynthScheduler();
    if (this.audioEl) {
      this.audioEl.pause();
    }
    this.stopMicStream();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风实时输入');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    if (!this.ctx || !this.analyser) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('音频分析器初始化失败');
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // Disconnect analyser from speakers when listening to mic to prevent feedback howl
    try {
      this.analyser.disconnect(this.ctx.destination);
    } catch {
      // Already disconnected
    }

    this.micStream = stream;
    this.micSource = this.ctx.createMediaStreamSource(stream);
    this.micSource.connect(this.analyser);
    this.sourceMode = 'mic';
    this.isPlaying = true;
    this.detector.reset(112);
  }

  public disableMicrophone(): void {
    this.stopMicStream();
    if (this.ctx && this.analyser && this.masterGain) {
      try {
        this.analyser.connect(this.masterGain);
      } catch {
        // Already connected
      }
    }
    this.sourceMode = 'synth';
    this.isPlaying = false;
  }

  public sampleMetrics(dt: number): AudioMetrics {
    const safeDt = Math.max(0.001, Math.min(dt, 0.2));

    if (!this.isPlaying) {
      this.frequencyData.fill(0);
      return this.detector.update(
        this.frequencyData,
        this.ctx?.sampleRate ?? 48000,
        this.analyser?.fftSize ?? 1024,
        safeDt,
        this.sourceMode === 'synth' ? this.activeTrack.bpm : undefined,
      );
    }

    const canUseLiveAnalyser =
      this.analyser && this.ctx && this.ctx.state === 'running';

    if (canUseLiveAnalyser && this.analyser && this.ctx) {
      this.analyser.getByteFrequencyData(this.frequencyData);
      // Verify if live buffer actually has signal; if synth running in muted context, blend fallback
      let energySum = 0;
      for (let i = 0; i < 64; i++) energySum += this.frequencyData[i];

      if (energySum > 4 || this.sourceMode !== 'synth') {
        return this.detector.update(
          this.frequencyData,
          this.ctx.sampleRate,
          this.analyser.fftSize,
          safeDt,
          this.sourceMode === 'synth' ? this.activeTrack.bpm : undefined,
        );
      }
    }

    // Deterministic synthetic spectrum fallback when browser audio context is muted/suspended (e.g. ?autostart=1)
    this.fallbackClockSec += safeDt;
    this.fillSyntheticSpectrum(this.syntheticBins, this.fallbackClockSec);
    return this.detector.update(
      this.syntheticBins,
      48000,
      1024,
      safeDt,
      this.activeTrack.bpm,
    );
  }

  public dispose(): void {
    this.pause();
    this.stopMicStream();
    if (this.currentFileUrl) {
      URL.revokeObjectURL(this.currentFileUrl);
      this.currentFileUrl = null;
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  private ensureAudioGraph(): void {
    if (this.ctx) {
      if (this.sourceMode === 'synth' && this.analyser && this.masterGain) {
        try {
          this.analyser.connect(this.masterGain);
        } catch {
          // Ignore duplicate connect
        }
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    analyser.minDecibels = -85;
    analyser.maxDecibels = -18;

    const masterGain = ctx.createGain();
    masterGain.gain.value = this.volume;

    analyser.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Pre-generate 1s white noise buffer for snare & hi-hat synthesis
    const bufferSize = ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const channelData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = Math.random() * 2 - 1;
    }

    this.ctx = ctx;
    this.analyser = analyser;
    this.masterGain = masterGain;
    this.noiseBuffer = noiseBuffer;
    this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
  }

  private startSynthScheduler(): void {
    this.stopSynthScheduler();
    if (!this.ctx) return;
    this.nextStepTime = Math.max(this.nextStepTime, this.ctx.currentTime + 0.03);

    const scheduleLookahead = () => {
      if (!this.isPlaying || this.sourceMode !== 'synth' || !this.ctx) return;
      const scheduleAheadSec = 0.14;
      const stepsPerBeat = this.activeTrack.hasThreeFourFeel ? 3 : 4;
      const stepDuration = 60 / this.activeTrack.bpm / stepsPerBeat;

      while (this.nextStepTime < this.ctx.currentTime + scheduleAheadSec) {
        this.triggerSynthStep(this.currentStep, this.nextStepTime, stepDuration);
        this.nextStepTime += stepDuration;
        this.currentStep += 1;
      }
    };

    scheduleLookahead();
    this.schedulerTimer = window.setInterval(scheduleLookahead, 25);
  }

  private stopSynthScheduler(): void {
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private stopMicStream(): void {
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
  }

  private triggerSynthStep(step: number, time: number, stepDur: number): void {
    if (!this.ctx || !this.analyser || this.ctx.state !== 'running') return;

    const track = this.activeTrack;
    if (track.hasThreeFourFeel) {
      const stepInMeasure = step % 6;
      if (stepInMeasure === 0) this.playKick(time, 0.72);
      if (stepInMeasure === 3) this.playSnare(time, 0.25);
      if (stepInMeasure % 2 === 1) this.playHiHat(time, 0.12);
    } else {
      const stepInBar = step % 16;
      // Kick on 0, 4, 8, 12 (+ syncopated groove on 10 for funk/robot)
      if (
        stepInBar % 4 === 0 ||
        (track.id === 'neon-funk' && stepInBar === 10) ||
        (track.id === 'cyber-robot' && stepInBar === 14)
      ) {
        this.playKick(time, stepInBar % 8 === 0 ? 0.95 : 0.78);
      }
      // Snare / Clap on 4 & 12
      if (stepInBar === 4 || stepInBar === 12) {
        this.playSnare(time, 0.42);
      }
      // Crisp hi-hats
      if (stepInBar % 2 === 0 || (track.id === 'starlight-pop' && stepInBar % 4 === 3)) {
        this.playHiHat(time, stepInBar % 4 === 2 ? 0.22 : 0.11);
      }
      // Chord stab on phrase hits
      if (stepInBar === 0 || stepInBar === 6 || stepInBar === 12) {
        const chordIdx = Math.floor(step / 16) % track.chordRoot.length;
        this.playChordStab(time, track.chordRoot[chordIdx], stepDur * 2.2);
      }
    }

    const bassFreq = track.bassNotes[step % track.bassNotes.length];
    if (bassFreq > 0) {
      this.playBassNote(time, bassFreq, stepDur * 1.35);
    }

    const leadFreq = track.leadNotes[step % track.leadNotes.length];
    if (leadFreq > 0 && (track.hasThreeFourFeel || step % 2 === 0)) {
      this.playLeadPluck(time, leadFreq, stepDur * 1.4);
    }
  }

  private playKick(time: number, gainPeak: number): void {
    if (!this.ctx || !this.analyser) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, time);
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.11);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(gainPeak, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.24);

    osc.connect(gain);
    gain.connect(this.analyser);
    osc.start(time);
    osc.stop(time + 0.26);
  }

  private playSnare(time: number, gainPeak: number): void {
    if (!this.ctx || !this.analyser || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1900, time);
    filter.Q.setValueAtTime(0.85, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.analyser);
    noise.start(time);
    noise.stop(time + 0.18);
  }

  private playHiHat(time: number, gainPeak: number): void {
    if (!this.ctx || !this.analyser || !this.noiseBuffer) return;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7200, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.analyser);
    noise.start(time);
    noise.stop(time + 0.07);
  }

  private playBassNote(time: number, freq: number, dur: number): void {
    if (!this.ctx || !this.analyser) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(920, time);
    filter.frequency.exponentialRampToValueAtTime(220, time + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.32, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.analyser);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private playLeadPluck(time: number, freq: number, dur: number): void {
    if (!this.ctx || !this.analyser) return;
    const osc = this.ctx.createOscillator();
    osc.type = this.activeTrack.id === 'cyber-robot' ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3400, time);
    filter.frequency.exponentialRampToValueAtTime(900, time + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.14, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.analyser);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private playChordStab(time: number, rootFreq: number, dur: number): void {
    if (!this.ctx || !this.analyser) return;
    const ratios = [1, 1.25, 1.5];
    for (const ratio of ratios) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(rootFreq * ratio * 2, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.06, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc.connect(gain);
      gain.connect(this.analyser);
      osc.start(time);
      osc.stop(time + dur + 0.03);
    }
  }

  private fillSyntheticSpectrum(target: Uint8Array, elapsedSec: number): void {
    const bps = this.activeTrack.bpm / 60;
    const beatPos = elapsedSec * bps;
    const frac = beatPos - Math.floor(beatPos);
    const kickEnv = Math.exp(-frac * 4.2);
    const snareFrac = (beatPos + 0.5) - Math.floor(beatPos + 0.5);
    const snareEnv = 0.25 + (Math.floor(beatPos) % 2 === 1 ? Math.exp(-snareFrac * 5.2) * 0.75 : 0.18);
    const hatFrac = (beatPos * 2) - Math.floor(beatPos * 2);
    const hatEnv = 0.22 + Math.exp(-hatFrac * 6.5) * 0.78;

    for (let i = 0; i < target.length; i++) {
      if (i < 6) {
        target[i] = Math.round(70 + kickEnv * 185);
      } else if (i < 48) {
        const wave = 0.5 + 0.5 * Math.sin(elapsedSec * 4.2 + i * 0.28);
        target[i] = Math.round((snareEnv * 0.6 + wave * 0.4) * 215);
      } else if (i < 220) {
        const shimmer = 0.5 + 0.5 * Math.cos(elapsedSec * 7.5 + i * 0.12);
        target[i] = Math.round((hatEnv * 0.55 + shimmer * 0.45) * 185);
      } else {
        target[i] = Math.round(hatEnv * 95);
      }
    }
  }
}
