// One play-through: routes presses and releases to the judge, tracks holds and combo, and asks
// the audio engine to sound hit notes. Times are song-clock ms.
import type { Voice } from "../audio/engine.ts";
import type { Chart, PlayNote } from "./chart.ts";
import { holdFraction, isExpired, judgeDelta, pickNote, type Judgement } from "./judge.ts";
import { isBroken, summarize, type NoteResult, type Summary } from "./score.ts";

export type Source = number | "any"; // a lane key, or Space (hits any lane on Easy)

export type NoteState = "open" | "holding" | "done";

export type Sound = {
  hit(note: PlayNote): Voice | null;
  release(voice: Voice | null, songMs: number): void;
};

type ActiveHold = { index: number; judgement: Judgement; voice: Voice | null };

const END_PAUSE_MS = 1500; // results show this long after the last note ends

export class Play {
  readonly chart: Chart;
  readonly states: NoteState[];
  readonly results: (NoteResult | null)[];
  readonly pressed = [false, false, false, false];
  combo = 0;
  last: { judgement: Judgement; time: number; lane: number } | null = null;
  private readonly holds = new Map<Source, ActiveHold>();
  private readonly sound: Sound;
  private readonly offset: number;
  private readonly anyLane: boolean;
  private expiryCursor = 0;

  constructor(chart: Chart, sound: Sound, options: { offset: number; anyLane: boolean }) {
    this.chart = chart;
    this.sound = sound;
    this.offset = options.offset;
    this.anyLane = options.anyLane;
    this.states = chart.notes.map(() => "open");
    this.results = chart.notes.map(() => null);
  }

  press(source: Source, time: number): void {
    if (source === "any" && !this.anyLane) return;
    if (typeof source === "number") this.pressed[source] = true;
    const lane = source === "any" ? null : source;
    const i = pickNote(this.chart.notes, (k) => this.states[k] === "open", lane, time, this.offset);
    if (i < 0) return;
    const note = this.chart.notes[i];
    const judgement = judgeDelta(time - this.offset - note.time)!;
    this.last = { judgement, time, lane: note.lane };
    if (judgement === "miss") return this.finish(i, { judgement });
    const voice = this.sound.hit(note);
    this.combo++;
    if (note.hold > 0) {
      this.states[i] = "holding";
      this.holds.set(source, { index: i, judgement, voice });
    } else {
      this.finish(i, { judgement });
    }
  }

  release(source: Source, time: number): void {
    if (typeof source === "number") this.pressed[source] = false;
    const hold = this.holds.get(source);
    if (!hold) return;
    this.holds.delete(source);
    const note = this.chart.notes[hold.index];
    this.sound.release(hold.voice, time);
    this.finish(hold.index, { judgement: hold.judgement, holdFraction: holdFraction(note.time, note.hold, time, this.offset) });
  }

  // Lanes that should light up: pressed keys plus lanes of holds kept by Space.
  litLanes(): boolean[] {
    const lit = [...this.pressed];
    for (const h of this.holds.values()) lit[this.chart.notes[h.index].lane] = true;
    return lit;
  }

  update(now: number): void {
    const notes = this.chart.notes;
    while (this.expiryCursor < notes.length && isExpired(notes[this.expiryCursor].time, now, this.offset)) {
      const i = this.expiryCursor++;
      if (this.states[i] === "open") {
        this.finish(i, { judgement: "miss" });
        this.last = { judgement: "miss", time: now, lane: notes[i].lane };
      }
    }
    for (const [source, hold] of this.holds) {
      const note = notes[hold.index];
      if (now - this.offset >= note.time + note.hold) {
        this.holds.delete(source);
        this.finish(hold.index, { judgement: hold.judgement, holdFraction: 1 });
      }
    }
  }

  finished(now: number): boolean {
    return now > this.chart.end + END_PAUSE_MS && this.holds.size === 0;
  }

  summary(): Summary {
    return summarize(this.results);
  }

  private finish(i: number, result: NoteResult): void {
    this.states[i] = "done";
    this.results[i] = result;
    if (result.judgement === "miss" || isBroken(result)) this.combo = 0;
  }
}
