// Audio engine. The AudioContext is the master clock: song time is derived from the time the
// listener currently hears, notes are scheduled ahead on the context timeline, and taps are
// converted from event timestamps onto the same timeline.
import type { AutoNote, Chart, PlayNote } from "../game/chart.ts";
import type { Run } from "../game/timeline.ts";
import { loadPiano, type Piano } from "./piano.ts";

const LOOKAHEAD_MS = 200; // notes that play by themselves; hit sounds go straight onto the timeline (piano.ts)
const STALE_MS = 100; // a note this late when the timer gets to it is dropped, not played in a burst
const SCHEDULER_INTERVAL_MS = 25;
const HOLD_RELEASE_S = 0.15; // damper when a hold is let go early
const BASE_GAIN = 2; // smplr maps velocity to gain quadratically, so p passages are quiet; the compressor catches peaks

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

  // Context time of the sample reaching the speakers at `perfTime`. A context that is not running
  // stands still: the output timestamp would keep advancing on wall time from its last value.
  private heard(perfTime: number): number {
    const ts = this.ctx.state === "running" ? this.ctx.getOutputTimestamp?.() : undefined;
    if (ts?.contextTime && ts.performanceTime) return ts.contextTime + (perfTime - ts.performanceTime) / 1000;
    return this.ctx.currentTime - reportedLatency(this.ctx);
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

// Output latency the browser reports, in seconds. AudioClock compensates it; it also seeds the
// audio offset shown in the settings.
export function reportedLatency(ctx: AudioContext): number {
  return ctx.outputLatency || ctx.baseLatency || 0;
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
  private clicks: OscillatorNode[] = [];
  keySound = true;
  readonly stats = { scheduled: 0, dropped: 0 }; // notes that play by themselves; dropped = timer came too late

  // Must run inside a user gesture so browsers allow audio.
  constructor() {
    // iOS 17+: the "playback" session plays through the mute switch (16.4 keeps the hint).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    void this.unlock();
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.connect(this.ctx.destination);
    this.out = this.ctx.createGain();
    this.out.gain.value = BASE_GAIN;
    this.out.connect(compressor);
  }

  // Master volume 0-1, applied at once (also mid-piece).
  setVolume(volume: number): void {
    this.out.gain.setTargetAtTime(BASE_GAIN * volume, this.ctx.currentTime, 0.02);
  }

  // Call inside a user gesture: resumes the context, and the silent buffer unlocks iOS Safari.
  unlock(): Promise<void> {
    const silence = this.ctx.createBufferSource();
    silence.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    silence.connect(this.ctx.destination);
    silence.start();
    return this.ctx.resume();
  }

  get pianoReady(): boolean {
    return this.piano !== null;
  }

  loadPiano(onProgress: (fraction: number) => void): Promise<Piano> {
    this.loading ??= loadPiano(this.ctx, this.out, onProgress).then((p) => (this.piano = p));
    return this.loading;
  }

  // Runs the song clock from `run.start` with its count-in; returns the clock. Song time 0 is
  // the first note. Used for the start and for every resume.
  start(chart: Chart, run: Run, manualClock: boolean): Clock {
    this.stop();
    const clock = manualClock ? new ManualClock(this.ctx, run.start) : new AudioClock(this.ctx, run.start);
    this.clock = clock;
    run.clicks.forEach((t, i) => this.click(clock.toAudio(t), i === 0));
    this.auto = chart.auto;
    const from = chart.auto.findIndex((n) => n.time >= run.soundFrom);
    this.cursor = from < 0 ? chart.auto.length : from;
    this.timer = window.setInterval(() => this.schedule(), SCHEDULER_INTERVAL_MS);
    this.schedule();
    return clock;
  }

  // Silences everything this run scheduled: queued and sounding notes and count-in clicks.
  stop(): void {
    clearInterval(this.timer);
    this.piano?.scheduler.stop();
    this.piano?.stop();
    for (const click of this.clicks) click.disconnect();
    this.clicks = [];
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
    const now = this.clock.now();
    while (this.cursor < this.auto.length && this.auto[this.cursor].time <= now + LOOKAHEAD_MS) {
      const n = this.auto[this.cursor++];
      if (n.time < now - STALE_MS) {
        this.stats.dropped++;
        continue;
      }
      const time = Math.max(this.clock.toAudio(n.time), this.ctx.currentTime);
      this.piano.start({ note: n.pitch, velocity: n.velocity, time, duration: n.duration / 1000 });
      this.stats.scheduled++;
    }
  }

  // A count-in click at context time `time`, through the same output path as the piano.
  // Silenced by stop().
  click(time: number, accent: boolean): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1320;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.08, time + 0.003);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
    osc.connect(env).connect(this.out);
    osc.start(time);
    osc.stop(time + 0.08);
    this.clicks.push(osc);
  }
}
