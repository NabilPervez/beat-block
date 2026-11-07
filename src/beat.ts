// TR-05: one source of truth for beat time. Audio schedules from it, input stamps drops against it
// (S2), the renderer pulses from it. Time source: AudioContext.currentTime when running, else
// performance.now(). Only advances while the run is playing, so pause stops the beat.

export const BEAT_CONFIG = {
  windowMs: 90,      // GDD-BEAT-01 on-beat window (estimate, tune in playtest)
  perfectMs: 45,     // S3: PERFECT tier inside the window (estimate, tune in Playtest 1)
  wideWindowMs: 150, // GDD-BEAT-04 accessibility setting
  maxBpmGain: 24,    // tempo rises up to +24 BPM over a run (v1 behaviour)
  secPerBpm: 12,     // +1 BPM per 12 s of play
};

export function beatMsFor(bpm: number, runSeconds: number): number {
  return 60000 / (bpm + Math.min(BEAT_CONFIG.maxBpmGain, runSeconds / BEAT_CONFIG.secPerBpm));
}

/** Distance in ms from `tMs` to the nearest beat on a grid starting at `originMs`. Pure: unit-tested. */
export function offBeatMs(tMs: number, originMs: number, beatMs: number, offsetMs = 0): number {
  const rel = tMs - offsetMs - originMs;
  const ph = ((rel % beatMs) + beatMs) % beatMs;
  return Math.min(ph, beatMs - ph);
}

export function isOnBeat(tMs: number, originMs: number, beatMs: number, windowMs: number, offsetMs = 0): boolean {
  return offBeatMs(tMs, originMs, beatMs, offsetMs) <= windowMs;
}

export type BeatGrade = "perfect" | "good" | "off";

/** S3: grade a drop by its distance to the nearest beat. Pure: unit-tested. */
export function gradeFor(offMs: number, windowMs: number, perfectMs = BEAT_CONFIG.perfectMs): BeatGrade {
  if (offMs <= Math.min(perfectMs, windowMs)) return "perfect";
  return offMs <= windowMs ? "good" : "off";
}

/** S3: what every visual cue reads. p 0..1 within the beat (offset-aware), n = beat index, msToBeat = ms until the next beat. */
export interface BeatPhase { p: number; n: number; beatMs: number; msToBeat: number; msSinceBeat: number }

export type ClockSource = () => number; // ms

export class BeatClock {
  /** Clock time (ms) of the most recent beat, and its length. */
  lastBeatMs = 0;
  beatMs = 500;
  n = 0;
  private running = false;
  private pausedAt = 0;

  constructor(private now: ClockSource) {}

  setSource(now: ClockSource): void {
    // keep the grid continuous when switching sources (e.g. audio unlocks mid-session)
    const shift = now() - this.now();
    this.lastBeatMs += shift;
    if (!this.running) this.pausedAt += shift;
    this.now = now;
  }

  /** Starts a fresh grid: beat 0 fires on the next `poll`. */
  start(beatMs: number): void {
    this.beatMs = beatMs;
    this.n = 0;
    this.lastBeatMs = this.now() - beatMs;
    this.running = true;
  }

  pause(): void {
    if (!this.running) return;
    this.running = false;
    this.pausedAt = this.now();
  }

  resume(): void {
    if (this.running) return;
    this.lastBeatMs += this.now() - this.pausedAt; // shift the grid by the paused gap
    this.running = true;
  }

  stop(): void { this.running = false; }

  get isRunning(): boolean { return this.running; }

  /** Phase 0..1 within the current beat (for the renderer pulse). */
  phase(): number {
    const t = this.running ? this.now() : this.pausedAt;
    return Math.min(1, Math.max(0, (t - this.lastBeatMs) / this.beatMs));
  }

  /** Advances the grid; returns beats that fired since the last poll (at most `max`, so stalls don't burst). */
  poll(beatMs: number, max = 2): number[] {
    if (!this.running) return [];
    const t = this.now();
    const fired: number[] = [];
    while (t - this.lastBeatMs >= this.beatMs) {
      this.lastBeatMs += this.beatMs;
      if (fired.length < max) fired.push(this.n);
      this.n++;
      this.beatMs = beatMs; // tempo changes apply from the next beat
    }
    return fired;
  }

  /** S3: offset-aware phase for the visual cues. The grid shifts by the calibration offset so cues match what the player hears. */
  beatPhase(offsetMs = 0): BeatPhase {
    const t = (this.running ? this.now() : this.pausedAt) - offsetMs;
    const rel = t - this.lastBeatMs;
    const k = Math.floor(rel / this.beatMs);
    const since = rel - k * this.beatMs;
    return { p: since / this.beatMs, n: this.n + k, beatMs: this.beatMs, msToBeat: this.beatMs - since, msSinceBeat: since };
  }

  grade(windowMs: number, offsetMs = 0, perfectMs = BEAT_CONFIG.perfectMs): BeatGrade {
    return gradeFor(offBeatMs(this.now(), this.lastBeatMs, this.beatMs, offsetMs), windowMs, perfectMs);
  }

  onBeat(windowMs: number, offsetMs = 0): boolean {
    return isOnBeat(this.now(), this.lastBeatMs, this.beatMs, windowMs, offsetMs);
  }

  time(): number { return this.now(); }
}

/**
 * GDD-BEAT-05: offset from tap-along calibration. Each tap is matched to its nearest click
 * (first click at `firstBeatMs`), taps more than half a beat out are ignored, and the median
 * error is returned, rounded and clamped to ±300 ms. Needs at least half the beats tapped.
 */
export function calibrationOffset(taps: number[], firstBeatMs: number, beatMs: number, beats: number): number | null {
  const errs: number[] = [];
  for (const t of taps) {
    const k = Math.round((t - firstBeatMs) / beatMs);
    if (k < 0 || k >= beats) continue;
    const e = t - (firstBeatMs + k * beatMs);
    if (Math.abs(e) < beatMs / 2) errs.push(e);
  }
  if (errs.length < Math.ceil(beats / 2)) return null;
  errs.sort((a, b) => a - b);
  const m = errs.length % 2 ? errs[(errs.length - 1) / 2] : (errs[errs.length / 2 - 1] + errs[errs.length / 2]) / 2;
  return Math.max(-300, Math.min(300, Math.round(m)));
}
