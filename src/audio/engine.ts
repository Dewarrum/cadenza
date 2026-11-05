// Audio engine. The AudioContext is the master clock: song time is derived from the time the
// listener currently hears, notes are scheduled ahead on the context timeline, and taps are
// converted from event timestamps onto the same timeline.
import type { AutoNote, Chart, PlayNote } from "../game/chart.ts";
import { loadPiano, type Piano } from "./piano.ts";

const LOOKAHEAD_MS = 200;
const SCHEDULER_INTERVAL_MS = 25;
const HOLD_RELEASE_S = 0.15; // damper when a hold is let go early
const COUNT_IN_BEATS = 4;
const LEAD_IN_MS = 600; // silence before the first count-in click

// Song clock in ms. now() is what the player hears; fromEvent() maps an event timestamp
// (performance.now() timebase); toAudio() maps song time onto the AudioContext timeline.
export interface Clock {
  now(): number;
  fromEvent(timeStamp: number): number;
  toAudio(songMs: number): number;
}

export class AudioClock implements Clock {
  private readonly ctx: AudioContext;
  private readonly origin: number; // context time of song time 0

  constructor(ctx: AudioContext, songMsNow: number) {
    this.ctx = ctx;
    this.origin = this.heard(performance.now()) - songMsNow / 1000;
  }

  // Context time of the sample reaching the speakers at `perfTime`.
  private heard(perfTime: number): number {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts?.contextTime && ts.performanceTime) return ts.contextTime + (perfTime - ts.performanceTime) / 1000;
    return this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0);
  }

  now(): number {
    return (this.heard(performance.now()) - this.origin) * 1000;
  }

  fromEvent(timeStamp: number): number {
    return (this.heard(timeStamp) - this.origin) * 1000;
  }

  toAudio(songMs: number): number {
    return this.origin + songMs / 1000;
  }
}

// Test clock driven by the e2e bot through window.__cadenza; audio then plays "now".
export class ManualClock implements Clock {
  time = 0;
  private readonly ctx: AudioContext;
  constructor(ctx: AudioContext, start: number) {
    this.ctx = ctx;
    this.time = start;
  }
  now = () => this.time;
  fromEvent = () => this.time;
  toAudio = () => this.ctx.currentTime;
}

export type Voice = { stop: (time?: number) => void; holdEnd: number };

export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly out: GainNode;
  private piano: Piano | null = null;
  private loading: Promise<Piano> | null = null;
  private timer = 0;
  private clock: Clock | null = null;
  private auto: AutoNote[] = [];
  private cursor = 0;
  keySound = true;

  // Must run inside a user gesture so browsers allow audio.
  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    void this.ctx.resume();
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.connect(this.ctx.destination);
    this.out = this.ctx.createGain();
    this.out.gain.value = 2; // smplr maps velocity to gain quadratically, so p passages are quiet; the compressor catches peaks
    this.out.connect(compressor);
  }

  get pianoReady(): boolean {
    return this.piano !== null;
  }

  loadPiano(onProgress: (fraction: number) => void): Promise<Piano> {
    this.loading ??= loadPiano(this.ctx, this.out, onProgress).then((p) => (this.piano = p));
    return this.loading;
  }

  // Starts a song with the count-in; returns the clock. Song time 0 is the first note.
  start(chart: Chart, manualClock: boolean): Clock {
    this.stop();
    const firstClick = chart.bars[0] - COUNT_IN_BEATS * chart.beatMs;
    const startAt = Math.min(firstClick, -1500) - LEAD_IN_MS;
    const clock = manualClock ? new ManualClock(this.ctx, startAt) : new AudioClock(this.ctx, startAt);
    this.clock = clock;
    for (let i = 0; i < COUNT_IN_BEATS; i++) this.click(clock.toAudio(firstClick + i * chart.beatMs), i === 0);
    this.auto = chart.auto;
    this.cursor = 0;
    this.timer = window.setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
    this.schedule();
    return clock;
  }

  stop(): void {
    clearInterval(this.timer);
    this.piano?.stop();
    this.clock = null;
  }

  // Plays a chart note for a hit at song time `at`: an early hit sounds at the target time,
  // a late hit sounds immediately. With key sound off the note already plays by itself.
  hit(note: PlayNote): Voice | null {
    if (!this.keySound || !this.piano || !this.clock) return null;
    const time = Math.max(this.clock.toAudio(note.time), this.ctx.currentTime);
    const stop = this.piano.start({
      note: note.pitch,
      velocity: note.velocity,
      time,
      duration: note.duration / 1000,
      ampRelease: note.hold ? HOLD_RELEASE_S : undefined,
    });
    return { stop, holdEnd: note.time + note.hold };
  }

  // A hold let go before its end is damped; after the end it rings to its written length.
  release(voice: Voice | null, songMs: number): void {
    if (voice && songMs < voice.holdEnd) voice.stop(this.ctx.currentTime);
  }

  private schedule(): void {
    if (!this.piano || !this.clock) return;
    const horizon = this.clock.now() + LOOKAHEAD_MS;
    while (this.cursor < this.auto.length && this.auto[this.cursor].time <= horizon) {
      const n = this.auto[this.cursor++];
      const time = Math.max(this.clock.toAudio(n.time), this.ctx.currentTime);
      this.piano.start({ note: n.pitch, velocity: n.velocity, time, duration: n.duration / 1000 });
    }
  }

  private click(time: number, accent: boolean): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1320;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.08, time + 0.003);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    osc.connect(env).connect(this.out);
    osc.start(time);
    osc.stop(time + 0.08);
  }
}
